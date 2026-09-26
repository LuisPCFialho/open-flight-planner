import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAtalhos, type ComandosDeAtalho } from './useAtalhos.ts'

/**
 * Os atalhos sao a unica parte da interface sem um botao a corresponder-lhe, e
 * portanto a unica que se parte sem se ver.
 */

function comandosFalsos() {
  return {
    desfazer: vi.fn(),
    refazer: vi.fn(),
    fotografar: vi.fn(),
    eliminar: vi.fn(),
    escapar: vi.fn(),
    mover: vi.fn<(passo: 1 | -1) => void>(),
    atalhos: vi.fn(),
    seleccionarTudo: vi.fn(),
  } satisfies ComandosDeAtalho
}

let comandos: ReturnType<typeof comandosFalsos>

beforeEach(() => {
  comandos = comandosFalsos()
})

/** Liga os atalhos e devolve um teclado que escreve no `body`. */
function ligar(suspenso = false) {
  renderHook(() => useAtalhos(comandos, suspenso))
  return userEvent.setup({ document })
}

describe('atalhos de teclado', () => {
  it('Ctrl+Z desfaz e Ctrl+Shift+Z refaz', async () => {
    const teclado = ligar()

    await teclado.keyboard('{Control>}z{/Control}')
    expect(comandos.desfazer).toHaveBeenCalledTimes(1)
    expect(comandos.refazer).not.toHaveBeenCalled()

    await teclado.keyboard('{Control>}{Shift>}Z{/Shift}{/Control}')
    expect(comandos.refazer).toHaveBeenCalledTimes(1)
    expect(comandos.desfazer).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Y tambem refaz, que e o que o Windows faz', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Control>}y{/Control}')
    expect(comandos.refazer).toHaveBeenCalledTimes(1)
  })

  it('Cmd+Z desfaz, para quem estiver num Mac', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Meta>}z{/Meta}')
    expect(comandos.desfazer).toHaveBeenCalledTimes(1)
  })

  it('Shift+F pede a foto', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Shift>}F{/Shift}')
    expect(comandos.fotografar).toHaveBeenCalledTimes(1)
  })

  it('um F sozinho nao pede foto nenhuma', async () => {
    const teclado = ligar()
    await teclado.keyboard('f')
    expect(comandos.fotografar).not.toHaveBeenCalled()
  })

  it('Delete e Backspace eliminam', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Delete}')
    await teclado.keyboard('{Backspace}')
    expect(comandos.eliminar).toHaveBeenCalledTimes(2)
  })

  it('Escape larga tudo', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Escape}')
    expect(comandos.escapar).toHaveBeenCalledTimes(1)
  })

  it('as setas andam na lista, para baixo e para cima', async () => {
    const teclado = ligar()
    await teclado.keyboard('{ArrowDown}')
    await teclado.keyboard('{ArrowUp}')
    expect(comandos.mover.mock.calls).toEqual([[1], [-1]])
  })

  it('escrever num campo nao comanda nada', async () => {
    /*
     * Sem isto, escrever o nome de uma rota com um "z" desfazia a ultima
     * alteracao, e apagar um caractere apagava o waypoint seleccionado.
     */
    renderHook(() => useAtalhos(comandos, false))
    render(<input aria-label="Nome" defaultValue="" />)

    const teclado = userEvent.setup({ document })
    await teclado.click(document.querySelector('input') as HTMLInputElement)
    await teclado.keyboard('{Control>}z{/Control}')
    await teclado.keyboard('{Delete}')
    await teclado.keyboard('{ArrowDown}')

    expect(comandos.desfazer).not.toHaveBeenCalled()
    expect(comandos.eliminar).not.toHaveBeenCalled()
    expect(comandos.mover).not.toHaveBeenCalled()
  })

  it('em voo virtual o teclado e todo do voo', async () => {
    /*
     * W, A, S, D e as setas pilotam. Um Delete no meio do voo apagava um
     * waypoint sem ninguem pedir.
     */
    const teclado = ligar(true)
    await teclado.keyboard('{Delete}')
    await teclado.keyboard('{ArrowDown}')
    await teclado.keyboard('{Control>}z{/Control}')

    expect(comandos.eliminar).not.toHaveBeenCalled()
    expect(comandos.mover).not.toHaveBeenCalled()
    expect(comandos.desfazer).not.toHaveBeenCalled()
  })

  it('desmontar deixa de ouvir', async () => {
    const { unmount } = renderHook(() => useAtalhos(comandos, false))
    unmount()

    await userEvent.setup({ document }).keyboard('{Escape}')
    expect(comandos.escapar).not.toHaveBeenCalled()
  })

  it('os comandos mais recentes sao os que correm, sem voltar a subscrever', async () => {
    /*
     * Os comandos vao num ref de proposito: o ouvinte instala-se uma vez so, em
     * vez de se desligar e voltar a ligar a cada alteracao da rota. Isso so
     * funciona se a chamada usar sempre os ultimos.
     */
    const primeiros = comandosFalsos()
    const segundos = comandosFalsos()
    const { rerender } = renderHook(
      ({ c }: { c: ComandosDeAtalho }) => useAtalhos(c, false),
      { initialProps: { c: primeiros as ComandosDeAtalho } },
    )

    rerender({ c: segundos as ComandosDeAtalho })
    await userEvent.setup({ document }).keyboard('{Escape}')

    expect(segundos.escapar).toHaveBeenCalledTimes(1)
    expect(primeiros.escapar).not.toHaveBeenCalled()
  })
})

describe('a folha de atalhos', () => {
  it('a interrogacao abre-a', async () => {
    const teclado = ligar()
    await teclado.keyboard('?')
    expect(comandos.atalhos).toHaveBeenCalledTimes(1)
  })

  /*
   * O unico atalho que sobrevive ao voo virtual.
   *
   * Em voo o teclado e todo do voo - um Delete la no meio apagava um waypoint
   * sem ninguem pedir - mas abrir uma folha de ajuda nao edita nada, e e
   * precisamente em voo que ela faz mais falta: e la que estao as catorze
   * teclas que ninguem decorou.
   */
  it('funciona mesmo com os atalhos suspensos pelo voo', async () => {
    const teclado = ligar(true)
    await teclado.keyboard('?')
    expect(comandos.atalhos).toHaveBeenCalledTimes(1)
    await teclado.keyboard('{Delete}')
    expect(comandos.eliminar).not.toHaveBeenCalled()
  })

  it('escrever uma interrogacao num campo nao a abre', async () => {
    const teclado = ligar()
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    campo.focus()
    await teclado.keyboard('?')
    expect(comandos.atalhos).not.toHaveBeenCalled()
    campo.remove()
  })
})

describe('seleccionar tudo', () => {
  /*
   * Editar em lote ja existia; chegar a vinte pontos e que nao havia maneira
   * senao bater-lhes um a um com o ctrl premido.
   */
  it('Ctrl+A apanha a rota toda', async () => {
    const teclado = ligar()
    await teclado.keyboard('{Control>}a{/Control}')
    expect(comandos.seleccionarTudo).toHaveBeenCalledTimes(1)
  })

  /*
   * Sem `preventDefault` o browser seleccionava tambem o texto da pagina toda
   * por baixo, e ficava tudo azul.
   */
  it('nao deixa o browser seleccionar a pagina por baixo', () => {
    renderHook(() => useAtalhos(comandos, false))
    const evento = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true, bubbles: true })
    window.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(true)
  })

  it('escrever um "a" num campo nao selecciona nada', async () => {
    const teclado = ligar()
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    campo.focus()
    await teclado.keyboard('{Control>}a{/Control}')
    expect(comandos.seleccionarTudo).not.toHaveBeenCalled()
    campo.remove()
  })
})
