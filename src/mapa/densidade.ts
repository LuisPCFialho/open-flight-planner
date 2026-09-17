import type { LatLon } from '../nucleo/tipos.ts'
import { distancia } from '../nucleo/geodesia.ts'

/**
 * Quando os marcadores numerados deixam de caber.
 *
 * Numa rota de cobertura as fotos ficam a vinte metros umas das outras. Vistos
 * de cima, os cento e oito circulos numerados sobrepoem-se num bloco de onde
 * nao se le numero nenhum nem se percebe por onde a rota passa - e isso
 * acontece precisamente no caso de uso principal desta ferramenta.
 *
 * Abaixo do limiar, os marcadores encolhem para pontos e o numero sai. Quem
 * precisar do numero aproxima a vista, que e o gesto natural e e quando o
 * numero volta.
 */

/** Largura do marcador em pixeis, mais uma folga para nao se tocarem. */
export const LIMIAR_PIXEIS = 26

/** Metros que cabem num pixel do ecra, a latitude e ao zoom dados. */
export function metrosPorPixel(latitude: number, zoom: number): number {
  const circunferencia = 40075016.686 * Math.cos((latitude * Math.PI) / 180)
  return circunferencia / (512 * Math.pow(2, zoom))
}

/**
 * Distancia tipica entre waypoints seguidos, em metros.
 *
 * E a mediana e nao a media: uma rota de cobertura tem dezenas de saltos curtos
 * entre fotos e meia duzia de transicoes longas entre passagens, e a media
 * deixava-se puxar por estas ultimas ate dizer que ha espaco de sobra.
 */
export function espacamentoTipico(waypoints: readonly LatLon[]): number | null {
  if (waypoints.length < 2) return null

  const saltos: number[] = []
  for (let i = 1; i < waypoints.length; i++) {
    const de = waypoints[i - 1]
    const para = waypoints[i]
    if (de && para) saltos.push(distancia(de, para))
  }
  if (saltos.length === 0) return null

  saltos.sort((a, b) => a - b)
  const meio = Math.floor(saltos.length / 2)
  if (saltos.length % 2 === 1) return saltos[meio] ?? null

  const antes = saltos[meio - 1]
  const depois = saltos[meio]
  return antes !== undefined && depois !== undefined ? (antes + depois) / 2 : null
}

/** Se os marcadores se atropelam ao zoom actual. */
export function marcadoresDensos(
  waypoints: readonly LatLon[],
  latitude: number,
  zoom: number,
  limiarPixeis: number = LIMIAR_PIXEIS,
): boolean {
  const espacamento = espacamentoTipico(waypoints)
  if (espacamento === null) return false

  const porPixel = metrosPorPixel(latitude, zoom)
  if (!(porPixel > 0)) return false

  return espacamento / porPixel < limiarPixeis
}
