/// <reference types="vite/client" />

/**
 * As variaveis que ligam o armazem remoto.
 *
 * Sem elas a aplicacao corre em IndexedDB, nesta maquina, sem conta nenhuma -
 * que e o que acontece a quem clona o repositorio e faz `npm run dev`.
 *
 * Nenhuma delas e um segredo: vao no pacote que o browser transfere e qualquer
 * pessoa as pode ler. O que protege os dados sao as regras em
 * `firestore.rules`, e e por isso que elas existem.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Data e commit de quem construiu este pacote, posto pelo `vite.config.ts`.
 *
 * Aparece no canto do mapa para se poder confirmar, de relance, que o que esta
 * no ecra e mesmo a versao que se acabou de construir - e nao uma pagina que o
 * browser guardou.
 */
declare const __MARCA_DA_CONSTRUCAO__: string
