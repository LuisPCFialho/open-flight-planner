import type { LatLon, Rota } from './tipos.ts'
import { distancia3D } from './geodesia.ts'
import { velocidadeDe } from './operacoes-rota.ts'
import { ACELERACAO_PREDEFINIDA } from './estatisticas.ts'
import {
  atitudeNoTroco,
  atitudeNoWaypoint,
  posicaoNoTroco,
  type Atitude,
  type ModoCamaraTrajecto,
} from './camara-trajecto.ts'

/**
 * A rota percorrida no tempo, para se ver o voo antes de o fazer.
 *
 * O relogio e o mesmo da barra de estatisticas, e nao apenas o percurso a
 * dividir pela velocidade: conta as paragens em cada waypoint - o tempo a
 * pairar e o custo de travar e voltar a acelerar - porque e onde o aparelho
 * para que as fotos sao tiradas, e ver a aeronave deter-se ali e metade do que
 * se quer verificar. Se os dois relogios discordassem, um deles estaria a
 * mentir.
 */

export type TrechoReplay = {
  /** Waypoint onde o trecho comeca. */
  indice: number
  /** Uma paragem no waypoint, ou o percurso ate ao seguinte. */
  tipo: 'paragem' | 'percurso'
  /** Segundos desde o inicio ate ao principio deste trecho. */
  inicio: number
  /** Segundos que o trecho dura. */
  duracao: number
}

export type EstadoReplay = {
  /** Waypoint de onde se vem. */
  indice: number
  /** Posicao dentro do trecho, de 0 a 1. */
  fraccao: number
  /** Verdadeiro quando a aeronave esta parada num waypoint. */
  parada: boolean
  posicao: LatLon
  /** Altura no modo de altitude da rota. */
  altura: number
  atitude: Atitude
}

/**
 * Multiplicadores de velocidade do leitor.
 *
 * A escolha faz-se por indice nesta lista, e nao por um numero continuo: assim
 * os valores sao sempre legiveis - 8x, e nao 7,6x - e o 1x apanha-se ao certo,
 * que e para onde se volta a seguir a cada verificacao.
 *
 * Os degraus apertam em baixo e alargam em cima porque e assim que a velocidade
 * se le: a diferenca entre 0,5x e 1x nota-se, a diferenca entre 40x e 41x nao.
 * Uma cobertura de meia hora percorre-se em trinta e seis segundos a 50x.
 */
export const VELOCIDADES_REPLAY = [
  0.25, 0.5, 1, 2, 4, 8, 12, 16, 20, 25, 30, 40, 50,
] as const

/** Onde o 1x esta na lista. E a velocidade com que o leitor abre. */
export const VELOCIDADE_REAL = VELOCIDADES_REPLAY.indexOf(1)

/** A velocidade do degrau `indice`, com os extremos presos aos limites. */
export function velocidadeNoDegrau(indice: number): number {
  const preso = Math.min(VELOCIDADES_REPLAY.length - 1, Math.max(0, Math.round(indice)))
  return VELOCIDADES_REPLAY[preso] ?? 1
}

/**
 * O degrau de uma velocidade, ou o mais proximo se ela nao estiver na lista.
 *
 * A meio caminho entre dois fica-se pelo mais lento, que e a escolha prudente.
 */
export function degrauDaVelocidade(velocidade: number): number {
  let melhor = 0
  for (const [i, v] of VELOCIDADES_REPLAY.entries()) {
    const actual = VELOCIDADES_REPLAY[melhor] ?? 1
    if (Math.abs(v - velocidade) < Math.abs(actual - velocidade)) melhor = i
  }
  return melhor
}

/** Como se escreve um multiplicador: `0,25x`, `1x`, `50x`. */
export function formatarVelocidade(velocidade: number): string {
  return `${velocidade.toString().replace('.', ',')}×`
}

/** Segundos que a aeronave passa parada num waypoint. */
export function paragemNoWaypoint(
  rota: Rota,
  indice: number,
  aceleracao: number = ACELERACAO_PREDEFINIDA,
): number {
  const waypoint = rota.waypoints[indice]
  if (!waypoint) return 0

  let segundos = 0
  for (const accao of waypoint.acoes) {
    if (accao.tipo === 'pairar') segundos += accao.segundos
  }
  // Travar e voltar a acelerar custa v/a segundos face a passar sem parar.
  if (waypoint.tipoCurva === 'pararNoPonto' && aceleracao > 0) {
    segundos += velocidadeDe(rota, waypoint) / aceleracao
  }
  return segundos
}

/**
 * Parte a rota na sucessao de paragens e percursos que o relogio vai correr.
 *
 * Um troco a velocidade nula nao entra: nao tem duracao que se defina, e a
 * divisao punha um infinito a alastrar pelo relogio todo. E o mesmo cuidado que
 * `calcularEstatisticas` ja tem, e quem reporta o problema e `validarVelocidades`.
 */
export function trechosDoReplay(rota: Rota): TrechoReplay[] {
  const trechos: TrechoReplay[] = []
  let relogio = 0

  for (const [i, waypoint] of rota.waypoints.entries()) {
    const paragem = paragemNoWaypoint(rota, i)
    if (paragem > 0) {
      trechos.push({ indice: i, tipo: 'paragem', inicio: relogio, duracao: paragem })
      relogio += paragem
    }

    const seguinte = rota.waypoints[i + 1]
    if (!seguinte) continue

    const velocidade = velocidadeDe(rota, seguinte)
    if (!(velocidade > 0)) continue

    const percurso = distancia3D(waypoint, waypoint.altura, seguinte, seguinte.altura)
    const duracao = percurso / velocidade
    if (!Number.isFinite(duracao) || duracao <= 0) continue

    trechos.push({ indice: i, tipo: 'percurso', inicio: relogio, duracao })
    relogio += duracao
  }

  return trechos
}

/** Segundos que o replay inteiro demora. */
export function duracaoDoReplay(rota: Rota): number {
  const ultimo = trechosDoReplay(rota).at(-1)
  return ultimo ? ultimo.inicio + ultimo.duracao : 0
}

/**
 * Onde esta a aeronave, e para onde olha, ao segundo `instante`.
 *
 * Fora dos limites devolve o principio ou o fim, e nao nada: e o que faz a
 * barra de progresso poder ser arrastada ate as pontas sem a aeronave
 * desaparecer.
 */
export function estadoNoInstante(
  rota: Rota,
  instante: number,
  modo: ModoCamaraTrajecto = rota.modoCamaraTrajecto,
): EstadoReplay | null {
  const primeiro = rota.waypoints[0]
  if (!primeiro) return null

  const trechos = trechosDoReplay(rota)
  const ultimoIndice = rota.waypoints.length - 1

  if (trechos.length === 0) {
    // Um unico waypoint, ou uma rota que nao anda: fica-se onde se esta.
    return {
      indice: 0,
      fraccao: 0,
      parada: true,
      posicao: { lat: primeiro.lat, lon: primeiro.lon },
      altura: primeiro.altura,
      atitude: atitudeNoWaypoint(rota, 0, modo),
    }
  }

  const fim = trechos[trechos.length - 1]
  if (!fim) return null

  if (instante <= 0) return noWaypoint(rota, 0, modo)
  if (instante >= fim.inicio + fim.duracao) return noWaypoint(rota, ultimoIndice, modo)

  const trecho = trechos.find((t) => instante < t.inicio + t.duracao) ?? fim
  const fraccao = trecho.duracao > 0 ? (instante - trecho.inicio) / trecho.duracao : 0

  if (trecho.tipo === 'paragem') {
    return { ...noWaypoint(rota, trecho.indice, modo), fraccao }
  }

  const ponto = posicaoNoTroco(rota, trecho.indice, fraccao)
  if (!ponto) return noWaypoint(rota, trecho.indice, modo)

  return {
    indice: trecho.indice,
    fraccao,
    parada: false,
    posicao: ponto.posicao,
    altura: ponto.altura,
    atitude: atitudeNoTroco(rota, trecho.indice, fraccao, modo),
  }
}

function noWaypoint(rota: Rota, indice: number, modo: ModoCamaraTrajecto): EstadoReplay {
  const waypoint = rota.waypoints[indice]
  if (!waypoint) throw new Error(`waypoint ${indice} não existe`)

  return {
    indice,
    fraccao: 0,
    parada: true,
    posicao: { lat: waypoint.lat, lon: waypoint.lon },
    altura: waypoint.altura,
    atitude: atitudeNoWaypoint(rota, indice, modo),
  }
}

/** Formata o relogio do leitor como `3:07`, que e como se le um tempo corrido. */
export function formatarRelogio(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  const minutos = Math.floor(total / 60)
  return `${minutos}:${String(total % 60).padStart(2, '0')}`
}
