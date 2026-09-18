import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

/**
 * A ligacao ao armazem remoto, ou `null` quando ele nao esta configurado.
 *
 * Ser `null` e um modo de funcionamento e nao uma avaria: e assim que a
 * aplicacao corre em IndexedDB para quem clonou o repositorio, sem obrigar
 * ninguem a montar um projeto Firebase para poder abrir o `npm run dev`.
 *
 * Nenhum dos valores de configuracao e segredo. Vao todos no pacote que o
 * browser transfere e qualquer pessoa os pode ler - e assim que o Firebase do
 * lado do cliente funciona. O que protege os dados sao as regras em
 * `firestore.rules`, e e por isso que elas existem.
 *
 * ## Porque e que o SDK nao esta importado no topo deste ficheiro
 *
 * O Firebase eram trezentos e tal kilobytes que toda a gente descarregava,
 * incluindo quem nunca vai ter conta nenhuma - que hoje e toda a gente que abre
 * o sitio publicado, e sempre toda a gente que clona o repositorio. Um modo de
 * funcionamento que se escolhe por variaveis de ambiente nao pode custar o peso
 * dos dois modos a quem so usa um.
 *
 * Com o `import()` dentro da funcao, o SDK sai para um pedaco a parte e so e
 * pedido quando as variaveis existem. A verificacao da configuracao fica aqui em
 * cima, onde nao custa nada: sao quatro cadeias de texto.
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
export const remotoConfigurado =
  Boolean(configuracao.apiKey) &&
  Boolean(configuracao.authDomain) &&
  Boolean(configuracao.projectId) &&
  Boolean(configuracao.appId)

/**
 * As funcoes de autenticacao de que a sessao precisa.
 *
 * Vem daqui em vez de `sessao.ts` as importar por si: um `import` estatico de
 * `firebase/auth` la em cima trazia o SDK de volta para o pedaco principal e
 * desfazia tudo isto, sem nada a avisar.
 */
export type FuncoesDeAutenticacao = {
  isSignInWithEmailLink: typeof import('firebase/auth').isSignInWithEmailLink
  onAuthStateChanged: typeof import('firebase/auth').onAuthStateChanged
  sendSignInLinkToEmail: typeof import('firebase/auth').sendSignInLinkToEmail
  signInWithEmailLink: typeof import('firebase/auth').signInWithEmailLink
  signOut: typeof import('firebase/auth').signOut
}

export type Remoto = {
  autenticacao: Auth
  firestore: Firestore
  funcoes: FuncoesDeAutenticacao
}

/**
 * Liga ao Firebase, trazendo o SDK com ela.
 *
 * Devolve `null` quando nao ha configuracao, e tambem quando a ligacao falha:
 * uma rede que nao deixa chegar ao pedaco do SDK nao pode deixar a aplicacao em
 * branco, porque o modo local continua a funcionar perfeitamente sem ele.
 */
export async function ligarFirebase(): Promise<Remoto | null> {
  if (!remotoConfigurado) return null

  try {
    const [{ initializeApp }, auth, { initializeFirestore }] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])

    const app = initializeApp({
      apiKey: configuracao.apiKey ?? '',
      authDomain: configuracao.authDomain ?? '',
      projectId: configuracao.projectId ?? '',
      appId: configuracao.appId ?? '',
    })

    return {
      autenticacao: auth.getAuth(app),
      /*
       * `ignoreUndefinedProperties` esta ligado de proposito.
       *
       * O Firestore recusa por omissao um documento que leve `undefined` em
       * qualquer campo, e rebenta na gravacao. Uma rota tem campos opcionais - o
       * vento, por exemplo - e "esta rota nao tem vento apontado" escreve-se
       * naturalmente como `vento: undefined`. Sem isto, tirar o vento a uma rota
       * deixava de a conseguir gravar.
       */
      firestore: initializeFirestore(app, { ignoreUndefinedProperties: true }),
      funcoes: {
        isSignInWithEmailLink: auth.isSignInWithEmailLink,
        onAuthStateChanged: auth.onAuthStateChanged,
        sendSignInLinkToEmail: auth.sendSignInLinkToEmail,
        signInWithEmailLink: auth.signInWithEmailLink,
        signOut: auth.signOut,
      },
    }
  } catch {
    return null
  }
}
