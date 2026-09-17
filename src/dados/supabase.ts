import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * O cliente do armazem remoto, ou `null` quando ele nao esta configurado.
 *
 * Ser `null` e um modo de funcionamento e nao uma avaria: e assim que a
 * aplicacao corre em IndexedDB para quem clonou o repositorio, sem obrigar
 * ninguem a criar um projeto Supabase para poder abrir o `npm run dev`.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabase: SupabaseClient | null =
  url && chave
    ? createClient(url, chave, {
        auth: {
          /*
           * A sessao fica guardada e renova-se sozinha.
           *
           * E o que faz com que fechar o separador e voltar amanha caia no
           * mesmo sitio em vez de pedir o correio outra vez. Sem
           * `autoRefreshToken`, a sessao morria ao fim de uma hora a meio de um
           * planeamento e a gravacao seguinte falhava sem razao visivel.
           */
          persistSession: true,
          autoRefreshToken: true,
          /* A ligacao do correio traz a sessao no proprio endereco. */
          detectSessionInUrl: true,
        },
      })
    : null

/** Se ha armazem remoto configurado. Decide se ha ecra de entrada. */
export const remotoConfigurado = supabase !== null
