import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useValorGuardado } from './ondeEstava.ts'

/**
 * Onde se estava quando a pagina fechou.
 *
 * O que interessa verificar nao e o `localStorage` - e o que acontece quando
 * ele nao esta disponivel. Numa janela privada o proprio acesso atira, e sem
 * isso tratado a aplicacao deixava de arrancar em vez de simplesmente esquecer
 * onde estava.
 */

const CHAVE = 'ensaio:onde-estava'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useValorGuardado', () => {
  it('comeca vazio quando nunca se guardou nada', () => {
    const { result } = renderHook(() => useValorGuardado(CHAVE))
    expect(result.current[0]).toBeNull()
  })

  it('o que se guarda esta la no arranque seguinte', () => {
    const primeiro = renderHook(() => useValorGuardado(CHAVE))
    act(() => {
      primeiro.result.current[1]('projeto-7')
    })
    expect(primeiro.result.current[0]).toBe('projeto-7')

    // Uma montagem nova e o que se passa depois de recarregar a pagina.
    const segundo = renderHook(() => useValorGuardado(CHAVE))
    expect(segundo.result.current[0]).toBe('projeto-7')
  })

  it('guardar nulo esquece, e nao guarda a palavra "null"', () => {
    const { result } = renderHook(() => useValorGuardado(CHAVE))
    act(() => {
      result.current[1]('projeto-7')
    })
    act(() => {
      result.current[1](null)
    })

    expect(result.current[0]).toBeNull()
    expect(localStorage.getItem(CHAVE)).toBeNull()
  })

  /*
   * Numa janela privada, ou com os dados do sitio bloqueados, o acesso atira em
   * vez de devolver vazio. A aplicacao tem de arrancar na mesma.
   */
  it('com o armazenamento a atirar, arranca vazio em vez de rebentar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('acesso negado')
    })

    const { result } = renderHook(() => useValorGuardado(CHAVE))
    expect(result.current[0]).toBeNull()
  })

  it('com o armazenamento a atirar ao escrever, o valor vale para esta visita', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('acesso negado')
    })

    const { result } = renderHook(() => useValorGuardado(CHAVE))
    act(() => {
      result.current[1]('projeto-7')
    })
    expect(result.current[0]).toBe('projeto-7')
  })
})
