import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './operacoes-rota.ts'
import { deslocar } from './geodesia.ts'
import { calcularEstatisticas, formatarDuracao, formatarDistancia } from './estatisticas.ts'

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
