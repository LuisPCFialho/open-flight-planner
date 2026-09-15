import type { Area, LatLon } from './tipos.ts'
import { deslocamentoLocal } from './geodesia.ts'

/**
 * Contas sobre as areas de referencia importadas de KMZ ou KML.
 *
 * A area sai da formula do sapateiro sobre deslocamentos locais em metros, com
 * origem no primeiro vertice. Para um parque fotovoltaico, que raramente passa
 * do quilometro, o erro dessa aproximacao fica muito abaixo do da propria
 * digitalizacao do contorno.
 */

/** Area do contorno em metros quadrados. Um contorno com menos de 3 pontos da zero. */
export function areaDoContorno(contorno: readonly LatLon[]): number {
  if (contorno.length < 3) return 0

  /*
   * A origem local e o centro, e nao o primeiro vertice.
   *
   * Ancorada num vertice, a area mudava conforme o vertice por onde o contorno
   * comecasse: inverter o sentido dava 22 499,9 em vez de 22 500,1 m2. Com a
   * origem no centro o resultado deixa de depender da ordem, e a aproximacao
   * local fica ainda melhor por nenhum vertice estar a mais de meia envolvente
   * de distancia.
   */
  const origem = centroDoContorno(contorno)
  if (!origem) return 0

  const locais = contorno.map((ponto) => deslocamentoLocal(origem, ponto))

  let dobro = 0
  for (let i = 0; i < locais.length; i++) {
    const a = locais[i]
    const b = locais[(i + 1) % locais.length]
    if (!a || !b) continue
    dobro += a.x * b.y - b.x * a.y
  }

  // O sinal diz o sentido em que o contorno foi desenhado, que aqui nao importa.
  return Math.abs(dobro) / 2
}

/** Perimetro do contorno fechado, em metros. */
export function perimetroDoContorno(contorno: readonly LatLon[]): number {
  if (contorno.length < 2) return 0

  let total = 0
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]
    const b = contorno[(i + 1) % contorno.length]
    if (!a || !b) continue
    const { x, y } = deslocamentoLocal(a, b)
    total += Math.hypot(x, y)
  }
  return total
}

/** Centro da envolvente do contorno, para levar a vista ate la. */
export function centroDoContorno(contorno: readonly LatLon[]): LatLon | null {
  const primeiro = contorno[0]
  if (!primeiro) return null

  let latMin = primeiro.lat
  let latMax = primeiro.lat
  let lonMin = primeiro.lon
  let lonMax = primeiro.lon

  for (const ponto of contorno) {
    latMin = Math.min(latMin, ponto.lat)
    latMax = Math.max(latMax, ponto.lat)
    lonMin = Math.min(lonMin, ponto.lon)
    lonMax = Math.max(lonMax, ponto.lon)
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 }
}

/** Centro da envolvente de varias areas de uma vez. */
export function centroDasAreas(areas: readonly Area[]): LatLon | null {
  const todos = areas.flatMap((area) => area.contorno)
  return centroDoContorno(todos)
}

/**
 * Area formatada como se fala dela em obra: hectares acima de um, metros
 * quadrados abaixo disso.
 */
export function formatarArea(metrosQuadrados: number): string {
  if (!Number.isFinite(metrosQuadrados)) return '--'
  if (metrosQuadrados >= 10000) return `${(metrosQuadrados / 10000).toFixed(2)} ha`
  return `${Math.round(metrosQuadrados)} m2`
}

/**
 * Contorno com o primeiro ponto repetido no fim.
 *
 * Guardamos os contornos sem o fecho, que e a forma util para contar area e
 * vertices. O GeoJSON exige o anel fechado: sem o ponto repetido o poligono nao
 * desenha, e sem aviso nenhum.
 */
export function contornoFechado(contorno: readonly LatLon[]): LatLon[] {
  const primeiro = contorno[0]
  if (!primeiro || contorno.length < 3) return []
  return [...contorno, primeiro]
}
