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

    /*
     * Uma velocidade nula ou negativa nao tem duracao que se estime, e dividir
     * por ela punha um Infinity a alastrar: a barra mostrava "Infinity m NaN s"
     * e a exportacao para Pilot 2, que escreve a duracao no ficheiro, rebentava
     * com "numero invalido para WPML". O troco passa a nao contar para o tempo e
     * quem reporta o problema e `validarVelocidades`, que o diz pelo nome.
     */
    const velocidade = velocidadeDe(rota, waypoint)
    if (velocidade > 0) duracao += troco / velocidade
  }

  return {
    distanciaHorizontal: horizontal,
    distancia3D: obliqua,
    duracao,
    numeroWaypoints: waypoints.length,
    numeroFotos: fotos,
  }
}

/**
 * Duracao do voo inteiro, da descolagem ao pouso, em segundos.
 *
 * `calcularEstatisticas` conta so o que vai de waypoint a waypoint, porque e
 * isso que a barra do Pilot 2 mostra e e contra esse numero que a aceleracao foi
 * calibrada. Para a bateria isso nao chega: falta a ida ate ao primeiro ponto e
 * o regresso a casa no fim, e numa rota que se afaste 4 km sao esses dois trocos
 * que decidem se o aparelho volta.
 *
 * O calculo e grosseiro de proposito - distancia horizontal a velocidade global,
 * sem subida nem vento - porque so serve para decidir se ha folga de bateria.
 */
export function duracaoDoVooCompleto(rota: Rota): number {
  const base = calcularEstatisticas(rota).duracao
  const primeiro = rota.waypoints[0]
  const ultimo = rota.waypoints.at(-1)
  if (!primeiro || !ultimo || !(rota.velocidadeGlobal > 0)) return base

  const ida = distancia(rota.pontoDescolagem, primeiro)

  let volta = 0
  if (rota.acaoFinal === 'goHome') volta = distancia(ultimo, rota.pontoDescolagem)
  else if (rota.acaoFinal === 'gotoFirstWaypoint') volta = distancia(ultimo, primeiro)

  return base + (ida + volta) / rota.velocidadeGlobal
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
