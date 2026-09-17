import { useCallback, useEffect, useState } from 'react'
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
} from 'firebase/auth'
import { autenticacao } from './firebase.ts'

/**
 * Quem esta a usar a aplicacao.
 *
 * Sem armazem remoto configurado nao ha conta nenhuma e o estado e `local`: os
 * projetos estao nesta maquina e nao ha a quem pedir identificacao. E o que
 * acontece a quem clona o repositorio.
 *
 * Com armazem remoto, a entrada e por ligacao enviada para o correio. Nao ha
 * palavra-passe - nem para escolher, nem para recuperar, nem para guardar em
 * lado nenhum. O que se prova e o acesso a caixa de correio, que e o que
 * qualquer recuperacao de palavra-passe acaba por provar de qualquer maneira.
 */

/** Onde fica o endereco entre o pedido da ligacao e o regresso dela. */
const CHAVE_EMAIL = 'open-flight-planner:email-de-entrada'

export type EstadoSessao =
  /** A ver se ja ha sessao, ou a concluir a entrada pela ligacao. */
  | { estado: 'a-carregar' }
  /** Sem armazem remoto: nao ha entrada nem ha contas. */
  | { estado: 'local' }
  | { estado: 'fora' }
  | { estado: 'dentro'; email: string }

export type Sessao = EstadoSessao & {
  /** Pede a ligacao de entrada. Devolve a razao da falha, ou `null`. */
  entrar: (email: string) => Promise<string | null>
  /**
   * Conclui a entrada quando a ligacao foi aberta noutro sitio.
   *
   * `null` quando nao ha ligacao nenhuma por concluir - o caso normal. Quando
   * existe, o ecra de entrada pede a confirmacao do endereco em vez de mandar
   * outra ligacao.
   */
  concluir: ((email: string) => Promise<string | null>) | null
  sair: () => Promise<void>
}

function guardarEmail(email: string): void {
  try {
    localStorage.setItem(CHAVE_EMAIL, email)
  } catch {
    /* Sem sitio onde guardar, a ligacao pede o endereco ao voltar. */
  }
}

function lerEmailGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_EMAIL)
  } catch {
    return null
  }
}

function esquecerEmail(): void {
  try {
    localStorage.removeItem(CHAVE_EMAIL)
  } catch {
    /* Nada a fazer, e nada se perde por isso. */
  }
}

/**
 * Tira da barra de enderecos o que a ligacao de entrada la deixou.
 *
 * Sem isto, recarregar a pagina tentava usar outra vez uma ligacao ja gasta e o
 * que aparecia era um erro em vez da aplicacao.
 */
function limparEndereco(): void {
  window.history.replaceState({}, '', window.location.pathname)
}

/*
 * A conclusao da ligacao so se tenta uma vez por carregamento.
 *
 * Em modo estrito o React monta o efeito duas vezes, e a segunda tentativa usa
 * uma ligacao ja gasta: a entrada funcionava e aparecia um erro por cima.
 */
let jaTentouAEntrada = false

export function useSessao(): Sessao {
  const [estado, setEstado] = useState<EstadoSessao>(
    autenticacao ? { estado: 'a-carregar' } : { estado: 'local' },
  )
  const [porConcluir, setPorConcluir] = useState(false)

  useEffect(() => {
    const auth = autenticacao
    if (!auth) return

    const naLigacao = isSignInWithEmailLink(auth, window.location.href)
    const guardado = lerEmailGuardado()

    if (naLigacao && !guardado) {
      /*
       * A ligacao foi aberta noutro browser - tipicamente no telemovel, porque
       * foi la que o correio chegou. O Firebase exige o endereco para concluir,
       * e ele ficou no browser onde se pediu. Pede-se de novo, uma vez.
       */
      setPorConcluir(true)
      setEstado({ estado: 'fora' })
      return
    }

    if (naLigacao && guardado && !jaTentouAEntrada) {
      jaTentouAEntrada = true
      signInWithEmailLink(auth, guardado, window.location.href)
        .then(() => {
          esquecerEmail()
          limparEndereco()
        })
        .catch(() => {
          esquecerEmail()
          limparEndereco()
          setEstado({ estado: 'fora' })
        })
    }

    const largar = onAuthStateChanged(auth, (utilizador) => {
      setEstado(
        utilizador?.email ? { estado: 'dentro', email: utilizador.email } : { estado: 'fora' },
      )
    })

    return largar
  }, [])

  const entrar = useCallback(async (email: string): Promise<string | null> => {
    const auth = autenticacao
    if (!auth) return 'não há armazém remoto configurado'

    try {
      await sendSignInLinkToEmail(auth, email, {
        /*
         * A ligacao volta para onde se saiu.
         *
         * Sem isto voltava para o endereco configurado no painel, que numa
         * pre-visualizacao do Vercel nao e o que esta aberto - clicava-se na
         * ligacao e entrava-se noutro sitio.
         */
        url: window.location.origin,
        handleCodeInApp: true,
      })
      guardarEmail(email)
      return null
    } catch (causa: unknown) {
      return causa instanceof Error ? causa.message : 'falha a enviar a ligação'
    }
  }, [])

  const concluir = useCallback(async (email: string): Promise<string | null> => {
    const auth = autenticacao
    if (!auth) return 'não há armazém remoto configurado'

    try {
      await signInWithEmailLink(auth, email, window.location.href)
      esquecerEmail()
      limparEndereco()
      setPorConcluir(false)
      return null
    } catch (causa: unknown) {
      return causa instanceof Error ? causa.message : 'não foi possível concluir a entrada'
    }
  }, [])

  const sair = useCallback(async (): Promise<void> => {
    if (autenticacao) await signOut(autenticacao)
  }, [])

  return { ...estado, entrar, concluir: porConcluir ? concluir : null, sair }
}
