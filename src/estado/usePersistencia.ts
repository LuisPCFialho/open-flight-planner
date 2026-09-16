import { useCallback, useEffect, useRef } from 'react'
import type { Rota } from '../nucleo/tipos.ts'

/**
 * Gravar a rota sem gravar a cada pixel de arrasto.
 *
 * A folga tinha um buraco que custou trabalho a alguem: trocar de rota dentro
 * desse intervalo cancelava o temporizador e a ultima edicao nunca chegava a ser
 * pedida a base de dados. Nao havia promessa rejeitada, nao havia erro, a
 * alteracao estava no ecra - e ao reabrir a rota tinha desaparecido.
 *
 * A rota pendente fica num `ref` para poder ser gravada a pedido, e nao so por
 * tempo. Quem troca de rota chama `gravarPendente` primeiro.
 *
 * Fechar o separador ou recarregar a pagina dentro da folga perdia a edicao pela
 * mesma razao. O `visibilitychange` e o unico momento em que o browser garante
 * que ainda ha tempo de escrever; o `beforeunload` ja nao o garante.
 */

/** Milesimos a esperar antes de escrever. Um arrasto emite muito mais do que um. */
export const FOLGA_DE_GRAVACAO = 400

export type Persistencia = {
  /** Grava ja o que estiver pendente. Chama-se antes de trocar de rota. */
  gravarPendente: () => void
  /**
   * Deita fora o que estiver pendente, sem gravar.
   *
   * E o que se faz antes de apagar a rota: a gravacao pendente e dela, e
   * deixa-la correr repunha-a na base de dados depois de apagada.
   */
  esquecerPendente: () => void
}

export function usePersistenciaDaRota(
  rota: Rota | null,
  gravar: (rota: Rota) => Promise<unknown>,
  folgaMs: number = FOLGA_DE_GRAVACAO,
): Persistencia {
  const porGravar = useRef<Rota | null>(null)
  const gravarActual = useRef(gravar)
  gravarActual.current = gravar

  useEffect(() => {
    if (!rota) return
    porGravar.current = rota

    /*
     * O temporizador le o pendente, e nao a rota que fechou sobre ele.
     *
     * Com a rota fechada, gravar a pedido e deixar o temporizador correr dava
     * duas escritas da mesma coisa - e, pior, `esquecerPendente` nao impedia
     * nada: a rota apagada voltava a ser escrita 400 ms depois de se apagar.
     */
    const temporizador = setTimeout(() => {
      const pendente = porGravar.current
      if (!pendente) return
      porGravar.current = null
      void gravarActual.current(pendente)
    }, folgaMs)

    return () => clearTimeout(temporizador)
  }, [rota, folgaMs])

  const gravarPendente = useCallback(() => {
    const pendente = porGravar.current
    if (!pendente) return
    porGravar.current = null
    void gravarActual.current(pendente)
  }, [])

  const esquecerPendente = useCallback(() => {
    porGravar.current = null
  }, [])

  useEffect(() => {
    const aoEsconder = (): void => {
      if (document.visibilityState === 'hidden') gravarPendente()
    }
    document.addEventListener('visibilitychange', aoEsconder)
    window.addEventListener('pagehide', gravarPendente)
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder)
      window.removeEventListener('pagehide', gravarPendente)
    }
  }, [gravarPendente])

  return { gravarPendente, esquecerPendente }
}
