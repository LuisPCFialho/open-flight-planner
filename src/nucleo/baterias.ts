import type { Drone, Rota } from './tipos.ts'
import { duracaoDoVooCompleto } from './estatisticas.ts'
import { renumerar } from './operacoes-rota.ts'
import { MARGEM_AUTONOMIA } from './validacoes.ts'

/**
 * Partir uma rota longa nos voos que ela realmente e.
 *
 * Uma cobertura de parcela grande nao cabe numa bateria, e a validacao que ja
 * havia dizia-o - "a rota nao cabe na autonomia" - e ficava por ali. O que falta
 * a seguir e sempre o mesmo trabalho: descobrir onde cortar, e cortar.
 *
 * Nao e o percurso a dividir pela autonomia. Cada troco e um voo por si: sobe,
 * vai ate ao primeiro ponto do troco, percorre-o, e volta a casa. Quanto mais
 * longe o troco fica do ponto de descolagem, menos tempo lhe sobra para
 * trabalhar - e por isso os ultimos trocos sao mais curtos do que os primeiros.
 */

export type Divisao = {
  /** Uma rota por voo, ja renumeradas e com o nome a dizer qual e. */
  trocos: Rota[]
  /** Segundos de voo de cada troco, com a ida e o regresso. */
  duracoes: number[]
  /** O limite que se usou, em segundos. */
  limite: number
  /**
   * Waypoints que nao couberam em voo nenhum.
   *
   * Um unico ponto longe de mais do sitio de descolagem nao cabe em bateria
   * nenhuma, e nesse caso nao ha corte que resolva: o que ha a fazer e mudar o
   * ponto de descolagem, e vale mais dize-lo do que devolver trocos impossiveis.
   */
  inalcancaveis: number[]
}

/** Segundos uteis de uma bateria, ja com a margem prudente. */
export function limiteDeVoo(drone: Drone, margem: number = MARGEM_AUTONOMIA): number | null {
  if (drone.autonomiaMinutos === undefined) return null
  return drone.autonomiaMinutos * 60 * margem
}

/**
 * Divide a rota em voos que cabem na autonomia.
 *
 * O criterio e ganancioso e de propósito: acrescenta-se waypoints ao troco
 * enquanto o voo completo couber, e corta-se no ultimo que coube. Um criterio
 * optimo daria trocos mais equilibrados e cortes em sitios que ninguem
 * reconhece; assim, o primeiro voo leva o maximo que pode, que e o que quem esta
 * no campo espera de uma bateria cheia.
 */
export function dividirPorAutonomia(
  rota: Rota,
  drone: Drone,
  margem: number = MARGEM_AUTONOMIA,
): Divisao {
  const limite = limiteDeVoo(drone, margem)
  if (limite === null || rota.waypoints.length === 0) {
    return { trocos: [], duracoes: [], limite: limite ?? 0, inalcancaveis: [] }
  }

  const trocos: Rota[] = []
  const duracoes: number[] = []
  const inalcancaveis: number[] = []

  let porColocar = [...rota.waypoints]

  while (porColocar.length > 0) {
    let quantos = 0
    let duracao = 0

    for (let i = 1; i <= porColocar.length; i++) {
      const tentativa = duracaoDoVooCompleto(
        { ...rota, waypoints: renumerar(porColocar.slice(0, i)) },
        drone.velocidadeMaxWaypoint,
      )
      if (tentativa > limite) break
      quantos = i
      duracao = tentativa
    }

    if (quantos === 0) {
      /*
       * Nem o primeiro waypoint cabe: esta longe de mais do ponto de
       * descolagem. Nao ha corte que resolva - regista-se e segue-se, para os
       * outros nao ficarem reféns dele.
       */
      const perdido = porColocar[0]
      if (perdido) inalcancaveis.push(perdido.index)
      porColocar = porColocar.slice(1)
      continue
    }

    trocos.push({
      ...rota,
      id: `${rota.id}-voo-${trocos.length + 1}`,
      nome: `${rota.nome} - voo ${trocos.length + 1}`,
      waypoints: renumerar(porColocar.slice(0, quantos)),
    })
    duracoes.push(duracao)
    porColocar = porColocar.slice(quantos)
  }

  return { trocos, duracoes, limite, inalcancaveis }
}

/** Quantas baterias a rota precisa. Zero quando nao ha nada a voar. */
export function bateriasNecessarias(
  rota: Rota,
  drone: Drone,
  margem: number = MARGEM_AUTONOMIA,
): number {
  return dividirPorAutonomia(rota, drone, margem).trocos.length
}
