import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './operacoes-rota.ts'
import {
  acrescentarPOI,
  alterarPOI,
  associarPOI,
  desassociarPOI,
  poiComId,
  poiNovo,
  removerPOI,
  waypointsComPOIPerdido,
} from './operacoes-poi.ts'
import { valorComum, VARIOS, ehVarios, rotuloDoValor } from './edicao-lote.ts'

function rotaDeTeste(quantos: number): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: { lat: 40.7, lon: -8.4, cotaTerreno: 200 },
  })
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ lat: 40.7 + i * 0.001, lon: -8.4, altura: 60, index: i }))
  }
  return rota
}

describe('POI', () => {
  it('associa e poe os waypoints a apontar-lhe', () => {
    let rota = rotaDeTeste(3)
    const poi = poiNovo({ nome: 'Poste 12', lat: 40.705, lon: -8.405, altura: 50 })
    rota = acrescentarPOI(rota, poi)

    const alvos = [rota.waypoints[0]?.id ?? '', rota.waypoints[1]?.id ?? '']
    const com = associarPOI(rota, alvos, poi.id)

    expect(com.waypoints[0]?.poiId).toBe(poi.id)
    expect(com.waypoints[0]?.modoGuinada).toBe('towardPOI')
    expect(com.waypoints[2]?.poiId).toBeUndefined()
    expect(com.waypoints[2]?.modoGuinada).toBe('followWayline')
  })

  it('apagar um POI nao deixa waypoints a apontar para o vazio', () => {
    let rota = rotaDeTeste(2)
    const poi = poiNovo({ lat: 40.705, lon: -8.405, altura: 50 })
    rota = acrescentarPOI(rota, poi)
    rota = associarPOI(rota, rota.waypoints.map((w) => w.id), poi.id)

    const sem = removerPOI(rota, poi.id)

    expect(sem.pois).toHaveLength(0)
    expect(waypointsComPOIPerdido(sem)).toEqual([])
    for (const waypoint of sem.waypoints) {
      expect(waypoint.poiId).toBeUndefined()
      expect(waypoint.modoGuinada).toBe('followWayline')
    }
  })

  it('deteta waypoints que ficaram a apontar a um POI inexistente', () => {
    const rota = rotaDeTeste(2)
    const partida = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) =>
        i === 1 ? { ...w, modoGuinada: 'towardPOI' as const, poiId: 'inexistente' } : w,
      ),
    }
    expect(waypointsComPOIPerdido(partida)).toEqual([1])
  })

  it('desassocia e devolve a guinada ao percurso', () => {
    let rota = rotaDeTeste(2)
    const poi = poiNovo({ lat: 40.705, lon: -8.405, altura: 50 })
    rota = acrescentarPOI(rota, poi)
    rota = associarPOI(rota, [rota.waypoints[0]?.id ?? ''], poi.id)

    const sem = desassociarPOI(rota, [rota.waypoints[0]?.id ?? ''])
    expect(sem.waypoints[0]?.poiId).toBeUndefined()
    expect(sem.waypoints[0]?.modoGuinada).toBe('followWayline')
    expect(sem.pois).toHaveLength(1)
  })

  it('altera e procura por id', () => {
    let rota = rotaDeTeste(1)
    const poi = poiNovo({ nome: 'A', lat: 40.7, lon: -8.4, altura: 10 })
    rota = acrescentarPOI(rota, poi)

    const renomeado = alterarPOI(rota, poi.id, { nome: 'Subestacao' })
    expect(poiComId(renomeado, poi.id)?.nome).toBe('Subestacao')
    expect(poiComId(renomeado, 'nao existe')).toBeUndefined()
    expect(poiComId(renomeado, undefined)).toBeUndefined()
  })

  it('nao altera a rota recebida', () => {
    let rota = rotaDeTeste(2)
    const poi = poiNovo({ lat: 40.705, lon: -8.405, altura: 50 })
    rota = acrescentarPOI(rota, poi)
    const copia = structuredClone(rota)

    associarPOI(rota, [rota.waypoints[0]?.id ?? ''], poi.id)
    removerPOI(rota, poi.id)
    alterarPOI(rota, poi.id, { nome: 'outro' })
    desassociarPOI(rota, [rota.waypoints[0]?.id ?? ''])

    expect(rota).toEqual(copia)
  })
})

describe('valorComum', () => {
  it('devolve o valor quando todos concordam', () => {
    const rota = rotaDeTeste(3)
    expect(valorComum(rota.waypoints, (w) => w.altura)).toBe(60)
  })

  it('devolve VARIOS quando divergem', () => {
    const rota = rotaDeTeste(3)
    const mistos = rota.waypoints.map((w, i) => ({ ...w, altura: i === 1 ? 90 : 60 }))
    const valor = valorComum(mistos, (w) => w.altura)

    expect(valor).toBe(VARIOS)
    expect(ehVarios(valor)).toBe(true)
  })

  it('devolve undefined para uma lista vazia', () => {
    expect(valorComum([], (w: { altura: number }) => w.altura)).toBeUndefined()
  })

  it('trata undefined como um valor de pleno direito', () => {
    const rota = rotaDeTeste(2)
    expect(valorComum(rota.waypoints, (w) => w.velocidade)).toBeUndefined()

    const misto = [rota.waypoints[0], { ...rota.waypoints[1], velocidade: 5 }].filter(Boolean)
    expect(valorComum(misto as { velocidade?: number }[], (w) => w.velocidade)).toBe(VARIOS)
  })

  it('escreve o rotulo como o Pilot 2', () => {
    expect(rotuloDoValor(60, { unidade: ' m' })).toBe('60 m')
    expect(rotuloDoValor(VARIOS)).toBe('Varios valores')
    expect(rotuloDoValor(undefined)).toBe('--')
    expect(rotuloDoValor(-38.6, { casas: 1, unidade: ' graus' })).toBe('-38.6 graus')
  })
})
