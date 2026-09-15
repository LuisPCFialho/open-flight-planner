import type { Accao, Dialeto, POI, Rota, TipoCurva, Waypoint } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { DRONES } from '../drones.ts'
import { AGL_MINIMO_PREDEFINIDO } from '../nucleo/validacoes.ts'
import { filho, filhos, lerXML, numeroEm, textoEm, type NoLido } from './parse-xml.ts'
import { NS_FLY } from './dialeto-fly.ts'
import { NS_PILOT2 } from './dialeto-pilot2.ts'
import type { ConteudoKMZ } from './empacotar.ts'

/**
 * Leitura de rotas a partir de um KMZ.
 *
 * O dialeto e decidido pelo namespace declarado no ficheiro, nunca pelo drone
 * escolhido na aplicacao: quem manda e o que esta escrito.
 */

export function detectarDialeto(xml: string): Dialeto {
  const raiz = lerXML(xml)
  const ns = raiz.atributos['xmlns:wpml'] ?? ''

  if (ns.includes('uav.com/wpmz')) return 'fly'
  if (ns.includes('dji.com/wpmz')) return 'pilot2'
  throw new Error(`namespace WPML desconhecido: ${ns || '(ausente)'}`)
}

export type RotaImportada = {
  rota: Rota
  dialeto: Dialeto
  /**
   * Se a cota do terreno no ponto de descolagem veio escrita no ficheiro.
   *
   * O dialeto do Pilot 2 traz `takeOffRefPoint` e sabe-se logo. O dialeto Fly
   * nao traz nada disso, e sem essa cota a altura acima do solo de toda a rota
   * sai errada pelo valor da cota do sitio, que em Portugal sao facilmente
   * algumas centenas de metros. Quem importa tem de a ir buscar ao motor de
   * terreno antes de mostrar a rota.
   */
  cotaDescolagemConhecida: boolean
  /** Tudo o que foi lido mas nao coube no modelo, para nao se perder em silencio. */
  avisos: string[]
}

export function importarKMZ(
  conteudo: ConteudoKMZ,
  contexto: { projetoId: string; nome?: string },
): RotaImportada {
  const dialeto = detectarDialeto(conteudo.waylines)
  const raiz = lerXML(conteudo.waylines)
  const documento = filho(raiz, 'Document')
  const avisos: string[] = []

  const config = filho(documento, 'wpml:missionConfig')
  const droneEnum = numeroEm(config, 'wpml:droneInfo/wpml:droneEnumValue')
  const droneSub = numeroEm(config, 'wpml:droneInfo/wpml:droneSubEnumValue')

  const drone =
    DRONES.find((d) => d.droneEnumValue === droneEnum && d.droneSubEnumValue === droneSub) ??
    DRONES.find((d) => d.dialeto === dialeto)
  if (!drone) throw new Error(`nenhum drone conhecido corresponde a ${droneEnum}/${droneSub}`)
  if (drone.droneEnumValue !== droneEnum) {
    avisos.push(
      `o ficheiro declara o drone ${droneEnum}/${droneSub}, que nao esta no catalogo. Foi usado o ${drone.nome}.`,
    )
  }

  const pasta = filho(documento, 'Folder')
  if (!pasta) throw new Error('waylines.wpml sem Folder: nao ha percurso para ler')

  const modoAltura = textoEm(pasta, 'wpml:executeHeightMode') ?? 'relativeToStartPoint'
  const pois: POI[] = []
  const waypoints = filhos(pasta, 'Placemark').map((placemark, i) =>
    lerWaypoint(placemark, i, pois, avisos),
  )

  const takeOffRef = textoEm(config, 'wpml:takeOffRefPoint')
  const ondulacao = 55.6
  const descolagem = lerPontoDescolagem(takeOffRef, waypoints, ondulacao)
  const cotaDescolagemConhecida = descolagem.cotaTerreno !== null

  const agora = Date.now()
  const rota: Rota = {
    id: novoId(),
    nome: contexto.nome ?? 'Rota importada',
    projetoId: contexto.projetoId,
    droneId: drone.id,
    pontoDescolagem: { ...descolagem, cotaTerreno: descolagem.cotaTerreno ?? 0 },
    modoAltitude: modoAltura === 'relativeToStartPoint' ? 'ALT' : 'ASL',
    velocidadeGlobal: numeroEm(config, 'wpml:globalTransitionalSpeed') ?? 5,
    alturaSegurancaDescolagem: numeroEm(config, 'wpml:takeOffSecurityHeight') ?? 20,
    modoDescolagem: textoEm(config, 'wpml:flyToWaylineMode') === 'safely' ? 'descolagemSegura' : 'subidaDireta',
    acaoFinal: (textoEm(config, 'wpml:finishAction') ?? 'goHome') as Rota['acaoFinal'],
    acaoPerdaSinal: (textoEm(config, 'wpml:executeRCLostAction') ?? 'goBack') as Rota['acaoPerdaSinal'],
    alturaRTH: numeroEm(config, 'wpml:globalRTHHeight') ?? 100,
    alturaMinimaAcimaDoSolo: AGL_MINIMO_PREDEFINIDO,
    ondulacaoGeoide: ondulacao,
    waypoints,
    pois,
    criadaEm: agora,
    alteradaEm: agora,
  }

  if (modoAltura !== 'relativeToStartPoint' && modoAltura !== 'EGM96' && modoAltura !== 'WGS84') {
    avisos.push(`modo de altura desconhecido no ficheiro: ${modoAltura}`)
  }

  return { rota, dialeto, cotaDescolagemConhecida, avisos }
}

/**
 * Ponto de descolagem.
 *
 * No dialeto do Pilot 2 vem em `takeOffRefPoint`, com a altura em elipsoidal.
 * No dialeto Fly nao vem escrito em lado nenhum, e usa-se o primeiro waypoint.
 */
function lerPontoDescolagem(
  takeOffRef: string | undefined,
  waypoints: readonly Waypoint[],
  ondulacao: number,
): { lat: number; lon: number; cotaTerreno: number | null } {
  if (takeOffRef) {
    const [lat, lon, hae] = takeOffRef.split(',').map((p) => Number.parseFloat(p.trim()))
    if (lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
      return {
        lat,
        lon,
        // A altura vem elipsoidal; a cota do terreno e a ortometrica.
        cotaTerreno: hae !== undefined && Number.isFinite(hae) ? hae - ondulacao : null,
      }
    }
  }

  const primeiro = waypoints[0]
  return { lat: primeiro?.lat ?? 0, lon: primeiro?.lon ?? 0, cotaTerreno: null }
}

const CURVA_DE: Record<string, TipoCurva> = {
  toPointAndStopWithContinuityCurvature: 'pararNoPonto',
  toPointAndStopWithDiscontinuityCurvature: 'pararNoPonto',
  toPointAndPassWithContinuityCurvature: 'passarSuave',
  coordinateTurn: 'passarSuave',
}

const GUINADA_DE: Record<string, Waypoint['modoGuinada']> = {
  followWayline: 'followWayline',
  towardPOI: 'towardPOI',
  smoothTransition: 'fixed',
  manually: 'manual',
  fixed: 'fixed',
}

function lerWaypoint(placemark: NoLido, ordem: number, pois: POI[], avisos: string[]): Waypoint {
  const coordenadas = textoEm(placemark, 'Point/coordinates') ?? ''
  const [lonTexto, latTexto] = coordenadas.split(',')
  const lon = Number.parseFloat(lonTexto ?? '')
  const lat = Number.parseFloat(latTexto ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`waypoint ${ordem} com coordenadas ilegiveis: "${coordenadas}"`)
  }

  const guinada = filho(placemark, 'wpml:waypointHeadingParam')
  const modoGuinadaTexto = textoEm(guinada, 'wpml:waypointHeadingMode') ?? 'followWayline'
  const modoGuinada = GUINADA_DE[modoGuinadaTexto] ?? 'followWayline'
  if (!GUINADA_DE[modoGuinadaTexto]) {
    avisos.push(`waypoint ${ordem}: modo de guinada desconhecido "${modoGuinadaTexto}"`)
  }

  const turno = filho(placemark, 'wpml:waypointTurnParam')
  const curvaTexto = textoEm(turno, 'wpml:waypointTurnMode') ?? ''
  const tipoCurva = CURVA_DE[curvaTexto] ?? 'pararNoPonto'
  if (curvaTexto && !CURVA_DE[curvaTexto]) {
    avisos.push(`waypoint ${ordem}: tipo de curva desconhecido "${curvaTexto}"`)
  }

  // `executeHeight` no dialeto Fly, `height` no do Pilot 2.
  const altura =
    numeroEm(placemark, 'wpml:executeHeight') ?? numeroEm(placemark, 'wpml:height') ?? 0

  const gimbal = filho(placemark, 'wpml:waypointGimbalHeadingParam')
  const waypoint: Waypoint = {
    id: novoId(),
    index: ordem,
    lat,
    lon,
    altura,
    modoGuinada,
    gimbalPitch: numeroEm(gimbal, 'wpml:waypointGimbalPitchAngle') ?? -30,
    gimbalYaw: numeroEm(gimbal, 'wpml:waypointGimbalYawAngle') ?? 0,
    tipoCurva,
    acoes: lerAccoes(placemark, ordem, avisos),
  }

  const velocidade = numeroEm(placemark, 'wpml:waypointSpeed')
  if (velocidade !== undefined) waypoint.velocidade = velocidade

  const anguloFixo = numeroEm(guinada, 'wpml:waypointHeadingAngle')
  if (modoGuinada === 'fixed' && anguloFixo !== undefined) waypoint.guinada = anguloFixo

  if (modoGuinada === 'towardPOI') {
    const poi = poiDoWaypoint(textoEm(guinada, 'wpml:waypointPoiPoint'), pois)
    if (poi) waypoint.poiId = poi.id
    else {
      waypoint.modoGuinada = 'followWayline'
      avisos.push(`waypoint ${ordem}: aponta a um POI mas o ficheiro nao traz as coordenadas`)
    }
  }

  return waypoint
}

/**
 * Os POI nao tem identidade no ficheiro: vem repetidos em cada waypoint que os
 * segue. Waypoints que apontem ao mesmo sitio passam a partilhar um POI.
 */
function poiDoWaypoint(texto: string | undefined, pois: POI[]): POI | null {
  if (!texto) return null
  const [lat, lon, altura] = texto.split(',').map((p) => Number.parseFloat(p.trim()))
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }
  if (lat === 0 && lon === 0) return null

  const existente = pois.find(
    (p) => Math.abs(p.lat - lat) < 1e-7 && Math.abs(p.lon - lon) < 1e-7,
  )
  if (existente) return existente

  const poi: POI = {
    id: novoId(),
    nome: `POI ${pois.length + 1}`,
    lat,
    lon,
    altura: altura !== undefined && Number.isFinite(altura) ? altura : 0,
  }
  pois.push(poi)
  return poi
}

const ACCAO_DE: Record<string, Accao['tipo']> = {
  takePhoto: 'tirarFoto',
  startRecord: 'iniciarGravacao',
  stopRecord: 'pararGravacao',
  gimbalRotate: 'rodarGimbal',
  gimbalEvenlyRotate: 'rodarGimbal',
  rotateYaw: 'rodarAeronave',
  hover: 'pairar',
  zoom: 'zoom',
}

function lerAccoes(placemark: NoLido, ordem: number, avisos: string[]): Accao[] {
  const accoes: Accao[] = []

  for (const grupo of filhos(placemark, 'wpml:actionGroup')) {
    for (const elemento of filhos(grupo, 'wpml:action')) {
      const funcao = textoEm(elemento, 'wpml:actionActuatorFunc') ?? ''
      const tipo = ACCAO_DE[funcao]
      if (!tipo) {
        avisos.push(`waypoint ${ordem}: accao desconhecida "${funcao}", ignorada`)
        continue
      }

      const parametros = filho(elemento, 'wpml:actionActuatorFuncParam')
      switch (tipo) {
        case 'rodarGimbal':
          accoes.push({
            tipo,
            pitch: numeroEm(parametros, 'wpml:gimbalPitchRotateAngle') ?? 0,
            yaw: numeroEm(parametros, 'wpml:gimbalYawRotateAngle') ?? 0,
          })
          break
        case 'rodarAeronave':
          accoes.push({ tipo, heading: numeroEm(parametros, 'wpml:aircraftHeading') ?? 0 })
          break
        case 'pairar':
          accoes.push({ tipo, segundos: numeroEm(parametros, 'wpml:hoverTime') ?? 0 })
          break
        case 'zoom':
          accoes.push({ tipo, fator: numeroEm(parametros, 'wpml:focalLength') ?? 1 })
          break
        default:
          accoes.push({ tipo })
      }
    }
  }

  return accoes
}

export { NS_FLY, NS_PILOT2 }
