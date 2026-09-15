import proj4 from 'proj4'
import type { LatLon } from '../nucleo/tipos.ts'

/**
 * Conversao entre WGS84 e ETRS89 / PT-TM06, o sistema da cartografia
 * portuguesa, onde vem a topografia de obra.
 *
 * EPSG:3763. Transversa de Mercator com origem no ponto central de Portugal
 * continental, sem falsas origens, sobre o elipsoide GRS80. Como o ETRS89 e o
 * WGS84 coincidem ao centimetro em Portugal, nao ha transformacao de datum
 * pelo meio.
 */

export const EPSG_3763 =
  '+proj=tmerc +lat_0=39.6682583333333 +lon_0=-8.13310833333333 +k=1 +x_0=0 +y_0=0 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'

export const EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs'

proj4.defs('EPSG:3763', EPSG_3763)

export type PontoPTTM06 = { x: number; y: number }

export function ptTm06ParaWgs84(ponto: PontoPTTM06): LatLon {
  const [lon, lat] = proj4(EPSG_3763, EPSG_4326, [ponto.x, ponto.y])
  if (lon === undefined || lat === undefined) {
    throw new Error(`nao foi possivel converter ${ponto.x}, ${ponto.y} de PT-TM06`)
  }
  return { lat, lon }
}

export function wgs84ParaPtTm06(ponto: LatLon): PontoPTTM06 {
  const [x, y] = proj4(EPSG_4326, EPSG_3763, [ponto.lon, ponto.lat])
  if (x === undefined || y === undefined) {
    throw new Error(`nao foi possivel converter ${ponto.lat}, ${ponto.lon} para PT-TM06`)
  }
  return { x, y }
}
