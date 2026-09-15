import type { LatLon, Rota } from './tipos.ts'
import { distancia, paraASL } from './geodesia.ts'

/**
 * Perfil do terreno ao longo da rota, com a linha de voo sobreposta.
 *
 * E a peca que mostra o que um ficheiro de rota esconde: uma altura constante
 * sobre terreno acidentado passa a alturas do solo completamente diferentes de
 * ponto para ponto, e so vendo o corte se percebe.
 */

export type AmostraPerfil = {
  /** Distancia percorrida desde o primeiro waypoint, em metros. */
  percurso: number
  /** Cota ortometrica do terreno. */
  cotaTerreno: number
  /** Altura de voo ortometrica, interpolada entre waypoints. */
  aslVoo: number
  /** Altura acima do solo. */
  acimaDoSolo: number
}

export type MarcaWaypoint = AmostraPerfil & { indice: number }

export type Perfil = {
  amostras: AmostraPerfil[]
  waypoints: MarcaWaypoint[]
  percursoTotal: number
  cotaMinima: number
  cotaMaxima: number
  aglMinimo: number
  aglMaximo: number
}

const VAZIO: Perfil = {
  amostras: [],
  waypoints: [],
  percursoTotal: 0,
  cotaMinima: 0,
  cotaMaxima: 0,
  aglMinimo: 0,
  aglMaximo: 0,
}

/**
 * Altura de voo numa distancia qualquer do percurso, interpolada linearmente
 * entre waypoints. E assim que a aeronave sobe e desce entre pontos.
 */
export function interpolarAltura(
  percursoWaypoints: readonly number[],
  alturas: readonly number[],
  distanciaAlvo: number,
): number | null {
  const primeiro = alturas[0]
  if (primeiro === undefined) return null
  if (distanciaAlvo <= 0) return primeiro

  for (let i = 1; i < percursoWaypoints.length; i++) {
    const inicio = percursoWaypoints[i - 1]
    const fim = percursoWaypoints[i]
    const alturaInicio = alturas[i - 1]
    const alturaFim = alturas[i]
    if (inicio === undefined || fim === undefined) continue
    if (alturaInicio === undefined || alturaFim === undefined) continue

    if (distanciaAlvo <= fim) {
      const extensao = fim - inicio
      if (extensao <= 0) return alturaFim
      return alturaInicio + (alturaFim - alturaInicio) * ((distanciaAlvo - inicio) / extensao)
    }
  }
  return alturas.at(-1) ?? null
}

/** Distancia acumulada de cada waypoint desde o inicio da rota. */
export function percursoDosWaypoints(rota: Rota): number[] {
  const percurso: number[] = []
  let acumulado = 0
  for (const [i, waypoint] of rota.waypoints.entries()) {
    if (i > 0) {
      const anterior = rota.waypoints[i - 1]
      if (anterior) acumulado += distancia(anterior, waypoint)
    }
    percurso.push(acumulado)
  }
  return percurso
}

export function calcularPerfil(
  rota: Rota,
  amostrado: { pontos: readonly LatLon[]; cotas: readonly number[] },
  cotasWaypoints: ReadonlyMap<string, number>,
  chave: (ponto: LatLon) => string,
): Perfil {
  if (rota.waypoints.length === 0 || amostrado.pontos.length === 0) return VAZIO

  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno
  const percursoWaypoints = percursoDosWaypoints(rota)

  const aslWaypoints = rota.waypoints.map((waypoint) => {
    const cota = cotasWaypoints.get(chave(waypoint)) ?? cotaDescolagem
    return paraASL(waypoint.altura, rota.modoAltitude, { cotaDescolagem, cotaTerreno: cota })
  })

  const amostras: AmostraPerfil[] = []
  let acumulado = 0

  for (const [i, ponto] of amostrado.pontos.entries()) {
    if (i > 0) {
      const anterior = amostrado.pontos[i - 1]
      if (anterior) acumulado += distancia(anterior, ponto)
    }
    const cotaTerreno = amostrado.cotas[i]
    if (cotaTerreno === undefined) continue

    const aslVoo = interpolarAltura(percursoWaypoints, aslWaypoints, acumulado)
    if (aslVoo === null) continue

    amostras.push({
      percurso: acumulado,
      cotaTerreno,
      aslVoo,
      acimaDoSolo: aslVoo - cotaTerreno,
    })
  }

  const marcas: MarcaWaypoint[] = rota.waypoints.flatMap((waypoint, i) => {
    const percurso = percursoWaypoints[i]
    const aslVoo = aslWaypoints[i]
    const cotaTerreno = cotasWaypoints.get(chave(waypoint))
    if (percurso === undefined || aslVoo === undefined || cotaTerreno === undefined) return []
    return [
      { indice: waypoint.index, percurso, cotaTerreno, aslVoo, acimaDoSolo: aslVoo - cotaTerreno },
    ]
  })

  const cotas = amostras.flatMap((a) => [a.cotaTerreno, a.aslVoo])
  const agls = amostras.map((a) => a.acimaDoSolo)

  return {
    amostras,
    waypoints: marcas,
    percursoTotal: amostras.at(-1)?.percurso ?? 0,
    cotaMinima: Math.min(...cotas),
    cotaMaxima: Math.max(...cotas),
    aglMinimo: agls.length > 0 ? Math.min(...agls) : 0,
    aglMaximo: agls.length > 0 ? Math.max(...agls) : 0,
  }
}
