import { describe, it, expect } from 'vitest'
import type { LatLon, Rota } from './tipos.ts'
import { deslocar, amostrarPercurso } from './geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from './operacoes-rota.ts'
import { calcularPerfil, interpolarAltura, percursoDosWaypoints } from './perfil.ts'

const chave = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
const DESCOLAGEM = { lat: 40.7, lon: -8.4, cotaTerreno: 200 }

function cenario(opcoes: {
  alturas: readonly number[]
  troco: number
  terreno: (percursoEmMetros: number) => number
  modo?: Rota['modoAltitude']
}) {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, modoAltitude: opcoes.modo ?? 'ASL' }

  let ponto: LatLon = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (const [i, altura] of opcoes.alturas.entries()) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura, index: i }))
    ponto = deslocar(ponto, 90, opcoes.troco)
  }

  const cotas = new Map<string, number>()
  for (const [i, w] of rota.waypoints.entries()) cotas.set(chave(w), opcoes.terreno(i * opcoes.troco))

  const pontos = amostrarPercurso(rota.waypoints, 10)
  const amostrado = { pontos, cotas: pontos.map((_, i) => opcoes.terreno(i * 10)) }

  return { rota, amostrado, cotas }
}

describe('percursoDosWaypoints', () => {
  it('acumula a distancia entre waypoints consecutivos', () => {
    const { rota } = cenario({ alturas: [100, 100, 100], troco: 250, terreno: () => 200 })
    const percurso = percursoDosWaypoints(rota)

    expect(percurso).toHaveLength(3)
    expect(percurso[0]).toBe(0)
    expect(percurso[1]).toBeCloseTo(250, 1)
    expect(percurso[2]).toBeCloseTo(500, 1)
  })
})

describe('interpolarAltura', () => {
  const percurso = [0, 100, 300]
  const alturas = [50, 150, 50]

  it('devolve a altura exacta nos waypoints', () => {
    expect(interpolarAltura(percurso, alturas, 0)).toBe(50)
    expect(interpolarAltura(percurso, alturas, 100)).toBe(150)
    expect(interpolarAltura(percurso, alturas, 300)).toBe(50)
  })

  it('interpola linearmente entre waypoints', () => {
    expect(interpolarAltura(percurso, alturas, 50)).toBe(100)
    expect(interpolarAltura(percurso, alturas, 200)).toBe(100)
  })

  it('segura os extremos', () => {
    expect(interpolarAltura(percurso, alturas, -10)).toBe(50)
    expect(interpolarAltura(percurso, alturas, 999)).toBe(50)
    expect(interpolarAltura([], [], 0)).toBeNull()
  })
})

describe('calcularPerfil', () => {
  it('descreve o corte do terreno e a linha de voo', () => {
    const { rota, amostrado, cotas } = cenario({
      alturas: [300, 300],
      troco: 200,
      terreno: () => 200,
    })
    const perfil = calcularPerfil(rota, amostrado, cotas, chave)

    expect(perfil.amostras.length).toBeGreaterThan(15)
    expect(perfil.percursoTotal).toBeCloseTo(200, 0)
    expect(perfil.waypoints).toHaveLength(2)
    expect(perfil.amostras.every((a) => a.cotaTerreno === 200)).toBe(true)
    expect(perfil.amostras.every((a) => Math.abs(a.aslVoo - 300) < 1e-6)).toBe(true)
    expect(perfil.aglMinimo).toBeCloseTo(100, 6)
    expect(perfil.aglMaximo).toBeCloseTo(100, 6)
  })

  it('mostra a altura acima do solo a variar quando o terreno varia', () => {
    // Altura de voo constante a 300 m sobre terreno que sobe de 200 para 280.
    const { rota, amostrado, cotas } = cenario({
      alturas: [300, 300],
      troco: 400,
      terreno: (d) => 200 + Math.min(80, d * 0.2),
    })
    const perfil = calcularPerfil(rota, amostrado, cotas, chave)

    expect(perfil.aglMaximo).toBeCloseTo(100, 0)
    expect(perfil.aglMinimo).toBeCloseTo(20, 0)
    expect(perfil.cotaMinima).toBe(200)
    expect(perfil.cotaMaxima).toBe(300)
  })

  it('faz a linha de voo subir entre waypoints de alturas diferentes', () => {
    const { rota, amostrado, cotas } = cenario({
      alturas: [250, 350],
      troco: 400,
      terreno: () => 200,
    })
    const perfil = calcularPerfil(rota, amostrado, cotas, chave)

    const meio = perfil.amostras.find((a) => Math.abs(a.percurso - 200) < 6)
    expect(meio?.aslVoo).toBeCloseTo(300, 0)
    expect(perfil.waypoints[0]?.aslVoo).toBe(250)
    expect(perfil.waypoints[1]?.aslVoo).toBe(350)
  })

  it('converte o modo de altitude da rota antes de desenhar', () => {
    // 60 m acima do solo, com o terreno a subir: a linha de voo acompanha.
    const { rota, amostrado, cotas } = cenario({
      alturas: [60, 60],
      troco: 400,
      modo: 'AGL',
      terreno: (d) => 200 + Math.min(80, d * 0.2),
    })
    const perfil = calcularPerfil(rota, amostrado, cotas, chave)

    expect(perfil.waypoints[0]?.aslVoo).toBeCloseTo(260, 6)
    expect(perfil.waypoints[1]?.aslVoo).toBeCloseTo(340, 6)
    expect(perfil.waypoints.every((w) => Math.abs(w.acimaDoSolo - 60) < 1e-6)).toBe(true)
  })

  it('devolve um perfil vazio sem rota ou sem amostras', () => {
    const { rota, cotas } = cenario({ alturas: [], troco: 100, terreno: () => 200 })
    expect(calcularPerfil(rota, { pontos: [], cotas: [] }, cotas, chave).amostras).toEqual([])
  })
})
