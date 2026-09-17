import type { LatLon, Rota, Waypoint } from './tipos.ts'
import { distancia, rumo } from './geodesia.ts'
import { interpolar } from './geodesia.ts'

/**
 * Para onde a camara olha ao longo do trajecto, e nao apenas em cada waypoint.
 *
 * Um waypoint guarda a atitude que tem. O que faltava era dizer o que a camara
 * faz no caminho entre dois: ficar como estava, seguir o ponto seguinte, ou
 * olhar a prumo para o solo. E, seja qual for a escolha, passar de uma atitude
 * para a outra de forma continua, sem o salto seco que se ve quando cada
 * waypoint impoe a sua e a aeronave corrige tudo de uma vez ao chegar.
 */

export type ModoCamaraTrajecto =
  /** Cada waypoint mantem a atitude gravada. E o comportamento de sempre. */
  | 'manter'
  /** A camara segue o waypoint seguinte, como quem vai a ver o caminho. */
  | 'proximoWaypoint'
  /** A camara aponta a prumo ao solo, para levantamento. */
  | 'terreno'

export type Atitude = {
  /** Rumo da aeronave em graus. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
  /** Rotacao do gimbal em relacao ao nariz, em graus. */
  gimbalYaw: number
}

/**
 * Interpola dois angulos pelo lado curto do circulo.
 *
 * Interpolar 350 e 10 pela diferenca directa passaria por 180, dando meia volta
 * onde a aeronave faz vinte graus. E o erro classico, e numa transicao de camara
 * da-se por ele de imediato.
 */
export function interpolarAngulo(de: number, para: number, t: number): number {
  const diferenca = (((para - de) % 360) + 540) % 360 - 180
  return (((de + diferenca * t) % 360) + 360) % 360
}

/** Interpolacao simples, para angulos que nao dao a volta, como a inclinacao. */
export function interpolarLinear(de: number, para: number, t: number): number {
  return de + (para - de) * t
}

/**
 * Atitude com que a camara chega a um waypoint, no modo dado.
 *
 * No modo `proximoWaypoint` a inclinacao sai da geometria: quanto mais alto se
 * esta em relacao ao ponto seguinte, mais para baixo se olha. No ultimo waypoint
 * nao ha seguinte, e herda-se o rumo do troco anterior para a camara nao dar um
 * salto no fim.
 */
export function atitudeNoWaypoint(
  rota: Rota,
  indice: number,
  modo: ModoCamaraTrajecto = rota.modoCamaraTrajecto,
): Atitude {
  const waypoint = rota.waypoints[indice]
  if (!waypoint) return { guinada: 0, gimbalPitch: -30, gimbalYaw: 0 }

  const gravada: Atitude = {
    guinada: guinadaEfectiva(rota, indice),
    gimbalPitch: waypoint.gimbalPitch,
    gimbalYaw: waypoint.gimbalYaw,
  }

  if (modo === 'manter') return gravada

  if (modo === 'terreno') {
    // A prumo para o solo, com o gimbal alinhado com o nariz.
    return { guinada: gravada.guinada, gimbalPitch: -90, gimbalYaw: 0 }
  }

  const seguinte = rota.waypoints[indice + 1] ?? null
  const anterior = rota.waypoints[indice - 1] ?? null

  if (seguinte) return { ...atitudeParaOAlvo(waypoint, seguinte), gimbalYaw: 0 }
  // Ultimo ponto: mantem-se a olhar como vinha, em vez de saltar.
  if (anterior) return { ...atitudeParaOAlvo(anterior, waypoint), gimbalYaw: 0 }
  return gravada
}

/** Rumo e inclinacao de quem esta em `de` a olhar para `para`. */
export function atitudeParaOAlvo(
  de: Pick<Waypoint, 'lat' | 'lon' | 'altura'>,
  para: Pick<Waypoint, 'lat' | 'lon' | 'altura'>,
): { guinada: number; gimbalPitch: number } {
  const horizontal = distancia(de, para)
  const subida = para.altura - de.altura

  // Dois pontos na mesma vertical: nao ha rumo que se defina, olha-se a prumo.
  if (horizontal < 0.001) {
    return { guinada: 0, gimbalPitch: subida >= 0 ? 90 : -90 }
  }

  return {
    guinada: rumo(de, para),
    gimbalPitch: (Math.atan2(subida, horizontal) * 180) / Math.PI,
  }
}

/**
 * Atitude a meio do troco que vai do waypoint `indice` para o seguinte, com `t`
 * de 0 a 1.
 *
 * E isto que da a transicao suave: em vez de a camara ficar parada e corrigir
 * tudo de uma vez ao chegar, vai passando de uma atitude para a outra ao longo
 * do caminho.
 */
export function atitudeNoTroco(
  rota: Rota,
  indice: number,
  t: number,
  modo: ModoCamaraTrajecto = rota.modoCamaraTrajecto,
): Atitude {
  const daqui = atitudeNoWaypoint(rota, indice, modo)
  const seguinte = rota.waypoints[indice + 1]
  if (!seguinte) return daqui

  const ali = atitudeNoWaypoint(rota, indice + 1, modo)
  const fraccao = Math.max(0, Math.min(1, t))

  return {
    guinada: interpolarAngulo(daqui.guinada, ali.guinada, fraccao),
    gimbalPitch: interpolarLinear(daqui.gimbalPitch, ali.gimbalPitch, fraccao),
    gimbalYaw: interpolarAngulo(daqui.gimbalYaw, ali.gimbalYaw, fraccao),
  }
}

/** Posicao e altura a meio do troco, no mesmo sistema de altura da rota. */
export function posicaoNoTroco(
  rota: Rota,
  indice: number,
  t: number,
): { posicao: LatLon; altura: number } | null {
  const daqui = rota.waypoints[indice]
  if (!daqui) return null

  const seguinte = rota.waypoints[indice + 1]
  if (!seguinte) return { posicao: { lat: daqui.lat, lon: daqui.lon }, altura: daqui.altura }

  const fraccao = Math.max(0, Math.min(1, t))
  return {
    posicao: interpolar(daqui, seguinte, fraccao),
    altura: interpolarLinear(daqui.altura, seguinte.altura, fraccao),
  }
}

/**
 * Aplica o modo a todos os waypoints, escrevendo a atitude calculada.
 *
 * Serve o botao que fixa o comportamento na rota: o que vai para o ficheiro sao
 * os angulos de cada waypoint, portanto em algum momento tem de se decidir quais
 * sao. Depois disto a rota volta ao modo `manter`, porque os angulos passaram a
 * estar la gravados e mexer num a mao nao deve ser desfeito pelo modo.
 */
export function aplicarModoAosWaypoints(rota: Rota, modo: ModoCamaraTrajecto): Rota {
  if (modo === 'manter') return rota

  return {
    ...rota,
    modoCamaraTrajecto: 'manter',
    waypoints: rota.waypoints.map((waypoint, i) => {
      const atitude = atitudeNoWaypoint(rota, i, modo)
      return {
        ...waypoint,
        guinada: atitude.guinada,
        modoGuinada: 'fixed' as const,
        gimbalPitch: atitude.gimbalPitch,
        gimbalYaw: atitude.gimbalYaw,
      }
    }),
  }
}

/**
 * Para onde o nariz da aeronave aponta neste waypoint.
 *
 * O campo `guinada` so vale quando o modo e `fixed` ou `manual`. Nos outros dois
 * o rumo nao esta guardado em lado nenhum: sai da geometria da rota, e e o
 * proprio aparelho que o calcula em voo. Ler `guinada` em bruto - que e o que se
 * fazia - devolvia zero em todos os waypoints de uma rota acabada de marcar,
 * porque o modo de origem e `followWayline` e nesse modo o campo fica por
 * preencher. O efeito era todos os aparelhos desenhados a apontar a norte e a
 * previsao do enquadramento a mostrar o que estava a norte, e nao o que a foto
 * ia apanhar.
 */
export function guinadaEfectiva(rota: Rota, indice: number): number {
  const waypoint = rota.waypoints[indice]
  if (!waypoint) return 0

  if (waypoint.modoGuinada === 'towardPOI') {
    const poi = rota.pois.find((p) => p.id === waypoint.poiId)
    // Um POI que ja nao existe deixa o rumo por definir; ha uma validacao a
    // dizer isso pelo nome, e aqui nao se inventa um rumo qualquer.
    if (poi) return rumo(waypoint, poi)
    return waypoint.guinada ?? 0
  }

  if (waypoint.modoGuinada === 'followWayline') {
    const seguinte = rota.waypoints[indice + 1]
    if (seguinte && distancia(waypoint, seguinte) > 0.001) return rumo(waypoint, seguinte)

    // No ultimo ponto nao ha para onde seguir: mantem-se o rumo com que se chega.
    const anterior = rota.waypoints[indice - 1]
    if (anterior && distancia(anterior, waypoint) > 0.001) return rumo(anterior, waypoint)
    return waypoint.guinada ?? 0
  }

  return waypoint.guinada ?? 0
}
