import type { Rota, Waypoint } from './tipos.ts'
import { novoId } from './ids.ts'

/**
 * Operacoes sobre uma rota, todas puras e imutaveis: devolvem sempre uma rota
 * nova. E o que permite ter desfazer e refazer a guardar apenas referencias, e
 * o que evita que uma alteracao no painel de propriedades mexa por engano no
 * historico.
 */

/** Valores de partida de uma rota nova, alinhados com o que o Pilot 2 usa. */
export function rotaVazia(dados: {
  nome: string
  projetoId: string
  droneId: string
  pontoDescolagem: Rota['pontoDescolagem']
}): Rota {
  const agora = Date.now()
  return {
    id: novoId(),
    nome: dados.nome,
    projetoId: dados.projetoId,
    droneId: dados.droneId,
    pontoDescolagem: dados.pontoDescolagem,
    modoAltitude: 'AGL',
    velocidadeGlobal: 5,
    alturaSegurancaDescolagem: 20,
    modoDescolagem: 'subidaDireta',
    acaoFinal: 'goHome',
    acaoPerdaSinal: 'goBack',
    alturaRTH: 100,
    alturaMinimaAcimaDoSolo: 30,
    ondulacaoGeoide: 55.6,
    waypoints: [],
    pois: [],
    criadaEm: agora,
    alteradaEm: agora,
  }
}

export function waypointNovo(dados: {
  lat: number
  lon: number
  altura: number
  index: number
}): Waypoint {
  return {
    id: novoId(),
    index: dados.index,
    lat: dados.lat,
    lon: dados.lon,
    altura: dados.altura,
    modoGuinada: 'followWayline',
    gimbalPitch: -30,
    gimbalYaw: 0,
    tipoCurva: 'pararNoPonto',
    distanciaAmortecimento: 0,
    acoes: [],
  }
}

/** Renumera `index` de forma contigua a partir de zero, sem tocar no que ja esta certo. */
export function renumerar(waypoints: readonly Waypoint[]): Waypoint[] {
  return waypoints.map((wp, i) => (wp.index === i ? wp : { ...wp, index: i }))
}

export function acrescentarWaypoint(rota: Rota, waypoint: Waypoint): Rota {
  return { ...rota, waypoints: renumerar([...rota.waypoints, waypoint]) }
}

/** Insere na posicao dada, deslocando os seguintes. Serve o alt+clique num troco. */
export function inserirWaypoint(rota: Rota, waypoint: Waypoint, posicao: number): Rota {
  const waypoints = [...rota.waypoints]
  waypoints.splice(Math.max(0, Math.min(posicao, waypoints.length)), 0, waypoint)
  return { ...rota, waypoints: renumerar(waypoints) }
}

export function alterarWaypoint(
  rota: Rota,
  id: string,
  alteracao: Partial<Omit<Waypoint, 'id' | 'index'>>,
): Rota {
  return {
    ...rota,
    waypoints: rota.waypoints.map((wp) => (wp.id === id ? { ...wp, ...alteracao } : wp)),
  }
}

/** Edicao em lote: aplica a mesma alteracao a varios waypoints de uma vez. */
export function alterarWaypoints(
  rota: Rota,
  ids: readonly string[],
  alteracao: Partial<Omit<Waypoint, 'id' | 'index'>>,
): Rota {
  const alvos = new Set(ids)
  return {
    ...rota,
    waypoints: rota.waypoints.map((wp) => (alvos.has(wp.id) ? { ...wp, ...alteracao } : wp)),
  }
}

export function removerWaypoints(rota: Rota, ids: readonly string[]): Rota {
  const aRemover = new Set(ids)
  return { ...rota, waypoints: renumerar(rota.waypoints.filter((wp) => !aRemover.has(wp.id))) }
}

/** Velocidade efectiva de um waypoint, que herda da rota quando nao esta definida. */
export function velocidadeDe(rota: Rota, waypoint: Waypoint): number {
  return waypoint.velocidade ?? rota.velocidadeGlobal
}
