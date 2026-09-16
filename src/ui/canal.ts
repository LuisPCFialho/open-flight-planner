import { useMemo, useSyncExternalStore } from 'react'

/**
 * Um valor que muda depressa de mais para viver no estado da aplicacao.
 *
 * As coordenadas sob o cursor e a orientacao do mapa mudam a cada fotograma.
 * Em `useState`, cada uma dessas mudancas renderiza a arvore inteira - mapa,
 * listas, paineis, perfil - para actualizar um punhado de numeros num canto do
 * ecra. Medido com 120 waypoints: 45 fotogramas por segundo ao rodar o mapa, 21
 * se o rato tambem se mexesse.
 *
 * Um canal e uma fonte externa a que so quem mostra o valor se liga. Quem
 * escreve nao provoca render nenhum a nao ser nesse componente.
 */

export type Canal<T> = {
  escrever: (valor: T) => void
  subscrever: (aviso: () => void) => () => void
  ler: () => T
}

export function criarCanal<T>(inicial: T): Canal<T> {
  let actual = inicial
  const ouvintes = new Set<() => void>()

  return {
    escrever(valor) {
      actual = valor
      for (const aviso of ouvintes) aviso()
    },
    subscrever(aviso) {
      ouvintes.add(aviso)
      return () => ouvintes.delete(aviso)
    },
    ler: () => actual,
  }
}

/**
 * Um canal estavel durante toda a vida do componente.
 *
 * O valor inicial e lido uma so vez, no primeiro render: o canal nao pode ser
 * substituido a meio sem os subscritores ficarem ligados a um canal morto.
 */
export function useCanal<T>(inicial: T): Canal<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => criarCanal(inicial), [])
}

/** Le o canal, e volta a renderizar so este componente quando ele muda. */
export function useValorDoCanal<T>(canal: Canal<T>): T {
  return useSyncExternalStore(canal.subscrever, canal.ler, canal.ler)
}
