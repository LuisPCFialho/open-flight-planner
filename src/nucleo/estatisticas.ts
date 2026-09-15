import type { Rota, Waypoint } from './tipos.ts'
import { distancia, distancia3D } from './geodesia.ts'
import { velocidadeDe } from './operacoes-rota.ts'

/**
 * Aceleracao assumida nas paragens, em m/s2.
 *
 * Calibrada contra a rota de Sever do Vouga no Pilot 2: 89 waypoints, 8385,2 m,
 * 10 m/s, todos em "a aeronave para", que o simulador estima em 23 m 27 s. So o
 * percurso daria 838 s, portanto os restantes 569 s sao o custo de travar e
 * voltar a acelerar em cada ponto, cerca de 6,4 s. Com este valor a estimativa
 * fica a menos de 2% do que o simulador mostra.
 */
export const ACELERACAO_PREDEFINIDA = 1.5

export type Estatisticas = {
  /** Metros, projectado no plano horizontal. */
  distanciaHorizontal: number
  /** Metros, contando a subida e descida entre waypoints. */
  distancia3D: number
  /** Segundos. */
  duracao: number
  numeroWaypoints: number
  numeroFotos: number
}

/** Segundos que uma accao acrescenta ao tempo de voo. */
function duracaoDaAccao(waypoint: Waypoint): number {
  let segundos = 0
  for (const accao of waypoint.acoes) {
    if (accao.tipo === 'pairar') segundos += accao.segundos
  }
  return segundos
}

function contarFotos(waypoint: Waypoint): number {
  return waypoint.acoes.filter((a) => a.tipo === 'tirarFoto').length
}

export function calcularEstatisticas(
  rota: Rota,
  aceleracao: number = ACELERACAO_PREDEFINIDA,
): Estatisticas {
  const waypoints = rota.waypoints
  let horizontal = 0
  let obliqua = 0
  let duracao = 0
  let fotos = 0

  for (const [i, waypoint] of waypoints.entries()) {
    fotos += contarFotos(waypoint)
    duracao += duracaoDaAccao(waypoint)

    // Travar e voltar a acelerar custa v/a segundos face a passar sem parar.
    if (waypoint.tipoCurva === 'pararNoPonto' && aceleracao > 0) {
      duracao += velocidadeDe(rota, waypoint) / aceleracao
    }

    if (i === 0) continue
    const anterior = waypoints[i - 1]
    if (!anterior) continue

    horizontal += distancia(anterior, waypoint)
    const troco = distancia3D(anterior, anterior.altura, waypoint, waypoint.altura)
    obliqua += troco
    duracao += troco / velocidadeDe(rota, waypoint)
  }

  return {
    distanciaHorizontal: horizontal,
    distancia3D: obliqua,
    duracao,
    numeroWaypoints: waypoints.length,
    numeroFotos: fotos,
  }
}

/** Formata segundos como o Pilot 2 os mostra: `23 m 27 s`. */
export function formatarDuracao(segundos: number): string {
  const total = Math.round(segundos)
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  if (minutos === 0) return `${resto} s`
  return `${minutos} m ${resto} s`
}

/** Formata metros com uma casa decimal, como na barra do Pilot 2. */
export function formatarDistancia(metros: number): string {
  return `${metros.toFixed(1)} m`
}
