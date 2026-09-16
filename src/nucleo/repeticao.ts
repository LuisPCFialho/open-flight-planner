import type { Rota, Waypoint } from './tipos.ts'
import { deslocar, rumo } from './geodesia.ts'
import { novoId } from './ids.ts'
import { renumerar } from './operacoes-rota.ts'

/**
 * Repetir um troço de rota, que e como uma cobertura de central se constroi.
 *
 * Numa central fotovoltaica as mesas estao em filas paralelas iguais. Marcar a
 * primeira passagem a mao e trabalho; marcar as vinte seguintes, uma a uma, e
 * trabalho que nao acrescenta nada - sao a mesma passagem deslocada de fila para
 * fila. Daqui saem as duas operacoes que faltavam: repetir deslocado, e voltar
 * para tras pelo mesmo caminho.
 */

/** Waypoints escolhidos, na ordem em que estao na rota. */
function seleccionados(rota: Rota, ids: ReadonlySet<string>): Waypoint[] {
  return rota.waypoints.filter((w) => ids.has(w.id))
}

/**
 * Rumo perpendicular ao troço, para a direita de quem o percorre.
 *
 * E a direccao natural de "a fila seguinte": quem marca uma passagem sobre uma
 * fila de mesas quer a copia ao lado, nao a frente.
 */
export function rumoPerpendicular(waypoints: readonly Waypoint[]): number {
  const primeiro = waypoints[0]
  const ultimo = waypoints[waypoints.length - 1]
  if (!primeiro || !ultimo || waypoints.length < 2) return 90

  return (rumo(primeiro, ultimo) + 90) % 360
}

/**
 * Acrescenta `quantas` copias do troço escolhido, cada uma `afastamento` metros
 * mais longe na direccao `rumoGraus`.
 *
 * As copias vao para o fim da rota e nao intercaladas: a ordem dos waypoints e
 * a ordem de voo, e intercalar faria a aeronave saltar de fila para fila a cada
 * ponto. Cada copia e um troço inteiro, percorrido do principio ao fim.
 */
export function repetirDeslocado(
  rota: Rota,
  ids: ReadonlySet<string>,
  opcoes: { afastamento: number; rumoGraus?: number; quantas?: number },
): Rota {
  const troco = seleccionados(rota, ids)
  const quantas = Math.max(1, Math.floor(opcoes.quantas ?? 1))
  if (troco.length === 0 || !Number.isFinite(opcoes.afastamento)) return rota

  const direccao = opcoes.rumoGraus ?? rumoPerpendicular(troco)
  const novos: Waypoint[] = []

  for (let copia = 1; copia <= quantas; copia++) {
    const metros = opcoes.afastamento * copia
    for (const waypoint of troco) {
      const movido = deslocar(waypoint, direccao, metros)
      novos.push({
        ...waypoint,
        id: novoId(),
        lat: movido.lat,
        lon: movido.lon,
        // As accoes copiam-se, mas cada uma tem de ser sua: partilhar o mesmo
        // objecto faria editar uma mexer em todas.
        acoes: waypoint.acoes.map((accao) => ({ ...accao })),
      })
    }
  }

  return { ...rota, waypoints: renumerar([...rota.waypoints, ...novos]) }
}

/**
 * Acrescenta o troço escolhido outra vez, em sentido contrario.
 *
 * E a volta: chegado ao fim da fila, a aeronave refaz o caminho para tras. O
 * ponto onde ela ja esta nao se repete, senao ficariam dois waypoints em cima um
 * do outro e o aparelho parava ali duas vezes.
 */
export function repetirEmSentidoContrario(rota: Rota, ids: ReadonlySet<string>): Rota {
  const troco = seleccionados(rota, ids)
  if (troco.length < 2) return rota

  const ultimoDaRota = rota.waypoints[rota.waypoints.length - 1]
  const comecaNoFim = ultimoDaRota !== undefined && ultimoDaRota.id === troco[troco.length - 1]?.id

  const invertido = [...troco].reverse()
  const aCopiar = comecaNoFim ? invertido.slice(1) : invertido

  const novos = aCopiar.map((waypoint) => ({
    ...waypoint,
    id: novoId(),
    acoes: waypoint.acoes.map((accao) => ({ ...accao })),
  }))

  return { ...rota, waypoints: renumerar([...rota.waypoints, ...novos]) }
}
