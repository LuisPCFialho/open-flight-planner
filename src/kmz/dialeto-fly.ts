import type { Accao, Drone, POI, Rota, Waypoint } from '../nucleo/tipos.ts'
import { deASL, paraASL } from '../nucleo/geodesia.ts'
import { velocidadeDe } from '../nucleo/operacoes-rota.ts'
import { no, numero, serializar, valor, type No } from './xml.ts'

/**
 * Gerador do dialeto DJI Fly, namespace `http://www.uav.com/wpmz/1.0.2`.
 *
 * Escrito contra um ficheiro real extraido de um DJI RC 2 com Mini 5 Pro, que
 * esta em `docs/esquemas/fly-1.0.2-*`. A ordem dos elementos e a que esta nesse
 * ficheiro, e os testes comparam a saida etiqueta a etiqueta.
 *
 * Neste dialeto as alturas sao sempre relativas ao ponto de descolagem
 * (`relativeToStartPoint`), seja qual for o modo em que a rota esta a ser
 * editada.
 */

export const NS_FLY = 'http://www.uav.com/wpmz/1.0.2'
const NS_KML = 'http://www.opengis.net/kml/2.2'

/**
 * Valores de `actionActuatorFunc` observados no ficheiro real. As restantes
 * accoes usam os nomes da especificacao da DJI e ainda nao foram confirmadas
 * contra um ficheiro deste dialeto. Ver `accoesPorConfirmar`.
 */
const FUNCOES_CONFIRMADAS = new Set(['takePhoto', 'gimbalRotate', 'gimbalEvenlyRotate'])

export type OpcoesFly = {
  /** Cota ortometrica do terreno por posicao, necessaria quando a rota esta em AGL. */
  cotas?: ReadonlyMap<string, number>
  chave?: (ponto: { lat: number; lon: number }) => string
  /** Milissegundos. Injectavel para a saida ser determinista nos testes. */
  createTime?: number
  updateTime?: number
}

export function gerarFly(
  rota: Rota,
  drone: Drone,
  opcoes: OpcoesFly = {},
): { template: string; waylines: string } {
  return {
    template: serializar(raizKml(documentoTemplate(rota, drone, opcoes))),
    waylines: serializar(raizKml(documentoWaylines(rota, drone, opcoes))),
  }
}

/** Accoes da rota cujo nome de funcao ainda nao foi confirmado num ficheiro real. */
export function accoesPorConfirmar(rota: Rota): string[] {
  const nomes = new Set<string>()
  for (const waypoint of rota.waypoints) {
    for (const accao of waypoint.acoes) {
      const funcao = FUNCAO_DA_ACCAO[accao.tipo]
      if (!FUNCOES_CONFIRMADAS.has(funcao)) nomes.add(funcao)
    }
  }
  return [...nomes]
}

// --- estrutura ---------------------------------------------------------------

function raizKml(documento: No): No {
  return no('kml', [documento], { xmlns: NS_KML, 'xmlns:wpml': NS_FLY })
}

function documentoTemplate(rota: Rota, drone: Drone, opcoes: OpcoesFly): No {
  const criado = opcoes.createTime ?? rota.criadaEm
  const alterado = opcoes.updateTime ?? rota.alteradaEm
  return no('Document', [
    valor('wpml:author', 'fly'),
    valor('wpml:createTime', criado),
    valor('wpml:updateTime', alterado),
    missionConfig(rota, drone),
  ])
}

function documentoWaylines(rota: Rota, drone: Drone, opcoes: OpcoesFly): No {
  return no('Document', [missionConfig(rota, drone), pasta(rota, opcoes)])
}

function missionConfig(rota: Rota, drone: Drone): No {
  return no('wpml:missionConfig', [
    valor('wpml:flyToWaylineMode', rota.modoDescolagem === 'descolagemSegura' ? 'safely' : 'pointToPoint'),
    valor('wpml:finishAction', rota.acaoFinal),
    valor('wpml:exitOnRCLost', 'executeLostAction'),
    valor('wpml:executeRCLostAction', rota.acaoPerdaSinal),
    valor('wpml:globalTransitionalSpeed', numero(rota.velocidadeGlobal, 1)),
    no('wpml:droneInfo', [
      valor('wpml:droneEnumValue', drone.droneEnumValue),
      valor('wpml:droneSubEnumValue', drone.droneSubEnumValue),
    ]),
  ])
}

// --- waypoints ---------------------------------------------------------------

/**
 * Altura a escrever em `executeHeight`: relativa a cota do ponto de descolagem,
 * porque `executeHeightMode` neste dialeto e sempre `relativeToStartPoint`.
 */
function alturaRelativa(
  rota: Rota,
  ponto: { lat: number; lon: number; altura: number },
  opcoes: OpcoesFly,
): number {
  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno
  if (rota.modoAltitude === 'ALT') return ponto.altura

  const chave = opcoes.chave
  const cota = chave && opcoes.cotas ? opcoes.cotas.get(chave(ponto)) : undefined
  if (rota.modoAltitude === 'AGL' && cota === undefined) {
    throw new Error(
      'rota em AGL sem cota do terreno para todos os pontos: a altura escrita ficaria errada',
    )
  }

  const ctx = { cotaDescolagem, cotaTerreno: cota ?? cotaDescolagem }
  return deASL(paraASL(ponto.altura, rota.modoAltitude, ctx), 'ALT', ctx)
}

const MODO_GUINADA: Record<Waypoint['modoGuinada'], string> = {
  followWayline: 'followWayline',
  towardPOI: 'towardPOI',
  fixed: 'smoothTransition',
  manual: 'manually',
}

const MODO_CURVA: Record<Waypoint['tipoCurva'], string> = {
  pararNoPonto: 'toPointAndStopWithContinuityCurvature',
  passarSuave: 'toPointAndPassWithContinuityCurvature',
}

const FUNCAO_DA_ACCAO: Record<Accao['tipo'], string> = {
  tirarFoto: 'takePhoto',
  iniciarGravacao: 'startRecord',
  pararGravacao: 'stopRecord',
  rodarGimbal: 'gimbalRotate',
  rodarAeronave: 'rotateYaw',
  pairar: 'hover',
  zoom: 'zoom',
}

function placemark(rota: Rota, waypoint: Waypoint, opcoes: OpcoesFly): No {
  const poi = waypoint.poiId ? rota.pois.find((p) => p.id === waypoint.poiId) : undefined

  return no('Placemark', [
    no('Point', [valor('coordinates', `${numero(waypoint.lon, 14)},${numero(waypoint.lat, 14)}`)]),
    valor('wpml:index', waypoint.index),
    valor('wpml:executeHeight', numero(alturaRelativa(rota, waypoint, opcoes), 3)),
    valor('wpml:waypointSpeed', numero(velocidadeDe(rota, waypoint), 1)),
    parametrosGuinada(rota, waypoint, poi, opcoes),
    no('wpml:waypointTurnParam', [
      valor('wpml:waypointTurnMode', MODO_CURVA[waypoint.tipoCurva]),
      valor('wpml:waypointTurnDampingDist', 0),
    ]),
    valor('wpml:useStraightLine', waypoint.tipoCurva === 'pararNoPonto' ? 0 : 1),
    ...grupoDeAccoes(waypoint),
    no('wpml:waypointGimbalHeadingParam', [
      valor('wpml:waypointGimbalPitchAngle', numero(waypoint.gimbalPitch, 1)),
      valor('wpml:waypointGimbalYawAngle', numero(waypoint.gimbalYaw, 1)),
    ]),
  ])
}

function parametrosGuinada(
  rota: Rota,
  waypoint: Waypoint,
  poi: POI | undefined,
  opcoes: OpcoesFly,
): No {
  const apontaPOI = waypoint.modoGuinada === 'towardPOI' && poi !== undefined

  return no('wpml:waypointHeadingParam', [
    valor('wpml:waypointHeadingMode', MODO_GUINADA[waypoint.modoGuinada]),
    valor('wpml:waypointHeadingAngle', numero(waypoint.guinada ?? 0, 1)),
    // Atencao a ordem: aqui e latitude, longitude, altura, ao contrario de
    // `coordinates`, que e longitude, latitude.
    valor(
      'wpml:waypointPoiPoint',
      apontaPOI && poi
        ? `${poi.lat.toFixed(6)},${poi.lon.toFixed(6)},${alturaRelativa(rota, poi, opcoes).toFixed(6)}`
        : '0.000000,0.000000,0.000000',
    ),
    valor('wpml:waypointHeadingAngleEnable', apontaPOI || waypoint.modoGuinada === 'fixed' ? 1 : 0),
    valor('wpml:waypointHeadingPathMode', 'followBadArc'),
    valor('wpml:waypointHeadingPoiIndex', 0),
  ])
}

function grupoDeAccoes(waypoint: Waypoint): No[] {
  if (waypoint.acoes.length === 0) return []

  return [
    no('wpml:actionGroup', [
      valor('wpml:actionGroupId', waypoint.index + 1),
      valor('wpml:actionGroupStartIndex', waypoint.index),
      valor('wpml:actionGroupEndIndex', waypoint.index),
      valor('wpml:actionGroupMode', 'parallel'),
      no('wpml:actionTrigger', [valor('wpml:actionTriggerType', 'reachPoint')]),
      ...waypoint.acoes.map((accao, i) => elementoAccao(accao, i + 1)),
    ]),
  ]
}

function elementoAccao(accao: Accao, id: number): No {
  return no('wpml:action', [
    valor('wpml:actionId', id),
    valor('wpml:actionActuatorFunc', FUNCAO_DA_ACCAO[accao.tipo]),
    no('wpml:actionActuatorFuncParam', parametrosDaAccao(accao)),
  ])
}

function parametrosDaAccao(accao: Accao): No[] {
  switch (accao.tipo) {
    case 'tirarFoto':
      return [valor('wpml:payloadPositionIndex', 0), valor('wpml:useGlobalPayloadLensIndex', 0)]

    case 'rodarGimbal':
      return [
        valor('wpml:gimbalHeadingYawBase', 'aircraft'),
        valor('wpml:gimbalRotateMode', 'absoluteAngle'),
        valor('wpml:gimbalPitchRotateEnable', 1),
        valor('wpml:gimbalPitchRotateAngle', numero(accao.pitch, 1)),
        valor('wpml:gimbalRollRotateEnable', 1),
        valor('wpml:gimbalRollRotateAngle', 0),
        valor('wpml:gimbalYawRotateEnable', accao.yaw === 0 ? 0 : 1),
        valor('wpml:gimbalYawRotateAngle', numero(accao.yaw, 1)),
        valor('wpml:gimbalRotateTimeEnable', 0),
        valor('wpml:gimbalRotateTime', 0),
        valor('wpml:payloadPositionIndex', 0),
      ]

    // As restantes usam nomes da especificacao da DJI, ainda nao vistos num
    // ficheiro real deste dialeto. Ver `accoesPorConfirmar`.
    case 'iniciarGravacao':
      return [valor('wpml:payloadPositionIndex', 0), valor('wpml:useGlobalPayloadLensIndex', 0)]
    case 'pararGravacao':
      return [valor('wpml:payloadPositionIndex', 0)]
    case 'rodarAeronave':
      return [
        valor('wpml:aircraftHeading', numero(accao.heading, 1)),
        valor('wpml:aircraftPathMode', 'counterClockwise'),
      ]
    case 'pairar':
      return [valor('wpml:hoverTime', numero(accao.segundos, 1))]
    case 'zoom':
      return [valor('wpml:payloadPositionIndex', 0), valor('wpml:focalLength', numero(accao.fator, 1))]
  }
}

// --- pasta de waylines -------------------------------------------------------

function pasta(rota: Rota, opcoes: OpcoesFly): No {
  return no('Folder', [
    valor('wpml:templateId', 0),
    valor('wpml:executeHeightMode', 'relativeToStartPoint'),
    valor('wpml:waylineId', 0),
    // O DJI Fly escreve zeros nestes dois campos: e o firmware que calcula o
    // percurso. Emitir uma estimativa aqui so criava divergencia com o aparelho.
    valor('wpml:distance', 0),
    valor('wpml:duration', 0),
    valor('wpml:autoFlightSpeed', numero(rota.velocidadeGlobal, 1)),
    ...rota.waypoints.map((waypoint) => placemark(rota, waypoint, opcoes)),
  ])
}
