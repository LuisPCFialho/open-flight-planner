import type { POI, Rota } from './tipos.ts'
import { novoId } from './ids.ts'

/**
 * Pontos de interesse.
 *
 * Um waypoint em `towardPOI` aponta a aeronave a um POI. Se o POI desaparecer e
 * a referencia ficar pendurada, o waypoint fica com um modo de guinada que nao
 * tem para onde apontar, e o KMZ sai com um `waypointPoiPoint` invalido. Por
 * isso apagar um POI limpa sempre quem o referenciava.
 */

export function poiNovo(dados: { nome?: string; lat: number; lon: number; altura: number }): POI {
  return {
    id: novoId(),
    nome: dados.nome ?? 'POI',
    lat: dados.lat,
    lon: dados.lon,
    altura: dados.altura,
  }
}

export function acrescentarPOI(rota: Rota, poi: POI): Rota {
  return { ...rota, pois: [...rota.pois, poi] }
}

export function alterarPOI(rota: Rota, id: string, alteracao: Partial<Omit<POI, 'id'>>): Rota {
  return { ...rota, pois: rota.pois.map((poi) => (poi.id === id ? { ...poi, ...alteracao } : poi)) }
}

/**
 * Apaga um POI e repoe em `followWayline` os waypoints que o seguiam, para nao
 * ficar nenhum a apontar para o vazio.
 */
export function removerPOI(rota: Rota, id: string): Rota {
  return {
    ...rota,
    pois: rota.pois.filter((poi) => poi.id !== id),
    waypoints: rota.waypoints.map((waypoint) => {
      if (waypoint.poiId !== id) return waypoint
      const { poiId: _removido, ...resto } = waypoint
      return { ...resto, modoGuinada: 'followWayline' as const }
    }),
  }
}

/** Associa um POI a varios waypoints e poe-nos a apontar-lhe. */
export function associarPOI(rota: Rota, waypointIds: readonly string[], poiId: string): Rota {
  const alvos = new Set(waypointIds)
  return {
    ...rota,
    waypoints: rota.waypoints.map((waypoint) =>
      alvos.has(waypoint.id) ? { ...waypoint, poiId, modoGuinada: 'towardPOI' as const } : waypoint,
    ),
  }
}

/** Desassocia o POI e devolve a guinada ao percurso. */
export function desassociarPOI(rota: Rota, waypointIds: readonly string[]): Rota {
  const alvos = new Set(waypointIds)
  return {
    ...rota,
    waypoints: rota.waypoints.map((waypoint) => {
      if (!alvos.has(waypoint.id)) return waypoint
      const { poiId: _removido, ...resto } = waypoint
      return { ...resto, modoGuinada: 'followWayline' as const }
    }),
  }
}

export function poiComId(rota: Rota, id: string | undefined): POI | undefined {
  if (id === undefined) return undefined
  return rota.pois.find((poi) => poi.id === id)
}

/** Waypoints em `towardPOI` cujo POI ja nao existe. */
export function waypointsComPOIPerdido(rota: Rota): number[] {
  const existentes = new Set(rota.pois.map((poi) => poi.id))
  return rota.waypoints
    .filter((w) => w.modoGuinada === 'towardPOI' && (!w.poiId || !existentes.has(w.poiId)))
    .map((w) => w.index)
}
