import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'

/**
 * A ligacao ao armazem remoto, ou `null` quando ele nao esta configurado.
 *
 * Ser `null` e um modo de funcionamento e nao uma avaria: e assim que a
 * aplicacao corre em IndexedDB para quem clonou o repositorio, sem obrigar
 * ninguem a montar um projeto Firebase para poder abrir o `npm run dev`.
 *
 * Nenhum destes valores e segredo. Vao todos no pacote que o browser transfere
 * e qualquer pessoa os pode ler - e assim que o Firebase do lado do cliente
 * funciona. O que protege os dados sao as regras em `firestore.rules`, e e por
 * isso que elas existem.
 */

const configuracao = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
}

/*
 * Ou estao todas, ou nao esta nenhuma.
 *
 * Com metade das variaveis o `initializeApp` aceita na mesma e so rebenta mais
 * tarde, num pedido, com uma mensagem que nao aponta para a configuracao. Uma
 * configuracao incompleta e um erro de montagem, e vale mais cair para o modo
 * local do que arrancar meio ligado.
 */
const completa =
  Boolean(configuracao.apiKey) &&
  Boolean(configuracao.authDomain) &&
  Boolean(configuracao.projectId) &&
  Boolean(configuracao.appId)

const app: FirebaseApp | null = completa
  ? initializeApp({
      apiKey: configuracao.apiKey ?? '',
      authDomain: configuracao.authDomain ?? '',
      projectId: configuracao.projectId ?? '',
      appId: configuracao.appId ?? '',
    })
  : null

export const autenticacao: Auth | null = app ? getAuth(app) : null
/*
 * `ignoreUndefinedProperties` esta ligado de proposito.
 *
 * O Firestore recusa por omissao um documento que leve `undefined` em qualquer
 * campo, e rebenta na gravacao. Uma rota tem campos opcionais - o vento, por
 * exemplo - e "esta rota nao tem vento apontado" escreve-se naturalmente como
 * `vento: undefined`. Sem isto, tirar o vento a uma rota deixava de a conseguir
 * gravar, e o erro so aparecia a quem tivesse contas ligadas.
 *
 * Com a opcao, o campo simplesmente nao vai para o documento, que e exactamente
 * o que se quer dizer.
 */
export const firestore: Firestore | null = app
  ? initializeFirestore(app, { ignoreUndefinedProperties: true })
  : null

/** Se ha armazem remoto configurado. Decide se ha ecra de entrada. */
export const remotoConfigurado = app !== null
