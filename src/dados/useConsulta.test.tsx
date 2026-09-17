import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useConsulta } from './useConsulta.ts'
import { anunciarMudanca } from './mudancas.ts'

/**
 * A leitura que se repete quando alguma coisa muda.
 *
 * Substituiu o `useLiveQuery` do Dexie, que so servia um dos dois armazens.
 * Duas coisas tem de ser verdade: uma escrita anunciada faz a lista voltar a
 * perguntar, e uma resposta que chega fora de ordem nao escreve por cima de
 * uma mais recente.
 */

describe('useConsulta', () => {
  it('le a montagem', async () => {
    const { result } = renderHook(() => useConsulta(() => Promise.resolve('primeiro'), []))
    await waitFor(() => {
      expect(result.current.dados).toBe('primeiro')
    })
  })

  it('volta a ler quando uma escrita se anuncia', async () => {
    let vez = 0
    const consulta = vi.fn(() => Promise.resolve(++vez))

    const { result } = renderHook(() => useConsulta(consulta, []))
    await waitFor(() => {
      expect(result.current.dados).toBe(1)
    })

    act(() => {
      anunciarMudanca()
    })
    await waitFor(() => {
      expect(result.current.dados).toBe(2)
    })
  })

  it('deixa de ouvir quando sai do ecra', async () => {
    const consulta = vi.fn(() => Promise.resolve('x'))
    const { unmount } = renderHook(() => useConsulta(consulta, []))
    await waitFor(() => {
      expect(consulta).toHaveBeenCalledTimes(1)
    })

    unmount()
    act(() => {
      anunciarMudanca()
    })
    expect(consulta).toHaveBeenCalledTimes(1)
  })

  /*
   * O caso que justifica o contador de pedidos.
   *
   * A primeira consulta e lenta e a segunda e rapida. Sem o contador, a lenta
   * chega por ultimo e repoe o estado anterior: o ecra fica a mostrar o que ja
   * nao vale, sem nada que o indique - e quem escreveu conclui que a escrita se
   * perdeu.
   */
  it('uma resposta atrasada nao escreve por cima de uma mais recente', async () => {
    let soltar: ((valor: string) => void) | null = null
    const lenta = new Promise<string>((resolve) => {
      soltar = resolve
    })

    let chamada = 0
    const consulta = (): Promise<string> => {
      chamada++
      return chamada === 1 ? lenta : Promise.resolve('recente')
    }

    const { result } = renderHook(() => useConsulta(consulta, []))

    act(() => {
      anunciarMudanca()
    })
    await waitFor(() => {
      expect(result.current.dados).toBe('recente')
    })

    await act(async () => {
      soltar?.('atrasada')
      await lenta
    })

    expect(result.current.dados).toBe('recente')
  })

  it('a falha aparece como erro em vez de ficar em silencio', async () => {
    const { result } = renderHook(() =>
      useConsulta(() => Promise.reject(new Error('sessão expirou')), []),
    )
    await waitFor(() => {
      expect(result.current.erro).toBe('sessão expirou')
    })
  })
})
