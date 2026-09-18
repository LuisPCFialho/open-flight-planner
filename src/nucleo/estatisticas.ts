import type { LatLon, Rota, Waypoint } from './tipos.ts'
import { distancia, distancia3D, rumo } from './geodesia.ts'
import { velocidadeDe } from './operacoes-rota.ts'
import { temVento, velocidadeMaximaNoSolo } from './vento.ts'

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

/**
 * Velocidade no solo que um troco realmente faz.
 *
 * Sem vento, ou com folga no ar, e a que se pediu - que e o caso normal e o que
 * uma missao de waypoints faz. Quando nao ha folga, cai para o que a aeronave
 * consegue manter, e `null` quando ela nem o rumo consegue segurar.
 *
 * `maximoNoAr` e a velocidade maxima em missao do aparelho, usada aqui como
 * tecto da velocidade **no ar**. E um tecto conservador: o aparelho e capaz de
 * mais no ar do que o que aceita como comando de missao. Conservador e o lado
 * certo para errar quando o que esta em causa e se a estimativa se cumpre.
 */
function velocidadeEfectiva(
  pedida: number,
  rumoDoTroco: number,
  rota: Rota,
  maximoNoAr: number | undefined,
): number | null {
  if (!temVento(rota.vento) || maximoNoAr === undefined) return pedida
  const limite = velocidadeMaximaNoSolo(rumoDoTroco, rota.vento, maximoNoAr)
  if (limite === null) return null
  return Math.min(pedida, limite)
}

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
  /**
   * Velocidade maxima em missao do aparelho, em m/s.
   *
   * Sem ela o vento da rota nao entra na conta. E de proposito que e opcional: a
   * exportacao para Pilot 2 escreve esta duracao dentro do ficheiro, e o que la
   * vai tem de ser reproduzivel a partir do ficheiro - nao de um vento que
   * alguem escreveu a mao naquela tarde.
   */
  maximoNoAr?: number,
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
    const velocidade = velocidadeEfectiva(
      velocidadeDe(rota, waypoint),
      rumo(anterior, waypoint),
      rota,
      maximoNoAr,
    )
    /*
      * `null` e o troco que a aeronave nao segue - o vento de traves passa o que
      * ela faz no ar. Nao ha duracao que se estime para isso, e o troco nao
      * conta: o que sai e uma estimativa curta de mais para uma rota que nao se
      * voa. Quem o diz pelo nome e `validarVento`, com um erro que bloqueia a
      * exportacao, e por isso ninguem chega a agir sobre este numero.
      */
    if (velocidade !== null && velocidade > 0) duracao += troco / velocidade
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
 * sem contar a subida - porque so serve para decidir se ha folga de bateria.
 */
export function duracaoDoVooCompleto(rota: Rota, maximoNoAr?: number): number {
  const base = calcularEstatisticas(rota, ACELERACAO_PREDEFINIDA, maximoNoAr).duracao
  const primeiro = rota.waypoints[0]
  const ultimo = rota.waypoints.at(-1)
  if (!primeiro || !ultimo || !(rota.velocidadeGlobal > 0)) return base

  /*
   * A ida e o regresso tambem apanham o vento, e sao eles que decidem a bateria
   * numa rota que se afaste. Contam-se separados porque vao em rumos diferentes:
   * quem sai contra o vento volta com ele, e a media dos dois nao serve.
   */
  const tempoDe = (de: LatLon, para: LatLon): number => {
    const metros = distancia(de, para)
    if (metros === 0) return 0
    const v = velocidadeEfectiva(rota.velocidadeGlobal, rumo(de, para), rota, maximoNoAr)
    return v !== null && v > 0 ? metros / v : 0
  }

  let tempo = tempoDe(rota.pontoDescolagem, primeiro)
  if (rota.acaoFinal === 'goHome') tempo += tempoDe(ultimo, rota.pontoDescolagem)
  else if (rota.acaoFinal === 'gotoFirstWaypoint') tempo += tempoDe(ultimo, primeiro)

  return base + tempo
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
