/// <reference types="vite/client" />

/**
 * As duas variaveis que ligam o armazem remoto.
 *
 * Sem elas a aplicacao corre em IndexedDB, nesta maquina, sem conta nenhuma -
 * que e o que acontece a quem clona o repositorio e faz `npm run dev`.
 *
 * A chave anonima nao e um segredo: vai no pacote que o browser transfere e
 * qualquer pessoa a pode ler. O que protege os dados sao as politicas de linha
 * em `supabase/esquema.sql`, e e por isso que elas existem.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
