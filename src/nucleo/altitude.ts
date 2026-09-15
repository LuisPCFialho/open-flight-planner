import type { LatLon, ModoAltitude, Rota } from './tipos.ts'
import { deASL, paraASL } from './geodesia.ts'

/**
 * Mudanca do modo de altitude de uma rota inteira.
 *
 * Mudar de AGL para ASL nao pode mexer na posicao fisica de nenhum waypoint: so
 * muda a forma como a altura e escrita. Para isso e preciso a cota do terreno na
 * vertical de cada ponto, e se faltar alguma a conversao nao se faz. Converter
 * metade da rota e deixar a outra metade com numeros do modo anterior poe a rota
 * a voar onde ninguem mandou.
 */

export type CotasPorPosicao = ReadonlyMap<string, number>

export type ResultadoConversao =
  | { estado: 'convertida'; rota: Rota }
  | { estado: 'semAlteracao'; rota: Rota }
  | { estado: 'faltamCotas'; indicesEmFalta: number[] }

/** Chave usada na tabela de cotas. Tem de coincidir com `chaveDaPosicao` do estado. */
export type ChaveDePosicao = (ponto: LatLon) => string

export function converterModoAltitude(
  rota: Rota,
  novoModo: ModoAltitude,
  cotas: CotasPorPosicao,
  chave: ChaveDePosicao,
): ResultadoConversao {
  if (novoModo === rota.modoAltitude) return { estado: 'semAlteracao', rota }

  const indicesEmFalta: number[] = []
  for (const waypoint of rota.waypoints) {
    if (!cotas.has(chave(waypoint))) indicesEmFalta.push(waypoint.index)
  }
  for (const poi of rota.pois) {
    if (!cotas.has(chave(poi))) indicesEmFalta.push(-1)
  }
  if (indicesEmFalta.length > 0) return { estado: 'faltamCotas', indicesEmFalta }

  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno

  const waypoints = rota.waypoints.map((waypoint) => {
    const cotaTerreno = cotas.get(chave(waypoint)) ?? cotaDescolagem
    const ctx = { cotaDescolagem, cotaTerreno }
    return { ...waypoint, altura: deASL(paraASL(waypoint.altura, rota.modoAltitude, ctx), novoModo, ctx) }
  })

  const pois = rota.pois.map((poi) => {
    const cotaTerreno = cotas.get(chave(poi)) ?? cotaDescolagem
    const ctx = { cotaDescolagem, cotaTerreno }
    return { ...poi, altura: deASL(paraASL(poi.altura, rota.modoAltitude, ctx), novoModo, ctx) }
  })

  return { estado: 'convertida', rota: { ...rota, modoAltitude: novoModo, waypoints, pois } }
}

/**
 * Recalcula as alturas para uma altura constante acima do solo.
 *
 * E o botao "Nivelar acima do solo". Numa rota com altura fixa relativa a
 * descolagem sobre terreno acidentado, e isto que a torna voavel.
 */
export function nivelarAcimaDoSolo(
  rota: Rota,
  alturaAcimaDoSolo: number,
  cotas: CotasPorPosicao,
  chave: ChaveDePosicao,
): ResultadoConversao {
  const indicesEmFalta = rota.waypoints
    .filter((w) => !cotas.has(chave(w)))
    .map((w) => w.index)
  if (indicesEmFalta.length > 0) return { estado: 'faltamCotas', indicesEmFalta }

  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno

  const waypoints = rota.waypoints.map((waypoint) => {
    const cotaTerreno = cotas.get(chave(waypoint)) ?? cotaDescolagem
    const ctx = { cotaDescolagem, cotaTerreno }
    const asl = paraASL(alturaAcimaDoSolo, 'AGL', ctx)
    return { ...waypoint, altura: deASL(asl, rota.modoAltitude, ctx) }
  })

  return { estado: 'convertida', rota: { ...rota, waypoints } }
}

/** Altura acima do solo de cada waypoint, `null` onde a cota ainda nao chegou. */
export function alturasAcimaDoSolo(
  rota: Rota,
  cotas: CotasPorPosicao,
  chave: ChaveDePosicao,
): (number | null)[] {
  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno
  return rota.waypoints.map((waypoint) => {
    const cotaTerreno = cotas.get(chave(waypoint))
    if (cotaTerreno === undefined) return null
    const ctx = { cotaDescolagem, cotaTerreno }
    return paraASL(waypoint.altura, rota.modoAltitude, ctx) - cotaTerreno
  })
}
