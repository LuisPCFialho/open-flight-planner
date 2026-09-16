import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Rota } from '../nucleo/tipos.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { FOLGA_DE_GRAVACAO, usePersistenciaDaRota } from './usePersistencia.ts'

/**
 * A folga ja perdeu trabalho de alguem: trocar de rota dentro dela cancelava o
 * temporizador e a ultima edicao nunca chegava a base de dados. Nao havia erro,
 * a alteracao estava no ecra, e ao reabrir a rota tinha desaparecido.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function rota(nome: string): Rota {
  const base = rotaVazia({
    nome,
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  return acrescentarWaypoint(
    base,
    waypointNovo({ lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon, altura: 60, index: 0 }),
  )
}

let gravar: ReturnType<typeof vi.fn<(rota: Rota) => Promise<unknown>>>

beforeEach(() => {
  vi.useFakeTimers()
  gravar = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  vi.useRealTimers()
})

/** Nomes das rotas que chegaram a ser gravadas, pela ordem em que chegaram. */
const gravadas = () => gravar.mock.calls.map((c) => (c[0] as Rota).nome)

function montar(inicial: Rota | null) {
  return renderHook(({ r }: { r: Rota | null }) => usePersistenciaDaRota(r, gravar), {
    initialProps: { r: inicial },
  })
}

describe('gravacao da rota', () => {
  it('nao grava de imediato', () => {
    montar(rota('primeira'))
    expect(gravar).not.toHaveBeenCalled()
  })

  it('grava passada a folga', () => {
    montar(rota('primeira'))
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))
    expect(gravadas()).toEqual(['primeira'])
  })

  it('varias alteracoes seguidas dao uma so gravacao, com a ultima', () => {
    // E o que acontece a arrastar um waypoint: um evento por pixel.
    const { rerender } = montar(rota('a'))
    for (const nome of ['b', 'c', 'd']) {
      act(() => void vi.advanceTimersByTime(50))
      rerender({ r: rota(nome) })
    }
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))
    expect(gravadas()).toEqual(['d'])
  })

  it('gravar a pedido dentro da folga nao perde a edicao', () => {
    /*
     * Este e o defeito. Trocar de rota cancelava o temporizador e a ultima
     * edicao nunca chegava a ser pedida a base de dados.
     */
    const { result } = montar(rota('por gravar'))
    act(() => void vi.advanceTimersByTime(100))
    act(() => result.current.gravarPendente())

    expect(gravadas()).toEqual(['por gravar'])
  })

  it('gravar a pedido e depois esperar nao grava duas vezes', () => {
    const { result } = montar(rota('uma vez so'))
    act(() => void vi.advanceTimersByTime(100))
    act(() => result.current.gravarPendente())
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))

    expect(gravadas()).toEqual(['uma vez so'])
  })

  it('gravar a pedido sem nada pendente nao faz nada', () => {
    const { result } = montar(rota('a'))
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))
    act(() => result.current.gravarPendente())

    expect(gravadas()).toEqual(['a'])
  })

  it('esquecer o pendente nao grava nada', () => {
    /*
     * E o que se faz antes de apagar a rota: deixar a gravacao correr repunha-a
     * na base de dados depois de apagada.
     */
    const { result } = montar(rota('a apagar'))
    act(() => void vi.advanceTimersByTime(100))
    act(() => result.current.esquecerPendente())
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))

    expect(gravar).not.toHaveBeenCalled()
  })

  it('esconder o separador grava o que estiver pendente', () => {
    /*
     * Fechar o separador ou recarregar a pagina dentro da folga perdia a edicao
     * pela mesma razao. O `visibilitychange` e o unico momento em que o browser
     * garante que ainda ha tempo de escrever.
     */
    montar(rota('a fechar'))
    act(() => void vi.advanceTimersByTime(100))

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))

    expect(gravadas()).toEqual(['a fechar'])
  })

  it('voltar ao separador nao grava nada', () => {
    montar(rota('a'))
    act(() => void vi.advanceTimersByTime(100))

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))

    expect(gravar).not.toHaveBeenCalled()
  })

  it('o pagehide tambem grava', () => {
    montar(rota('a recarregar'))
    act(() => void vi.advanceTimersByTime(100))
    act(() => void window.dispatchEvent(new Event('pagehide')))

    expect(gravadas()).toEqual(['a recarregar'])
  })

  it('sem rota nao se grava nada', () => {
    montar(null)
    act(() => void vi.advanceTimersByTime(FOLGA_DE_GRAVACAO))
    expect(gravar).not.toHaveBeenCalled()
  })

  it('desmontar deixa de ouvir o separador', () => {
    const { unmount } = montar(rota('a'))
    act(() => void vi.advanceTimersByTime(100))
    unmount()

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void window.dispatchEvent(new Event('pagehide')))

    expect(gravar).not.toHaveBeenCalled()
  })
})
