import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { alturasAcimaDoSolo } from '../nucleo/altitude.ts'
import { FonteTerrariumAWS } from '../terreno/terrarium.ts'
import { chaveDaPosicao } from './useCotasTerreno.ts'
import { linhasDaRota, pontos3DdaRota } from './derivados.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Uma rota de `quantos` waypoints a leste, todos a `altura` acima do solo. */
function rota(quantos: number, altura = 60): Rota {
  let r = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  r = { ...r, modoAltitude: 'AGL', alturaMinimaAcimaDoSolo: 30 }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    r = acrescentarWaypoint(r, waypointNovo({ ...ponto, altura, index: i }))
    ponto = deslocar(ponto, 90, 100)
  }
  return r
}

/** Cotas do terreno para todos os waypoints, a `valor` metros. */
function cotasDe(r: Rota, valor = 356): Map<string, number> {
  return new Map(r.waypoints.map((w) => [chaveDaPosicao(w), valor]))
}

// So serve para o `instanceof` da origem da cota; nao vai a rede nenhuma.
const fonte = new FonteTerrariumAWS({
  descodificador: () => Promise.reject(new Error('nao se usa')),
})

function linhas(r: Rota, cotas: Map<string, number>) {
  return linhasDaRota(r, cotas, alturasAcimaDoSolo(r, cotas, chaveDaPosicao), fonte)
}

describe('linhas da lista de waypoints', () => {
  it('uma linha por waypoint, pela mesma ordem', () => {
    const r = rota(4)
    expect(linhas(r, cotasDe(r)).map((l) => l.waypoint.id)).toEqual(r.waypoints.map((w) => w.id))
  })

  it('sem cota do terreno a altura acima do solo fica por saber', () => {
    // Acontece enquanto os mosaicos ainda estao a chegar, e nao e um erro.
    const r = rota(2)
    const lidas = linhas(r, new Map())
    expect(lidas.map((l) => l.acimaDoSolo)).toEqual([null, null])
    expect(lidas.map((l) => l.cotaTerreno)).toEqual([null, null])
    expect(lidas.map((l) => l.origemCota)).toEqual([null, null])
  })

  it('sem cota nao ha alerta: nao se avisa do que nao se sabe', () => {
    const r = rota(2, 5)
    expect(linhas(r, new Map()).every((l) => l.alerta === false)).toBe(true)
  })

  it('abaixo do minimo da rota levanta alerta', () => {
    // Vinte metros acima do solo, com o minimo da rota em trinta.
    const r = rota(3, 20)
    expect(linhas(r, cotasDe(r)).map((l) => l.alerta)).toEqual([true, true, true])
  })

  it('acima do tecto legal levanta alerta', () => {
    const r = rota(2, 150)
    expect(linhas(r, cotasDe(r)).map((l) => l.alerta)).toEqual([true, true])
  })

  it('dentro do intervalo nao levanta nada', () => {
    const r = rota(3, 60)
    expect(linhas(r, cotasDe(r)).map((l) => l.alerta)).toEqual([false, false, false])
  })

  it('o limite conta como aceite, nao como alerta', () => {
    const r = rota(1, 30)
    expect(linhas(r, cotasDe(r))[0]?.alerta).toBe(false)
  })
})

describe('pontos para o mapa em tres dimensoes', () => {
  it('um waypoint sem cota fica de fora', () => {
    /*
     * Sem cota do terreno nao ha altura de voo que se calcule, e desenha-lo ao
     * nivel do mar era pior do que nao o desenhar.
     */
    const r = rota(3)
    const so_um = new Map([[chaveDaPosicao(r.waypoints[0]!), 356]])
    expect(pontos3DdaRota(r, linhas(r, so_um), new Set())).toHaveLength(1)
  })

  it('em AGL a altura de voo e a cota do terreno mais a altura', () => {
    const r = rota(2, 60)
    const pontos = pontos3DdaRota(r, linhas(r, cotasDe(r, 400)), new Set())
    expect(pontos.map((p) => p.alturaVoo)).toEqual([460, 460])
  })

  it('o aparelho so se desenha no waypoint escolhido', () => {
    /*
     * Em todos os waypoints enchia o mapa: numa rota de cobertura sao dezenas,
     * sobrepostos, e o que se via era um tapete de aparelhos.
     */
    const r = rota(5)
    const escolhido = r.waypoints[2]!.id
    const pontos = pontos3DdaRota(r, linhas(r, cotasDe(r)), new Set([escolhido]))

    expect(pontos.filter((p) => p.comAparelho)).toHaveLength(1)
    expect(pontos.filter((p) => p.seleccionado)).toHaveLength(1)
  })

  it('sem nada escolhido nao se desenha aparelho nenhum', () => {
    const r = rota(5)
    const pontos = pontos3DdaRota(r, linhas(r, cotasDe(r)), new Set())
    expect(pontos.some((p) => p.comAparelho)).toBe(false)
  })

  it('a guinada vem do trajecto, e nao de um zero por omissao', () => {
    /*
     * O `modoGuinada` nasce em `followWayline` sem guinada gravada. Le-la como
     * zero punha todos os aparelhos virados a norte, numa rota que anda para
     * leste - e a pre-visualizacao do enquadramento vinha errada com eles.
     */
    const r = rota(3)
    const pontos = pontos3DdaRota(r, linhas(r, cotasDe(r)), new Set())
    expect(pontos[0]?.guinada).toBeCloseTo(90, 1)
  })

  it('o alerta da linha passa para o ponto', () => {
    const r = rota(2, 10)
    const pontos = pontos3DdaRota(r, linhas(r, cotasDe(r)), new Set())
    expect(pontos.every((p) => p.alerta)).toBe(true)
  })
})
