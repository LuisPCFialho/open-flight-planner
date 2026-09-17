import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Rota } from '../nucleo/tipos.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { useEditorRota } from './useEditorRota.ts'

/**
 * O `historico.ts` por baixo ja tinha testes; esta e a camada de React por cima,
 * e e nela que estao as duas coisas que se partem sem dar erro: o passo que nao
 * se regista durante um arrasto, e a identidade do objecto devolvido.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function rota(nome: string): Rota {
  return rotaVazia({
    nome,
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
}

/** Acrescenta um waypoint a rota, para haver uma alteracao com substancia. */
function comMaisUm(atual: Rota): Rota {
  return acrescentarWaypoint(
    atual,
    waypointNovo({
      lat: DESCOLAGEM.lat,
      lon: DESCOLAGEM.lon,
      altura: 60,
      index: atual.waypoints.length,
    }),
  )
}

describe('editor da rota', () => {
  it('sem rota carregada nao ha nada para editar', () => {
    const { result } = renderHook(() => useEditorRota())
    expect(result.current.rota).toBeNull()
    expect(result.current.podeDesfazer).toBe(false)
    expect(result.current.podeRefazer).toBe(false)
  })

  it('aplicar sem rota carregada nao rebenta', () => {
    // Acontece entre o arranque e a chegada da rota da base de dados.
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.aplicar(comMaisUm))
    expect(result.current.rota).toBeNull()
  })

  it('carregar traz a rota e comeca com o historico limpo', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('primeira')))

    expect(result.current.rota?.nome).toBe('primeira')
    expect(result.current.podeDesfazer).toBe(false)
    expect(result.current.podeRefazer).toBe(false)
  })

  it('uma alteracao pode ser desfeita e refeita', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.aplicar(comMaisUm))

    expect(result.current.rota?.waypoints).toHaveLength(1)
    expect(result.current.podeDesfazer).toBe(true)

    act(() => result.current.desfazer())
    expect(result.current.rota?.waypoints).toHaveLength(0)
    expect(result.current.podeRefazer).toBe(true)

    act(() => result.current.refazer())
    expect(result.current.rota?.waypoints).toHaveLength(1)
  })

  it('um arrasto nao enche o historico de passos', () => {
    /*
     * `comPasso` a falso substitui o presente sem registar. E o que serve o
     * arrastar continuo de um waypoint: com um passo por pixel, um unico
     * arrasto gastava o historico todo e desfazer deixava de servir para nada.
     */
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.aplicar(comMaisUm))

    for (const altura of [61, 62, 63, 64]) {
      act(() =>
        result.current.aplicar(
          (atual) => ({
            ...atual,
            waypoints: atual.waypoints.map((w) => ({ ...w, altura })),
          }),
          false,
        ),
      )
    }

    expect(result.current.rota?.waypoints[0]?.altura).toBe(64)

    // Um so desfazer volta ao estado anterior ao arrasto inteiro.
    act(() => result.current.desfazer())
    expect(result.current.rota?.waypoints).toHaveLength(0)
  })

  it('alterarRota muda campos da rota e conta como passo', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.alterarRota({ nome: 'outro nome' }))

    expect(result.current.rota?.nome).toBe('outro nome')
    act(() => result.current.desfazer())
    expect(result.current.rota?.nome).toBe('a')
  })

  it('uma alteracao nova deita fora o que havia para refazer', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.aplicar(comMaisUm))
    act(() => result.current.desfazer())
    expect(result.current.podeRefazer).toBe(true)

    act(() => result.current.aplicar(comMaisUm))
    expect(result.current.podeRefazer).toBe(false)
  })

  it('carregar outra rota esquece o historico da anterior', () => {
    // Desfazer depois de trocar de rota nao pode trazer de volta a rota antiga.
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.aplicar(comMaisUm))
    act(() => result.current.carregar(rota('b')))

    expect(result.current.podeDesfazer).toBe(false)
    act(() => result.current.desfazer())
    expect(result.current.rota?.nome).toBe('b')
  })

  it('o objecto devolvido nao muda enquanto a rota nao mudar', () => {
    /*
     * Esta e a que nao se ve. Devolver um literal novo a cada render faz
     * qualquer `useEffect` que dependa do editor voltar a correr sempre - e o
     * efeito de arranque, que carrega a rota da base de dados, passava a apagar
     * as alteracoes assim que eram feitas.
     */
    const { result, rerender } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))

    const antes = result.current
    rerender()
    expect(result.current).toBe(antes)
  })

  it('as funcoes sao estaveis mesmo quando a rota muda', () => {
    // E o que permite depender so de `carregar` no efeito de arranque.
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    const carregar = result.current.carregar
    const aplicar = result.current.aplicar

    act(() => result.current.aplicar(comMaisUm))

    expect(result.current.carregar).toBe(carregar)
    expect(result.current.aplicar).toBe(aplicar)
  })

  it('desfazer no principio da lista nao faz nada', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.desfazer())
    expect(result.current.rota?.nome).toBe('a')
  })

  it('refazer sem nada para refazer nao faz nada', () => {
    const { result } = renderHook(() => useEditorRota())
    act(() => result.current.carregar(rota('a')))
    act(() => result.current.refazer())
    expect(result.current.rota?.nome).toBe('a')
  })
})
