/**
 * Aviso de que alguma coisa mudou no armazem.
 *
 * O ecra de projetos e o selector de rotas liam directamente a base com o
 * `useLiveQuery` do Dexie, que os punha a par sozinho. Com duas implementacoes
 * de armazem isso deixa de servir: o Postgres nao tem `useLiveQuery`, e ter um
 * caminho de codigo em cada componente por cada armazem era pior do que o
 * problema.
 *
 * Cada escrita anuncia-se aqui e quem esta a mostrar uma lista volta a
 * perguntar. E menos fino do que observar a consulta, e chega: as listas sao de
 * dezenas de linhas e as escritas sao de quem esta a usar a aplicacao.
 *
 * O `BroadcastChannel` mantem o que o `useLiveQuery` dava de graca e ninguem
 * pediu mas se notava: duas abas abertas no mesmo projeto ficam de acordo.
 */

const CANAL = 'open-flight-planner:armazem'

const ouvintes = new Set<() => void>()

/*
 * O canal so se abre a primeira vez que alguem escuta, e nunca em Node.
 *
 * Os testes correm em jsdom, que tem `BroadcastChannel`, e em Node, que nos
 * ensaios de nucleo nao tem janela nenhuma. Abrir a olhos fechados rebentava o
 * modulo ao ser importado, que e a pior altura para rebentar.
 */
let canal: BroadcastChannel | null = null

function abrirCanal(): void {
  if (canal || typeof BroadcastChannel === 'undefined') return
  canal = new BroadcastChannel(CANAL)
  canal.onmessage = () => {
    for (const ouvinte of ouvintes) ouvinte()
  }
}

/** Regista um ouvinte e devolve a funcao que o tira. */
export function aoMudar(ouvinte: () => void): () => void {
  abrirCanal()
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/** Diz a quem esta a mostrar listas que volte a perguntar. */
export function anunciarMudanca(): void {
  for (const ouvinte of ouvintes) ouvinte()
  canal?.postMessage('mudou')
}
