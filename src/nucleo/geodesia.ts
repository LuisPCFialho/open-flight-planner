/**
 * Geodesia e conversoes de altura.
 *
 * As distancias usam a aproximacao local do elipsoide WGS84, com os raios de
 * curvatura calculados na latitude media do par. Para os troços de dezenas a
 * centenas de metros de uma rota de drone o erro fica na ordem do milimetro,
 * contra cerca de 0,3% do haversine esferico, que numa rota de 8 km daria 25 m
 * a mais na distancia total e, por arrasto, na estimativa de autonomia.
 */

import type { LatLon, ModoAltitude } from './tipos.ts'

const A_WGS84 = 6378137.0
const F_WGS84 = 1 / 298.257223563
const E2_WGS84 = F_WGS84 * (2 - F_WGS84)

const GRAUS = Math.PI / 180

/** Raio de curvatura meridional, em metros, na latitude dada em graus. */
function raioMeridional(latGraus: number): number {
  const s = Math.sin(latGraus * GRAUS)
  return (A_WGS84 * (1 - E2_WGS84)) / Math.pow(1 - E2_WGS84 * s * s, 1.5)
}

/** Raio de curvatura na primeira vertical, em metros, na latitude dada em graus. */
function raioNormal(latGraus: number): number {
  const s = Math.sin(latGraus * GRAUS)
  return A_WGS84 / Math.sqrt(1 - E2_WGS84 * s * s)
}

/** Deslocamento local em metros, eixo x para leste e eixo y para norte. */
export function deslocamentoLocal(de: LatLon, para: LatLon): { x: number; y: number } {
  const latMedia = (de.lat + para.lat) / 2
  const x = (para.lon - de.lon) * GRAUS * raioNormal(latMedia) * Math.cos(latMedia * GRAUS)
  const y = (para.lat - de.lat) * GRAUS * raioMeridional(latMedia)
  return { x, y }
}

/** Distancia horizontal em metros entre dois pontos. */
export function distancia(de: LatLon, para: LatLon): number {
  const { x, y } = deslocamentoLocal(de, para)
  return Math.hypot(x, y)
}

/** Distancia 3D em metros, com as duas alturas no mesmo sistema de referencia. */
export function distancia3D(de: LatLon, alturaDe: number, para: LatLon, alturaPara: number): number {
  return Math.hypot(distancia(de, para), alturaPara - alturaDe)
}

/** Rumo inicial em graus, 0 a norte e a crescer para leste, no intervalo [0, 360). */
export function rumo(de: LatLon, para: LatLon): number {
  const { x, y } = deslocamentoLocal(de, para)
  const graus = Math.atan2(x, y) / GRAUS
  return (graus + 360) % 360
}

/**
 * Ponto a `metros` de distancia de `origem`, no rumo dado em graus.
 *
 * Os raios de curvatura sao avaliados na latitude media do par, tal como em
 * `deslocamentoLocal`, o que torna esta funcao a inversa exata de `rumo` e
 * `distancia`. A latitude media depende do resultado, por isso itera duas vezes,
 * o que basta para convergir abaixo do micrometro.
 */
export function deslocar(origem: LatLon, rumoGraus: number, metros: number): LatLon {
  const x = Math.sin(rumoGraus * GRAUS) * metros
  const y = Math.cos(rumoGraus * GRAUS) * metros

  let lat = origem.lat + y / raioMeridional(origem.lat) / GRAUS
  for (let i = 0; i < 2; i++) {
    lat = origem.lat + y / raioMeridional((origem.lat + lat) / 2) / GRAUS
  }

  const latMedia = (origem.lat + lat) / 2
  const lon = origem.lon + x / (raioNormal(latMedia) * Math.cos(latMedia * GRAUS)) / GRAUS
  return { lat, lon }
}

/** Interpolacao linear entre dois pontos, com `t` de 0 a 1. */
export function interpolar(de: LatLon, para: LatLon, t: number): LatLon {
  return {
    lat: de.lat + (para.lat - de.lat) * t,
    lon: de.lon + (para.lon - de.lon) * t,
  }
}

/**
 * Amostra um segmento de `passo` em `passo` metros, incluindo sempre as duas
 * extremidades. Serve a deteccao de colisao com o terreno entre waypoints.
 */
export function amostrarSegmento(de: LatLon, para: LatLon, passo: number): LatLon[] {
  if (passo <= 0) throw new Error('o passo de amostragem tem de ser positivo')
  const total = distancia(de, para)
  const divisoes = Math.max(1, Math.ceil(total / passo))
  const pontos: LatLon[] = []
  for (let i = 0; i <= divisoes; i++) pontos.push(interpolar(de, para, i / divisoes))
  return pontos
}

/**
 * Amostra um percurso completo de `passo` em `passo` metros, sem repetir os
 * vertices intermedios.
 *
 * O motor de terreno e o grafico de perfil tem de assentar exactamente nos
 * mesmos pontos, por isso ambos passam por aqui em vez de cada um gerar os seus.
 */
export function amostrarPercurso(pontos: readonly LatLon[], passo: number): LatLon[] {
  if (pontos.length === 0) return []
  const primeiro = pontos[0]
  if (!primeiro) return []
  if (pontos.length === 1) return [primeiro]

  const amostras: LatLon[] = [primeiro]
  for (let i = 1; i < pontos.length; i++) {
    const de = pontos[i - 1]
    const para = pontos[i]
    if (!de || !para) continue
    amostras.push(...amostrarSegmento(de, para, passo).slice(1))
  }
  return amostras
}

/** Comprimento horizontal acumulado de uma sequencia de pontos, em metros. */
export function comprimento(pontos: readonly LatLon[]): number {
  let total = 0
  for (let i = 1; i < pontos.length; i++) {
    const anterior = pontos[i - 1]
    const atual = pontos[i]
    if (anterior && atual) total += distancia(anterior, atual)
  }
  return total
}

// --- Alturas -----------------------------------------------------------------

/**
 * Contexto necessario para converter entre os tres modos de altitude.
 * Ambas as cotas sao ortometricas (ASL).
 */
export type ContextoAltura = {
  /** Cota do terreno no ponto de descolagem. */
  cotaDescolagem: number
  /** Cota do terreno na vertical do ponto em causa. */
  cotaTerreno: number
}

/** Converte uma altura declarada no modo dado para altura ortometrica (ASL). */
export function paraASL(altura: number, modo: ModoAltitude, ctx: ContextoAltura): number {
  switch (modo) {
    case 'ASL':
      return altura
    case 'ALT':
      return altura + ctx.cotaDescolagem
    case 'AGL':
      return altura + ctx.cotaTerreno
  }
}

/** Converte uma altura ortometrica (ASL) para o modo dado. */
export function deASL(asl: number, modo: ModoAltitude, ctx: ContextoAltura): number {
  switch (modo) {
    case 'ASL':
      return asl
    case 'ALT':
      return asl - ctx.cotaDescolagem
    case 'AGL':
      return asl - ctx.cotaTerreno
  }
}

/**
 * Altura elipsoidal (HAE, WGS84) a partir da ortometrica (ASL, EGM96).
 * `ondulacao` e o N do geoide, cerca de 55,6 m em Portugal continental.
 */
export function aslParaHae(asl: number, ondulacao: number): number {
  return asl + ondulacao
}

/** Altura ortometrica (ASL, EGM96) a partir da elipsoidal (HAE, WGS84). */
export function haeParaAsl(hae: number, ondulacao: number): number {
  return hae - ondulacao
}
