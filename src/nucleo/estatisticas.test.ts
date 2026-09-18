import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './operacoes-rota.ts'
import { deslocar } from './geodesia.ts'
import {
  calcularEstatisticas,
  duracaoDoVooCompleto,
  formatarDuracao,
  formatarDistancia,
} from './estatisticas.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 361.6 }

/** Rota em linha recta, com `troco` metros entre waypoints consecutivos. */
function rotaEmLinha(
  numeroWaypoints: number,
  troco: number,
  opcoes: { velocidade?: number; altura?: number } = {},
): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mavic3t',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, velocidadeGlobal: opcoes.velocidade ?? 10 }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < numeroWaypoints; i++) {
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ ...ponto, altura: opcoes.altura ?? 100, index: i }),
    )
    ponto = deslocar(ponto, 45, troco)
  }
  return rota
}

describe('calcularEstatisticas', () => {
  it('reproduz a estimativa do Pilot 2 para a rota de Sever do Vouga', () => {
    // 89 waypoints, 8385,2 m, 10 m/s, todos a parar no ponto: o simulador
    // mostra 23 m 27 s, ou seja 1407 s.
    const troco = 8385.2 / 88
    const rota = rotaEmLinha(89, troco, { velocidade: 10 })
    const estatisticas = calcularEstatisticas(rota)

    expect(estatisticas.numeroWaypoints).toBe(89)
    expect(estatisticas.distanciaHorizontal).toBeCloseTo(8385.2, 0)

    const desvioRelativo = Math.abs(estatisticas.duracao - 1407) / 1407
    expect(desvioRelativo, `estimado ${formatarDuracao(estatisticas.duracao)}, esperado 23 m 27 s`)
      .toBeLessThan(0.05)
  })

  it('nao penaliza os waypoints de passagem suave', () => {
    const rota = rotaEmLinha(10, 100)
    const comParagem = calcularEstatisticas(rota)
    const semParagem = calcularEstatisticas({
      ...rota,
      waypoints: rota.waypoints.map((w) => ({ ...w, tipoCurva: 'passarSuave' })),
    })

    expect(semParagem.duracao).toBeLessThan(comParagem.duracao)
    // Sem paragens, o tempo e so o percurso a dividir pela velocidade.
    expect(semParagem.duracao).toBeCloseTo(semParagem.distancia3D / 10, 6)
  })

  it('conta a subida entre waypoints na distancia 3D', () => {
    let rota = rotaEmLinha(2, 300)
    const segundo = rota.waypoints[1]
    if (!segundo) throw new Error('waypoint em falta')
    rota = { ...rota, waypoints: [rota.waypoints[0]!, { ...segundo, altura: 500 }] }

    const e = calcularEstatisticas(rota)
    expect(e.distanciaHorizontal).toBeCloseTo(300, 1)
    expect(e.distancia3D).toBeCloseTo(Math.hypot(300, 400), 1)
  })

  it('conta fotos e tempo de pairar', () => {
    let rota = rotaEmLinha(3, 100)
    rota = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) => ({
        ...w,
        acoes:
          i === 1
            ? [{ tipo: 'tirarFoto' as const }, { tipo: 'pairar' as const, segundos: 5 }]
            : [{ tipo: 'tirarFoto' as const }],
      })),
    }

    const semPairar = calcularEstatisticas({
      ...rota,
      waypoints: rota.waypoints.map((w) => ({ ...w, acoes: w.acoes.filter((a) => a.tipo !== 'pairar') })),
    })
    const e = calcularEstatisticas(rota)

    expect(e.numeroFotos).toBe(3)
    expect(e.duracao - semPairar.duracao).toBeCloseTo(5, 6)
  })

  it('devolve zeros para uma rota sem waypoints', () => {
    const e = calcularEstatisticas(rotaEmLinha(0, 100))
    expect(e).toEqual({
      distanciaHorizontal: 0,
      distancia3D: 0,
      duracao: 0,
      numeroWaypoints: 0,
      numeroFotos: 0,
    })
  })

  it('respeita a velocidade propria de um waypoint', () => {
    const rota = rotaEmLinha(2, 100, { velocidade: 10 })
    const segundo = rota.waypoints[1]
    if (!segundo) throw new Error('waypoint em falta')

    const lenta = calcularEstatisticas({
      ...rota,
      waypoints: [rota.waypoints[0]!, { ...segundo, velocidade: 2 }],
    })
    expect(lenta.duracao).toBeGreaterThan(calcularEstatisticas(rota).duracao)
  })
})

describe('formatacao', () => {
  it('escreve a duracao como o Pilot 2', () => {
    expect(formatarDuracao(1407)).toBe('23 m 27 s')
    expect(formatarDuracao(45)).toBe('45 s')
    expect(formatarDuracao(60)).toBe('1 m 0 s')
  })

  it('escreve a distancia com uma casa decimal', () => {
    expect(formatarDistancia(8385.24)).toBe('8385.2 m')
  })
})

describe('velocidade impossivel', () => {
  it('nao deixa a duracao sair infinita com velocidade zero', () => {
    const rota = rotaEmLinha(5, 100, { velocidade: 0 })
    const estatisticas = calcularEstatisticas(rota)

    // Antes disto a barra mostrava "Infinity m NaN s" e a exportacao para o
    // dialeto Pilot 2, que grava a duracao no ficheiro, rebentava.
    expect(Number.isFinite(estatisticas.duracao)).toBe(true)
    expect(formatarDuracao(estatisticas.duracao)).not.toMatch(/NaN|Infinity/)
  })

  it('tambem nao sai infinita com um unico waypoint parado', () => {
    let rota = rotaEmLinha(3, 100, { velocidade: 10 })
    rota = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) => (i === 1 ? { ...w, velocidade: 0 } : w)),
    }
    expect(Number.isFinite(calcularEstatisticas(rota).duracao)).toBe(true)
  })
})

describe('duracaoDoVooCompleto', () => {
  it('conta a ida ao primeiro ponto e o regresso a casa', () => {
    // Cinco waypoints de 200 m, todos a partir da descolagem e para nordeste.
    const rota = rotaEmLinha(5, 200, { velocidade: 10 })
    const soEntreWaypoints = calcularEstatisticas(rota).duracao
    const voo = duracaoDoVooCompleto(rota)

    // O primeiro waypoint esta em cima da descolagem, logo a ida e nula; o
    // ultimo esta a 800 m, que a 10 m/s sao 80 s de regresso.
    expect(voo - soEntreWaypoints).toBeCloseTo(80, 0)
  })

  it('nao conta regresso nenhum quando a rota acaba em pouso automatico', () => {
    const rota = { ...rotaEmLinha(5, 200, { velocidade: 10 }), acaoFinal: 'autoLand' as const }
    expect(duracaoDoVooCompleto(rota)).toBeCloseTo(calcularEstatisticas(rota).duracao, 6)
  })

  it('nao rebenta numa rota vazia nem com velocidade zero', () => {
    const vazia = rotaEmLinha(0, 100)
    expect(Number.isFinite(duracaoDoVooCompleto(vazia))).toBe(true)
    expect(Number.isFinite(duracaoDoVooCompleto(rotaEmLinha(4, 100, { velocidade: 0 })))).toBe(true)
  })
})

describe('o vento nas estatisticas', () => {
  /*
   * Os waypoints de `rotaEmLinha` vao todos a 45 graus - para nordeste - e por
   * isso um vento de nordeste e de frente em toda a rota, e um de sudoeste e de
   * cauda em toda ela. E o caso mais simples que ainda diz alguma coisa.
   */
  const rota = rotaEmLinha(5, 200, { velocidade: 10 })

  it('sem vento apontado, nada muda', () => {
    const semVento = calcularEstatisticas(rota, undefined, 15).duracao
    expect(semVento).toBeCloseTo(calcularEstatisticas(rota).duracao, 9)
  })

  it('sem o maximo do aparelho, o vento nao entra na conta', () => {
    const comVento = { ...rota, vento: { velocidade: 9, rumo: 45 } }
    expect(calcularEstatisticas(comVento).duracao).toBeCloseTo(
      calcularEstatisticas(rota).duracao,
      9,
    )
  })

  /*
   * O ponto de todo o modulo: uma missao de waypoints e voada a velocidade no
   * solo. Enquanto houver folga no ar, o vento nao atrasa a rota nem um segundo.
   */
  it('com folga no ar, o vento nao atrasa a rota', () => {
    const comVento = { ...rota, vento: { velocidade: 4, rumo: 45 } }
    expect(calcularEstatisticas(comVento, undefined, 15).duracao).toBeCloseTo(
      calcularEstatisticas(rota, undefined, 15).duracao,
      9,
    )
  })

  it('sem folga no ar, a rota demora mais', () => {
    const comVento = { ...rota, vento: { velocidade: 8, rumo: 45 } }
    const parado = calcularEstatisticas(rota, undefined, 15).duracao
    const contra = calcularEstatisticas(comVento, undefined, 15).duracao
    /* 15 no ar menos 8 de frente da 7 no solo, em vez dos 10 que se pediram. */
    expect(contra).toBeGreaterThan(parado)
    const percurso = calcularEstatisticas(rota).distancia3D
    expect(contra - parado).toBeCloseTo(percurso / 7 - percurso / 10, 6)
  })

  it('o vento de cauda nao acelera a rota acima do que se pediu', () => {
    const comVento = { ...rota, vento: { velocidade: 8, rumo: 225 } }
    expect(calcularEstatisticas(comVento, undefined, 15).duracao).toBeCloseTo(
      calcularEstatisticas(rota, undefined, 15).duracao,
      9,
    )
  })

  it('a ida e o regresso tambem apanham o vento', () => {
    /* Rota longe de casa, para a ida e a volta pesarem. */
    const longe = rotaEmLinha(3, 100, { velocidade: 10 })
    const afastada = {
      ...longe,
      waypoints: longe.waypoints.map((w) => ({ ...w, ...deslocar(w, 45, 3000) })),
      acaoFinal: 'goHome' as const,
    }
    const parado = duracaoDoVooCompleto(afastada, 15)
    const contra = duracaoDoVooCompleto({ ...afastada, vento: { velocidade: 8, rumo: 45 } }, 15)
    expect(contra).toBeGreaterThan(parado)
  })
})
