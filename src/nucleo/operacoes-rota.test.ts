import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import {
  rotaVazia,
  waypointNovo,
  renumerar,
  acrescentarWaypoint,
  inserirWaypoint,
  alterarWaypoint,
  alterarWaypoints,
  removerWaypoints,
  velocidadeDe,
} from './operacoes-rota.ts'

function rotaDeTeste(quantos: number): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: { lat: 40.746552, lon: -8.41061, cotaTerreno: 361.6 },
  })
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ lat: 40.75 + i * 0.001, lon: -8.41, altura: 50, index: i }),
    )
  }
  return rota
}

describe('imutabilidade', () => {
  it('nunca altera a rota recebida', () => {
    const original = rotaDeTeste(3)
    const copia = structuredClone(original)
    const primeiro = original.waypoints[0]
    if (!primeiro) throw new Error('rota de teste vazia')

    acrescentarWaypoint(original, waypointNovo({ lat: 1, lon: 1, altura: 1, index: 9 }))
    inserirWaypoint(original, waypointNovo({ lat: 1, lon: 1, altura: 1, index: 9 }), 1)
    alterarWaypoint(original, primeiro.id, { altura: 999 })
    alterarWaypoints(original, [primeiro.id], { gimbalPitch: -90 })
    removerWaypoints(original, [primeiro.id])

    expect(original).toEqual(copia)
  })
})

describe('renumerar', () => {
  it('deixa contiguos os indices depois de remover do meio', () => {
    const rota = rotaDeTeste(5)
    const meio = rota.waypoints[2]
    if (!meio) throw new Error('waypoint em falta')

    const depois = removerWaypoints(rota, [meio.id])
    expect(depois.waypoints.map((w) => w.index)).toEqual([0, 1, 2, 3])
    expect(depois.waypoints.map((w) => w.id)).not.toContain(meio.id)
  })

  it('mantem a identidade dos objectos que ja tem o indice certo', () => {
    const rota = rotaDeTeste(3)
    const renumerados = renumerar(rota.waypoints)
    expect(renumerados[0]).toBe(rota.waypoints[0])
    expect(renumerados[1]).toBe(rota.waypoints[1])
  })
})

describe('inserirWaypoint', () => {
  it('insere no meio e desloca os seguintes', () => {
    const rota = rotaDeTeste(3)
    const novo = waypointNovo({ lat: 41, lon: -8, altura: 60, index: 0 })
    const depois = inserirWaypoint(rota, novo, 1)

    expect(depois.waypoints).toHaveLength(4)
    expect(depois.waypoints[1]?.id).toBe(novo.id)
    expect(depois.waypoints[1]?.index).toBe(1)
    expect(depois.waypoints.map((w) => w.index)).toEqual([0, 1, 2, 3])
  })

  it('limita a posicao aos extremos em vez de abrir buracos', () => {
    const rota = rotaDeTeste(2)
    const novo = waypointNovo({ lat: 41, lon: -8, altura: 60, index: 0 })
    expect(inserirWaypoint(rota, novo, 99).waypoints.at(-1)?.id).toBe(novo.id)
    expect(inserirWaypoint(rota, novo, -5).waypoints[0]?.id).toBe(novo.id)
  })
})

describe('edicao em lote', () => {
  it('aplica a mesma alteracao a varios waypoints e deixa os outros intactos', () => {
    const rota = rotaDeTeste(4)
    const alvos = [rota.waypoints[0], rota.waypoints[2]]
    const ids = alvos.map((w) => w?.id ?? '')

    const depois = alterarWaypoints(rota, ids, { gimbalPitch: -90, altura: 120 })

    expect(depois.waypoints[0]?.gimbalPitch).toBe(-90)
    expect(depois.waypoints[2]?.altura).toBe(120)
    expect(depois.waypoints[1]?.gimbalPitch).toBe(-30)
    expect(depois.waypoints[1]).toBe(rota.waypoints[1])
  })
})

describe('velocidade', () => {
  it('herda da rota quando o waypoint nao a define', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')

    expect(velocidadeDe(rota, wp)).toBe(rota.velocidadeGlobal)
    expect(velocidadeDe(rota, { ...wp, velocidade: 12 })).toBe(12)
  })
})
