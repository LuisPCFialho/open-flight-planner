import type { Accao, Drone, POI, Rota, Waypoint } from '../nucleo/tipos.ts'
import { aslParaHae, paraASL } from '../nucleo/geodesia.ts'
import { velocidadeDe } from '../nucleo/operacoes-rota.ts'
import { calcularEstatisticas } from '../nucleo/estatisticas.ts'
import { no, numero, serializar, valor, type No } from './xml.ts'

/**
 * Gerador do dialeto DJI Pilot 2 e FlightHub 2, namespace
 * `http://www.dji.com/wpmz/1.0.6`.
 *
 * ESTADO: o que esta confirmado vem da exportacao real descrita em
 * `docs/esquemas/pilot2-1.0.6-diferencas.md` e das leituras do simulador em
 * `docs/observacoes-pilot2-simulador.md`:
 *
 *   - o namespace
 *   - os campos que `missionConfig` acrescenta, incluindo `payloadInfo`
 *   - `takeOffRefPoint` com altura elipsoidal, confirmado a menos de um decimetro
 *   - `executeHeightMode` igual a `WGS84` e alturas absolutas no waylines
 *   - `actionGroupMode` igual a `sequence`
 *   - a existencia da accao de zoom
 *   - o `template.kml` levar o percurso todo, com `ellipsoidHeight` e `height`
 *     em vez de `executeHeight`
 *
 * POR CONFIRMAR: a ordem exacta dos elementos dentro do `Folder` do template e
 * os valores de `templateType`, `gimbalPitchMode` e `globalWaypointHeadingParam`.
 * Estao escritos conforme a especificacao publica da DJI. Assim que houver um
 * ficheiro real desta exportacao, este gerador passa a ter o mesmo teste de
 * conformidade etiqueta a etiqueta que o dialeto Fly ja tem.
 */

export const NS_PILOT2 = 'http://www.dji.com/wpmz/1.0.6'
const NS_KML = 'http://www.opengis.net/kml/2.2'

export type OpcoesPilot2 = {
  /** Cota ortometrica do terreno por posicao, necessaria quando a rota esta em AGL. */
  cotas?: ReadonlyMap<string, number>
  chave?: (ponto: { lat: number; lon: number }) => string
  createTime?: number
  updateTime?: number
}

export function gerarPilot2(
  rota: Rota,
  drone: Drone,
  opcoes: OpcoesPilot2 = {},
): { template: string; waylines: string } {
  return {
    template: serializar(raizKml(documentoTemplate(rota, drone, opcoes))),
    waylines: serializar(raizKml(documentoWaylines(rota, drone, opcoes))),
  }
}

function raizKml(documento: No): No {
  return no('kml', [documento], { xmlns: NS_KML, 'xmlns:wpml': NS_PILOT2 })
}

// --- configuracao ------------------------------------------------------------

function missionConfig(rota: Rota, drone: Drone): No {
  const descolagemASL = rota.pontoDescolagem.cotaTerreno
  const descolagemHAE = aslParaHae(descolagemASL, rota.ondulacaoGeoide)

  return no('wpml:missionConfig', [
    valor('wpml:flyToWaylineMode', rota.modoDescolagem === 'descolagemSegura' ? 'safely' : 'pointToPoint'),
    valor('wpml:finishAction', rota.acaoFinal),
    valor('wpml:exitOnRCLost', 'executeLostAction'),
    valor('wpml:executeRCLostAction', rota.acaoPerdaSinal),
    valor('wpml:takeOffSecurityHeight', numero(rota.alturaSegurancaDescolagem, 1)),
    // Latitude, longitude, altura ELIPSOIDAL. Escrever aqui a ortometrica poe a
    // referencia de descolagem 55,6 m abaixo do sitio, em Portugal continental.
    valor(
      'wpml:takeOffRefPoint',
      `${rota.pontoDescolagem.lat.toFixed(6)},${rota.pontoDescolagem.lon.toFixed(6)},${descolagemHAE.toFixed(6)}`,
    ),
    valor('wpml:takeOffRefPointAGLHeight', 0),
    valor('wpml:globalTransitionalSpeed', numero(rota.velocidadeGlobal, 1)),
    valor('wpml:globalRTHHeight', numero(rota.alturaRTH, 1)),
    valor('wpml:waylineAvoidLimitAreaMode', 0),
    no('wpml:droneInfo', [
      valor('wpml:droneEnumValue', drone.droneEnumValue),
      valor('wpml:droneSubEnumValue', drone.droneSubEnumValue),
    ]),
    no('wpml:payloadInfo', [
      valor('wpml:payloadEnumValue', drone.payloadEnumValue ?? 0),
      valor('wpml:payloadSubEnumValue', drone.payloadSubEnumValue ?? 0),
      valor('wpml:payloadPositionIndex', 0),
    ]),
  ])
}

// --- alturas -----------------------------------------------------------------

/** Altura ortometrica (ASL) de um ponto, no modo em que a rota esta a ser editada. */
function alturaASL(
  rota: Rota,
  ponto: { lat: number; lon: number; altura: number },
  opcoes: OpcoesPilot2,
): number {
  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno
  if (rota.modoAltitude === 'ASL') return ponto.altura

  const chave = opcoes.chave
  const cota = chave && opcoes.cotas ? opcoes.cotas.get(chave(ponto)) : undefined
  if (rota.modoAltitude === 'AGL' && cota === undefined) {
    throw new Error(
      'rota em AGL sem cota do terreno para todos os pontos: a altura escrita ficaria errada',
    )
  }
  return paraASL(ponto.altura, rota.modoAltitude, {
    cotaDescolagem,
    cotaTerreno: cota ?? cotaDescolagem,
  })
}

// --- template ----------------------------------------------------------------

function documentoTemplate(rota: Rota, drone: Drone, opcoes: OpcoesPilot2): No {
  return no('Document', [
    valor('wpml:author', 'pye-flight-planner'),
    valor('wpml:createTime', opcoes.createTime ?? rota.criadaEm),
    valor('wpml:updateTime', opcoes.updateTime ?? rota.alteradaEm),
    missionConfig(rota, drone),
    pastaTemplate(rota, opcoes),
  ])
}

function pastaTemplate(rota: Rota, opcoes: OpcoesPilot2): No {
  const alturaGlobal = rota.waypoints[0]
    ? alturaASL(rota, rota.waypoints[0], opcoes)
    : rota.pontoDescolagem.cotaTerreno

  return no('Folder', [
    valor('wpml:templateType', 'waypoint'),
    valor('wpml:templateId', 0),
    no('wpml:waylineCoordinateSysParam', [
      valor('wpml:coordinateMode', 'WGS84'),
      valor('wpml:heightMode', 'EGM96'),
    ]),
    valor('wpml:autoFlightSpeed', numero(rota.velocidadeGlobal, 1)),
    valor('wpml:globalHeight', numero(alturaGlobal, 3)),
    valor('wpml:caliFlightEnable', 0),
    valor('wpml:gimbalPitchMode', 'usePointSetting'),
    no('wpml:globalWaypointHeadingParam', [
      valor('wpml:waypointHeadingMode', 'followWayline'),
      valor('wpml:waypointHeadingAngle', 0),
      valor('wpml:waypointPoiPoint', '0.000000,0.000000,0.000000'),
      valor('wpml:waypointHeadingPathMode', 'followBadArc'),
    ]),
    valor('wpml:globalWaypointTurnMode', 'toPointAndStopWithDiscontinuityCurvature'),
    valor('wpml:globalUseStraightLine', 1),
    ...rota.waypoints.map((waypoint) => placemarkTemplate(rota, waypoint, opcoes)),
  ])
}

function placemarkTemplate(rota: Rota, waypoint: Waypoint, opcoes: OpcoesPilot2): No {
  const asl = alturaASL(rota, waypoint, opcoes)
  const poi = waypoint.poiId ? rota.pois.find((p) => p.id === waypoint.poiId) : undefined

  return no('Placemark', [
    no('Point', [valor('coordinates', `${numero(waypoint.lon, 14)},${numero(waypoint.lat, 14)}`)]),
    valor('wpml:index', waypoint.index),
    // A diferenca entre as duas e a ondulacao do geoide.
    valor('wpml:ellipsoidHeight', numero(aslParaHae(asl, rota.ondulacaoGeoide), 6)),
    valor('wpml:height', numero(asl, 6)),
    valor('wpml:useGlobalHeight', 0),
    valor('wpml:useGlobalSpeed', waypoint.velocidade === undefined ? 1 : 0),
    valor('wpml:waypointSpeed', numero(velocidadeDe(rota, waypoint), 1)),
    valor('wpml:useGlobalHeadingParam', 0),
    parametrosGuinada(rota, waypoint, poi, opcoes),
    valor('wpml:useGlobalTurnParam', 0),
    no('wpml:waypointTurnParam', [
      valor('wpml:waypointTurnMode', MODO_CURVA[waypoint.tipoCurva]),
      valor('wpml:waypointTurnDampingDist', 0),
    ]),
    valor('wpml:useStraightLine', waypoint.tipoCurva === 'pararNoPonto' ? 0 : 1),
    no('wpml:waypointGimbalHeadingParam', [
      valor('wpml:waypointGimbalPitchAngle', numero(waypoint.gimbalPitch, 1)),
      valor('wpml:waypointGimbalYawAngle', numero(waypoint.gimbalYaw, 1)),
    ]),
    ...grupoDeAccoes(waypoint),
  ])
}

// --- waylines ----------------------------------------------------------------

function documentoWaylines(rota: Rota, drone: Drone, opcoes: OpcoesPilot2): No {
  return no('Document', [missionConfig(rota, drone), pastaWaylines(rota, opcoes)])
}

function pastaWaylines(rota: Rota, opcoes: OpcoesPilot2): No {
  const estatisticas = calcularEstatisticas(rota)

  return no('Folder', [
    valor('wpml:templateId', 0),
    // Alturas absolutas neste dialeto, ao contrario do dialeto Fly.
    valor('wpml:executeHeightMode', 'WGS84'),
    valor('wpml:waylineId', 0),
    valor('wpml:distance', numero(estatisticas.distancia3D, 3)),
    valor('wpml:duration', numero(estatisticas.duracao, 3)),
    valor('wpml:autoFlightSpeed', numero(rota.velocidadeGlobal, 1)),
    ...rota.waypoints.map((waypoint) => placemarkWaylines(rota, waypoint, opcoes)),
  ])
}

function placemarkWaylines(rota: Rota, waypoint: Waypoint, opcoes: OpcoesPilot2): No {
  const poi = waypoint.poiId ? rota.pois.find((p) => p.id === waypoint.poiId) : undefined

  return no('Placemark', [
    no('Point', [valor('coordinates', `${numero(waypoint.lon, 14)},${numero(waypoint.lat, 14)}`)]),
    valor('wpml:index', waypoint.index),
    valor('wpml:executeHeight', numero(alturaASL(rota, waypoint, opcoes), 6)),
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

// --- partilhado --------------------------------------------------------------

const MODO_CURVA: Record<Waypoint['tipoCurva'], string> = {
  pararNoPonto: 'toPointAndStopWithContinuityCurvature',
  passarSuave: 'toPointAndPassWithContinuityCurvature',
}

const MODO_GUINADA: Record<Waypoint['modoGuinada'], string> = {
  followWayline: 'followWayline',
  towardPOI: 'towardPOI',
  fixed: 'smoothTransition',
  manual: 'manually',
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

function parametrosGuinada(
  rota: Rota,
  waypoint: Waypoint,
  poi: POI | undefined,
  opcoes: OpcoesPilot2,
): No {
  const apontaPOI = waypoint.modoGuinada === 'towardPOI' && poi !== undefined

  return no('wpml:waypointHeadingParam', [
    valor('wpml:waypointHeadingMode', MODO_GUINADA[waypoint.modoGuinada]),
    valor('wpml:waypointHeadingAngle', numero(waypoint.guinada ?? 0, 1)),
    valor(
      'wpml:waypointPoiPoint',
      apontaPOI && poi
        ? `${poi.lat.toFixed(6)},${poi.lon.toFixed(6)},${alturaASL(rota, poi, opcoes).toFixed(6)}`
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
      // Neste dialeto as accoes correm por ordem, nao em paralelo.
      valor('wpml:actionGroupMode', 'sequence'),
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
      return [
        valor('wpml:payloadPositionIndex', 0),
        valor('wpml:useGlobalPayloadLensIndex', 1),
      ]
    case 'iniciarGravacao':
      return [
        valor('wpml:payloadPositionIndex', 0),
        valor('wpml:useGlobalPayloadLensIndex', 1),
      ]
    case 'pararGravacao':
      return [valor('wpml:payloadPositionIndex', 0)]
    case 'rodarGimbal':
      return [
        valor('wpml:gimbalHeadingYawBase', 'aircraft'),
        valor('wpml:gimbalRotateMode', 'absoluteAngle'),
        valor('wpml:gimbalPitchRotateEnable', 1),
        valor('wpml:gimbalPitchRotateAngle', numero(accao.pitch, 1)),
        valor('wpml:gimbalRollRotateEnable', 0),
        valor('wpml:gimbalRollRotateAngle', 0),
        valor('wpml:gimbalYawRotateEnable', accao.yaw === 0 ? 0 : 1),
        valor('wpml:gimbalYawRotateAngle', numero(accao.yaw, 1)),
        valor('wpml:gimbalRotateTimeEnable', 0),
        valor('wpml:gimbalRotateTime', 0),
        valor('wpml:payloadPositionIndex', 0),
      ]
    case 'rodarAeronave':
      return [
        valor('wpml:aircraftHeading', numero(accao.heading, 1)),
        valor('wpml:aircraftPathMode', 'counterClockwise'),
      ]
    case 'pairar':
      return [valor('wpml:hoverTime', numero(accao.segundos, 1))]
    case 'zoom':
      return [
        valor('wpml:payloadPositionIndex', 0),
        valor('wpml:focalLength', numero(accao.fator, 1)),
      ]
  }
}
