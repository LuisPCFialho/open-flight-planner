import { useMemo, useSyncExternalStore } from 'react'
import type { CursorTerreno } from '../mapa/Mapa.tsx'

/**
 * As coordenadas e a cota sob o cursor, com estado proprio.
 *
 * Isto estava em `useState` na aplicacao, e cada movimento do rato renderizava
 * a arvore inteira - mapa, listas, paineis, perfil - para actualizar tres
 * numeros na barra de estado. Medido com 120 waypoints: 45 fotogramas por
 * segundo ao rodar o mapa, 21 se o rato tambem se mexesse. Metade do orcamento
 * de cada fotograma ia para um render que so mudava esta linha de texto.
 *
 * O canal e uma fonte externa a que so este componente se liga. Quem escreve
 * nao provoca render nenhum a nao ser aqui.
 */

export type CanalCursor = {
  escrever: (cursor: CursorTerreno | null) => void
  subscrever: (aviso: () => void) => () => void
  ler: () => CursorTerreno | null
}

export function criarCanalCursor(): CanalCursor {
  let actual: CursorTerreno | null = null
  const ouvintes = new Set<() => void>()

  return {
    escrever(cursor) {
      actual = cursor
      for (const aviso of ouvintes) aviso()
    },
    subscrever(aviso) {
      ouvintes.add(aviso)
      return () => ouvintes.delete(aviso)
    },
    ler: () => actual,
  }
}

/** Liga um canal novo, estavel durante toda a vida do componente. */
export function useCanalCursor(): CanalCursor {
  return useMemo(criarCanalCursor, [])
}

export function LeituraCursor({
  canal,
  ondulacaoGeoide,
}: {
  canal: CanalCursor
  /** Separacao entre o geoide e o elipsoide, para dar a altura HAE. */
  ondulacaoGeoide: number
}) {
  const cursor = useSyncExternalStore(canal.subscrever, canal.ler, canal.ler)
  const cota = cursor?.cotaTerreno ?? null

  return (
    <>
      <span className="numerico">
        {cursor ? `${cursor.lat.toFixed(6)}, ${cursor.lon.toFixed(6)}` : '--'}
      </span>
      <span className="numerico" title="Cota ortométrica do terreno sob o cursor">
        ASL: {cota === null ? '--' : `${cota.toFixed(1)} m`}
      </span>
      <span className="numerico" title="Altura elipsoidal do terreno sob o cursor">
        HAE: {cota === null ? '--' : `${(cota + ondulacaoGeoide).toFixed(1)} m`}
      </span>
    </>
  )
}
