import type { Accao, Drone, Rota, TipoAccao, Waypoint } from './tipos.ts'

/**
 * Accoes de um waypoint: acrescentar, alterar, remover e reordenar.
 *
 * A ordem conta. No dialeto do Pilot 2 o `actionGroupMode` e `sequence`, ou seja
 * as accoes correm pela ordem em que estao escritas, e rodar o gimbal depois de
 * disparar a foto nao e a mesma coisa que rodar antes.
 */

/** Valores de partida de cada tipo de accao. */
export function accaoPredefinida(tipo: TipoAccao, waypoint?: Waypoint): Accao {
  switch (tipo) {
    case 'tirarFoto':
      return { tipo: 'tirarFoto' }
    case 'iniciarGravacao':
      return { tipo: 'iniciarGravacao' }
    case 'pararGravacao':
      return { tipo: 'pararGravacao' }
    case 'rodarGimbal':
      // Arranca no angulo que o waypoint ja tem, para a accao nao dar um salto.
      return { tipo: 'rodarGimbal', pitch: waypoint?.gimbalPitch ?? -30, yaw: waypoint?.gimbalYaw ?? 0 }
    case 'rodarAeronave':
      return { tipo: 'rodarAeronave', heading: waypoint?.guinada ?? 0 }
    case 'pairar':
      return { tipo: 'pairar', segundos: 3 }
    case 'zoom':
      return { tipo: 'zoom', fator: 1 }
  }
}

export function accaoSuportada(drone: Drone, tipo: TipoAccao): boolean {
  return drone.accoesSuportadas.includes(tipo)
}

/** Accoes da rota que o drone escolhido nao sabe executar. */
export function accoesNaoSuportadas(
  rota: Rota,
  drone: Drone,
): { indiceWaypoint: number; tipo: TipoAccao }[] {
  const problemas: { indiceWaypoint: number; tipo: TipoAccao }[] = []
  for (const waypoint of rota.waypoints) {
    for (const accao of waypoint.acoes) {
      if (!accaoSuportada(drone, accao.tipo)) {
        problemas.push({ indiceWaypoint: waypoint.index, tipo: accao.tipo })
      }
    }
  }
  return problemas
}

function comAccoes(rota: Rota, ids: ReadonlySet<string>, transformar: (accoes: readonly Accao[], waypoint: Waypoint) => Accao[]): Rota {
  return {
    ...rota,
    waypoints: rota.waypoints.map((waypoint) =>
      ids.has(waypoint.id) ? { ...waypoint, acoes: transformar(waypoint.acoes, waypoint) } : waypoint,
    ),
  }
}

export function acrescentarAccao(rota: Rota, waypointId: string, accao: Accao): Rota {
  return comAccoes(rota, new Set([waypointId]), (accoes) => [...accoes, accao])
}

/**
 * Acrescenta a mesma accao a varios waypoints. E o que o `Shift+F` faz quando
 * ha mais do que um waypoint seleccionado.
 */
export function acrescentarAccaoEmLote(
  rota: Rota,
  waypointIds: readonly string[],
  tipo: TipoAccao,
): Rota {
  return comAccoes(rota, new Set(waypointIds), (accoes, waypoint) => [
    ...accoes,
    accaoPredefinida(tipo, waypoint),
  ])
}

export function removerAccao(rota: Rota, waypointId: string, indice: number): Rota {
  return comAccoes(rota, new Set([waypointId]), (accoes) => accoes.filter((_, i) => i !== indice))
}

export function alterarAccao(
  rota: Rota,
  waypointId: string,
  indice: number,
  accao: Accao,
): Rota {
  return comAccoes(rota, new Set([waypointId]), (accoes) =>
    accoes.map((anterior, i) => (i === indice ? accao : anterior)),
  )
}

/** Move uma accao dentro do waypoint. Posicoes fora do intervalo nao fazem nada. */
export function moverAccao(rota: Rota, waypointId: string, de: number, para: number): Rota {
  return comAccoes(rota, new Set([waypointId]), (accoes) => {
    if (de === para || de < 0 || de >= accoes.length || para < 0 || para >= accoes.length) {
      return [...accoes]
    }
    const novas = [...accoes]
    const [movida] = novas.splice(de, 1)
    if (movida) novas.splice(para, 0, movida)
    return novas
  })
}

/** Remove de toda a rota as accoes que o drone escolhido nao suporta. */
export function removerAccoesNaoSuportadas(rota: Rota, drone: Drone): Rota {
  return {
    ...rota,
    waypoints: rota.waypoints.map((waypoint) => {
      const filtradas = waypoint.acoes.filter((a) => accaoSuportada(drone, a.tipo))
      return filtradas.length === waypoint.acoes.length ? waypoint : { ...waypoint, acoes: filtradas }
    }),
  }
}

/** Nome da accao em portugues, para a interface. */
export const NOME_DA_ACCAO: Record<TipoAccao, string> = {
  tirarFoto: 'Tirar foto',
  iniciarGravacao: 'Iniciar gravacao',
  pararGravacao: 'Parar gravacao',
  rodarGimbal: 'Rodar gimbal',
  rodarAeronave: 'Rodar aeronave',
  pairar: 'Pairar',
  zoom: 'Zoom',
}
