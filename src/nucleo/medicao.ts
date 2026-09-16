import type { LatLon } from './tipos.ts'
import { comprimento, distancia } from './geodesia.ts'
import { areaDoContorno } from './areas.ts'

/**
 * A regua: medir no mapa sem mexer na rota.
 *
 * Ao planear uma central pergunta-se a toda a hora quanto mede uma fila, que
 * afastamento ha entre duas, e que area tem um talhao. Sem regua, isso fazia-se
 * marcando waypoints a titulo de ensaio e apagando-os a seguir - com o risco de
 * ficar um esquecido no meio da rota.
 */

export type Medicao = {
  pontos: readonly LatLon[]
  /** Metros ao longo da linha quebrada. */
  distancia: number
  /** Metros do ultimo troco, que e o que se esta a medir agora. */
  ultimoTroco: number
  /**
   * Metros quadrados do poligono fechado, ou `null` com menos de tres pontos.
   *
   * Com dois pontos ha uma linha e nao ha area; mostrar zero dava a entender
   * que a area era zero, e o que se passa e que ela ainda nao existe.
   */
  area: number | null
}

export function medir(pontos: readonly LatLon[]): Medicao {
  const ultimo = pontos.length >= 2 ? pontos[pontos.length - 1] : undefined
  const penultimo = pontos.length >= 2 ? pontos[pontos.length - 2] : undefined

  return {
    pontos,
    distancia: comprimento(pontos),
    ultimoTroco: ultimo && penultimo ? distancia(penultimo, ultimo) : 0,
    area: pontos.length >= 3 ? areaDoContorno(pontos) : null,
  }
}

/**
 * Formata metros como se lêem numa obra: em metros ate ao quilometro, e em
 * quilometros a partir dai.
 */
export function formatarDistancia(metros: number): string {
  if (metros < 1000) return `${metros.toFixed(1)} m`
  return `${(metros / 1000).toFixed(3)} km`
}
