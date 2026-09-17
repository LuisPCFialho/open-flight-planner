import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Rota } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { useSeleccao } from './useSeleccao.ts'

/**
 * A seleccao e das coisas em que mais se mexe e nao tinha teste nenhum.
 *
 * O que ali e facil de partir nao e o clique simples: e a ancora do intervalo,
 * que muda quando se escolhe sem shift e nao muda quando se escolhe com ele. Uma
 * ancora errada nao da erro - da um intervalo que apanha os waypoints errados, e
 * a seguir alteram-se todos de uma vez.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function rota(quantos: number): Rota {
  let r = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    r = acrescentarWaypoint(r, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, 100)
  }
  return r
}

/** A rota de ensaio e os identificadores pela ordem em que estao na lista. */
function montar(quantos = 5) {
  const r = rota(quantos)
  const ids = r.waypoints.map((w) => w.id)
  const { result } = renderHook(() => useSeleccao(r))
  return { r, ids, result }
}

/** Os identificadores seleccionados, pela ordem da rota. */
const escolhidos = (result: { current: { waypoints: { id: string }[] } }): string[] =>
  result.current.waypoints.map((w) => w.id)

describe('seleccao de waypoints', () => {
  it('nasce vazia', () => {
    const { result } = montar()
    expect(result.current.ids.size).toBe(0)
    expect(result.current.waypoints).toEqual([])
  })

  it('um clique escolhe um so', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[2]!, false))
    expect(escolhidos(result)).toEqual([ids[2]])
  })

  it('um clique noutro larga o anterior', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[1]!, false))
    act(() => result.current.seleccionar(ids[3]!, false))
    expect(escolhidos(result)).toEqual([ids[3]])
  })

  it('com ctrl junta', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[0]!, false))
    act(() => result.current.seleccionar(ids[2]!, true))
    expect(escolhidos(result)).toEqual([ids[0], ids[2]])
  })

  it('com ctrl em cima de um ja escolhido, tira-o', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[0]!, false))
    act(() => result.current.seleccionar(ids[2]!, true))
    act(() => result.current.seleccionar(ids[0]!, true))
    expect(escolhidos(result)).toEqual([ids[2]])
  })

  it('com shift apanha o intervalo desde a ancora', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[1]!, false))
    act(() => result.current.seleccionar(ids[3]!, false, true))
    expect(escolhidos(result)).toEqual([ids[1], ids[2], ids[3]])
  })

  it('o intervalo para tras apanha o mesmo', () => {
    // Escolher de baixo para cima e tao valido como de cima para baixo.
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[3]!, false))
    act(() => result.current.seleccionar(ids[1]!, false, true))
    expect(escolhidos(result)).toEqual([ids[1], ids[2], ids[3]])
  })

  it('o shift nao mexe na ancora, e o intervalo seguinte parte do mesmo sitio', () => {
    /*
     * E a regra de qualquer lista, e a que se parte sem se ver: com a ancora a
     * andar, o segundo shift apanhava outro intervalo e alteravam-se waypoints
     * que ninguem escolheu.
     */
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[1]!, false))
    act(() => result.current.seleccionar(ids[3]!, false, true))
    act(() => result.current.seleccionar(ids[4]!, false, true))
    expect(escolhidos(result)).toEqual([ids[1], ids[2], ids[3], ids[4]])
  })

  it('sem ancora, o shift comporta-se como um clique simples', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[2]!, false, true))
    expect(escolhidos(result)).toEqual([ids[2]])
  })

  it('substituir troca a seleccao inteira e deixa a ancora no ultimo', () => {
    const { ids, result } = montar()
    act(() => result.current.substituir([ids[0]!, ids[1]!]))
    expect(escolhidos(result)).toEqual([ids[0], ids[1]])

    // A ancora ficou no ultimo da lista dada: o intervalo seguinte parte dali.
    act(() => result.current.seleccionar(ids[3]!, false, true))
    expect(escolhidos(result)).toEqual([ids[1], ids[2], ids[3]])
  })

  it('limpar larga tudo e esquece a ancora', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[1]!, false))
    act(() => result.current.limpar())
    expect(result.current.ids.size).toBe(0)

    // Sem ancora, o shift seguinte escolhe um so.
    act(() => result.current.seleccionar(ids[3]!, false, true))
    expect(escolhidos(result)).toEqual([ids[3]])
  })

  it('as setas andam na lista', () => {
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[1]!, false))
    act(() => result.current.mover(1))
    expect(escolhidos(result)).toEqual([ids[2]])
    act(() => result.current.mover(-1))
    expect(escolhidos(result)).toEqual([ids[1]])
  })

  it('as setas param nos extremos em vez de dar a volta', () => {
    // Dar a volta punha a vista a saltar do fim para o principio sem se querer.
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[0]!, false))
    act(() => result.current.mover(-1))
    expect(escolhidos(result)).toEqual([ids[0]])

    act(() => result.current.seleccionar(ids[4]!, false))
    act(() => result.current.mover(1))
    expect(escolhidos(result)).toEqual([ids[4]])
  })

  it('sem nada escolhido, a seta para baixo comeca no primeiro', () => {
    const { ids, result } = montar()
    act(() => result.current.mover(1))
    expect(escolhidos(result)).toEqual([ids[0]])
  })

  it('numa rota vazia as setas nao rebentam', () => {
    const { result } = renderHook(() => useSeleccao(rota(0)))
    act(() => result.current.mover(1))
    expect(result.current.ids.size).toBe(0)
  })

  it('sem rota nenhuma tambem nao', () => {
    const { result } = renderHook(() => useSeleccao(null))
    act(() => result.current.mover(1))
    act(() => result.current.seleccionar('seja-qual-for', false))
    expect(result.current.waypoints).toEqual([])
  })

  it('os waypoints saem pela ordem da rota, e nao pela ordem dos cliques', () => {
    /*
     * A lista alimenta a edicao em lote e o painel de propriedades. Fora de
     * ordem, o "primeiro seleccionado" nao era o primeiro da rota.
     */
    const { ids, result } = montar()
    act(() => result.current.seleccionar(ids[4]!, false))
    act(() => result.current.seleccionar(ids[1]!, true))
    act(() => result.current.seleccionar(ids[3]!, true))
    expect(escolhidos(result)).toEqual([ids[1], ids[3], ids[4]])
  })

  it('um waypoint apagado deixa de contar na seleccao', () => {
    // A rota muda por baixo da seleccao sempre que se apaga ou se desfaz.
    const r = rota(4)
    const ids = r.waypoints.map((w) => w.id)
    const { result, rerender } = renderHook(({ actual }) => useSeleccao(actual), {
      initialProps: { actual: r },
    })

    act(() => result.current.substituir([ids[1]!, ids[2]!]))
    rerender({ actual: { ...r, waypoints: r.waypoints.filter((w) => w.id !== ids[2]) } })

    expect(escolhidos(result)).toEqual([ids[1]])
  })
})
