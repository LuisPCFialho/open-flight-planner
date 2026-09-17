import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.ts'

/**
 * Quem esta a usar a aplicacao.
 *
 * Sem armazem remoto configurado nao ha conta nenhuma e o estado e `local`: os
 * projetos estao nesta maquina e nao ha a quem pedir identificacao. E o que
 * acontece a quem clona o repositorio.
 *
 * Com armazem remoto, a entrada e por ligacao enviada para o correio. Nao ha
 * palavra-passe nenhuma - nem para escolher, nem para recuperar, nem para
 * guardar em lado nenhum. O que se prova e o acesso a caixa de correio, que e
 * o que qualquer recuperacao de palavra-passe acaba por provar de qualquer
 * maneira.
 */

export type EstadoSessao =
  /** A perguntar ao Supabase se ja ha sessao guardada. */
  | { estado: 'a-carregar' }
  /** Sem armazem remoto: nao ha entrada nem ha contas. */
  | { estado: 'local' }
  | { estado: 'fora' }
  | { estado: 'dentro'; email: string }

export type Sessao = EstadoSessao & {
  /** Pede a ligacao de entrada. Devolve o erro, ou `null` se foi enviada. */
  entrar: (email: string) => Promise<string | null>
  sair: () => Promise<void>
}

export function useSessao(): Sessao {
  const [estado, setEstado] = useState<EstadoSessao>(
    supabase ? { estado: 'a-carregar' } : { estado: 'local' },
  )

  useEffect(() => {
    const cliente = supabase
    if (!cliente) return

    let cancelado = false

    const registar = (email: string | undefined): void => {
      if (cancelado) return
      setEstado(email ? { estado: 'dentro', email } : { estado: 'fora' })
    }

    /*
     * A sessao guardada e lida uma vez, e depois ouve-se o que muda.
     *
     * So o `onAuthStateChange` nao chega: ele dispara na entrada, na saida e na
     * renovacao, mas nao necessariamente para dizer "ja estavas dentro". Sem a
     * leitura inicial, recarregar a pagina com sessao valida ficava a pedir o
     * correio outra vez.
     */
    cliente.auth
      .getSession()
      .then(({ data }) => {
        registar(data.session?.user.email)
      })
      .catch(() => {
        if (!cancelado) setEstado({ estado: 'fora' })
      })

    const { data } = cliente.auth.onAuthStateChange((_evento, sessao) => {
      registar(sessao?.user.email)
    })

    return () => {
      cancelado = true
      data.subscription.unsubscribe()
    }
  }, [])

  const entrar = useCallback(async (email: string): Promise<string | null> => {
    const cliente = supabase
    if (!cliente) return 'não há armazém remoto configurado'

    const { error } = await cliente.auth.signInWithOtp({
      email,
      /*
       * A ligacao volta para onde se saiu.
       *
       * Sem isto o Supabase manda para o endereco do sitio configurado no
       * painel, que em pre-visualizacoes do Vercel nao e o que esta aberto -
       * clicava-se na ligacao e entrava-se noutro sitio.
       */
      options: { emailRedirectTo: window.location.origin },
    })

    return error ? error.message : null
  }, [])

  const sair = useCallback(async (): Promise<void> => {
    await supabase?.auth.signOut()
  }, [])

  return { ...estado, entrar, sair }
}
