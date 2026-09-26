import { useEffect, useRef } from 'react'

/**
 * Os atalhos de teclado da janela de edicao.
 *
 * Vivem fora da aplicacao por duas razoes. A primeira e poderem ser
 * verificados: sao a unica parte da interface que nao tem um botao a
 * corresponder-lhe, e portanto a unica que se parte sem se ver. A segunda e a
 * subscricao: os comandos vao num `ref`, e por isso o ouvinte instala-se uma vez
 * so, em vez de se desligar e voltar a ligar a cada alteracao da rota.
 *
 * Os atalhos seguem o Pilot 2 onde ele tem um, e o resto e o que qualquer editor
 * faz: Ctrl+Z, Delete, Escape, setas.
 */

export type ComandosDeAtalho = {
  desfazer: () => void
  refazer: () => void
  /** Shift+F: acrescenta uma foto aos waypoints seleccionados. */
  fotografar: () => void
  eliminar: () => void
  /** Escape: volta a navegar, fecha o que estiver aberto, larga a seleccao. */
  escapar: () => void
  /** Setas: anda na lista de waypoints. */
  mover: (passo: 1 | -1) => void
  /** Interrogacao: abre e fecha a folha de atalhos. */
  atalhos: () => void
  /** Ctrl+A: apanha a rota toda, para editar em lote. */
  seleccionarTudo: () => void
}

/**
 * Onde escrever nao e comandar.
 *
 * Sem isto, escrever o nome de uma rota com um "z" desfazia a ultima alteracao,
 * e apagar um caractere apagava o waypoint seleccionado.
 */
function estaAEscrever(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof HTMLInputElement ||
    alvo instanceof HTMLTextAreaElement ||
    alvo instanceof HTMLSelectElement ||
    (alvo instanceof HTMLElement && alvo.isContentEditable)
  )
}

/**
 * @param suspenso Em voo virtual o teclado e todo dele: W, A, S, D e as setas
 * pilotam, e um Delete no meio do voo apagava um waypoint sem ninguem pedir.
 */
export function useAtalhos(comandos: ComandosDeAtalho, suspenso: boolean): void {
  const actuais = useRef(comandos)
  actuais.current = comandos

  /*
   * A interrogacao tem ouvinte proprio, e nao e suspensa em voo virtual.
   *
   * Todos os outros atalhos sao suspensos porque em voo o teclado e do voo, e um
   * Delete no meio dele apagava um waypoint sem ninguem pedir. Abrir a folha de
   * atalhos nao edita nada - e precisamente em voo que ela faz mais falta, que e
   * onde estao as catorze teclas que ninguem decorou.
   */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (estaAEscrever(evento.target)) return
      if (evento.key !== '?') return
      evento.preventDefault()
      actuais.current.atalhos()
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  useEffect(() => {
    if (suspenso) return

    const aoTeclar = (evento: KeyboardEvent): void => {
      if (estaAEscrever(evento.target)) return

      const comando = evento.ctrlKey || evento.metaKey
      const tecla = evento.key.toLowerCase()

      if (comando && tecla === 'z') {
        evento.preventDefault()
        if (evento.shiftKey) actuais.current.refazer()
        else actuais.current.desfazer()
        return
      }
      if (comando && tecla === 'y') {
        evento.preventDefault()
        actuais.current.refazer()
        return
      }
      /*
       * Ctrl+A apanha a rota toda.
       *
       * O `preventDefault` importa: sem ele o browser selecciona tambem o texto
       * da pagina inteira por baixo, e fica tudo azul.
       */
      if (comando && tecla === 'a') {
        evento.preventDefault()
        actuais.current.seleccionarTudo()
        return
      }
      if (evento.shiftKey && tecla === 'f') {
        evento.preventDefault()
        actuais.current.fotografar()
        return
      }
      if (evento.key === 'Delete' || evento.key === 'Backspace') {
        evento.preventDefault()
        actuais.current.eliminar()
        return
      }
      if (evento.key === 'Escape') {
        actuais.current.escapar()
        return
      }
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault()
        actuais.current.mover(evento.key === 'ArrowDown' ? 1 : -1)
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [suspenso])
}
