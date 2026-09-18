import type { Feature, FeatureCollection } from 'geojson'
import type { Area, LatLon, Rota } from '../nucleo/tipos.ts'
import { contornoFechado } from '../nucleo/areas.ts'
import type { PontaDoEnquadramento } from '../estado/alvo-camara.ts'

/**
 * O que o mapa desenha por fontes GeoJSON: a rota em planta, as areas de
 * referencia, a regua e a pre-visualizacao do enquadramento.
 *
 * Sao contas puras - entra geometria, sai geometria - e vivem fora do componente
 * para se poderem verificar sem mapa nenhum. Tudo o resto que o mapa desenha
 * passa pelas camadas WebGL proprias ou por marcadores do DOM.
 */

const VAZIO: FeatureCollection = { type: 'FeatureCollection', features: [] }

function coordenada(ponto: LatLon): [number, number] {
  return [ponto.lon, ponto.lat]
}

/** Uma linha entre dois pontos, sem propriedades. */
function linha(de: LatLon, para: LatLon, propriedades: Feature['properties'] = {}): Feature {
  return {
    type: 'Feature',
    properties: propriedades,
    geometry: { type: 'LineString', coordinates: [coordenada(de), coordenada(para)] },
  }
}

/**
 * Os trocos da rota, um por par de waypoints seguidos.
 *
 * Cada troco leva o seu indice nas propriedades: e o que permite inserir um
 * ponto no meio de um troco, com Alt e clique, sabendo em qual se carregou.
 */
export function segmentosGeoJSON(waypoints: Rota['waypoints']): FeatureCollection {
  const features: Feature[] = []

  for (let i = 1; i < waypoints.length; i++) {
    const de = waypoints[i - 1]
    const para = waypoints[i]
    if (!de || !para) continue
    features.push(linha(de, para, { indice: i - 1 }))
  }

  return { type: 'FeatureCollection', features }
}

/**
 * O ponto de descolagem e as pernas que a aeronave voa sem estar a filmar.
 *
 * Nao se desenhavam em lado nenhum. A rota aparecia a comecar no ar, e o sitio
 * de onde o aparelho levanta - que e tambem onde o piloto fica - nao estava no
 * plano. A saida ate ao primeiro waypoint e o regresso sao voo a serio: contam
 * para a bateria e passam por cima de alguma coisa.
 *
 * O regresso so se desenha quando a rota o tem. Com `autoLand` a aeronave pousa
 * onde acaba, e com `noAction` fica a pairar: desenhar uma perna de volta era
 * mostrar um voo que nao vai acontecer.
 */
export function trajectoCasaGeoJSON(
  rota: Pick<Rota, 'pontoDescolagem' | 'waypoints' | 'acaoFinal'>,
): FeatureCollection {
  const casa: LatLon = { lat: rota.pontoDescolagem.lat, lon: rota.pontoDescolagem.lon }
  const features: Feature[] = [
    {
      type: 'Feature',
      properties: { papel: 'casa' },
      geometry: { type: 'Point', coordinates: coordenada(casa) },
    },
  ]

  const primeiro = rota.waypoints[0]
  if (!primeiro) return { type: 'FeatureCollection', features }
  features.push(linha(casa, primeiro, { papel: 'saida' }))

  // Com um waypoint so, a volta e a ida ao contrario e o tracejado ficava a
  // dobrar sobre si proprio.
  const ultimo = rota.waypoints.at(-1)
  if (!ultimo || rota.waypoints.length < 2) return { type: 'FeatureCollection', features }

  if (rota.acaoFinal === 'goHome') features.push(linha(ultimo, casa, { papel: 'regresso' }))
  if (rota.acaoFinal === 'gotoFirstWaypoint') {
    features.push(linha(ultimo, primeiro, { papel: 'regresso' }))
  }

  return { type: 'FeatureCollection', features }
}

/** Os limites das parcelas importadas, como poligonos fechados. */
export function areasGeoJSON(areas: readonly Area[] | undefined): FeatureCollection {
  const features: Feature[] = []

  for (const area of areas ?? []) {
    const anel = contornoFechado(area.contorno)
    if (anel.length === 0) continue

    features.push({
      type: 'Feature',
      // O tipo vai nas propriedades: e por ele que o mapa decide a cor.
      properties: { id: area.id, nome: area.nome, interdita: area.tipo === 'exclusao' },
      geometry: { type: 'Polygon', coordinates: [anel.map(coordenada)] },
    })
  }

  return { type: 'FeatureCollection', features }
}

/**
 * A regua desenhada: a linha quebrada, os vertices, e o poligono fechado a
 * partir de tres pontos.
 *
 * O poligono desenha-se fechado mas a linha nao, porque o que se esta a medir e
 * o caminho que se marcou; fechar a linha daria a entender que ha ali um lado
 * que ainda nao se marcou.
 */
export function medicaoGeoJSON(pontos: readonly LatLon[]): FeatureCollection {
  const features: Feature[] = pontos.map((p) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: coordenada(p) },
  }))

  if (pontos.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pontos.map(coordenada) },
    })
  }

  if (pontos.length >= 3) {
    const anel = pontos.map(coordenada)
    const primeiro = anel[0]
    if (primeiro) anel.push(primeiro)
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [anel] },
    })
  }

  return { type: 'FeatureCollection', features }
}

/**
 * O que a camara apanha, no chao.
 *
 * So o poligono dos quatro cantos. Havia tambem raios da aeronave a cada canto
 * e ao centro, e existiam por uma razao que deixou de valer: antes de haver
 * piramide em 3D, eram eles que diziam de onde a camara estava a olhar. Agora
 * dizem-no pior - rastejam pelo terreno, esticam-se com a distancia visada, e
 * com o gimbal quase na horizontal atravessavam o mapa de lado a lado.
 *
 * `completo` diz se os quatro cantos chegaram mesmo ao chao. Quando nao
 * chegaram, o poligono nao e o que a foto cobre - e para onde ela olha, com a
 * parte de cima a sair pelo horizonte - e o mapa desenha-o mais fraco para nao
 * se ler como uma medicao.
 */
export function enquadramentoGeoJSON(
  pontas: readonly PontaDoEnquadramento[],
): FeatureCollection {
  if (pontas.length < 3) return VAZIO

  const anel = pontas.map((p) => coordenada(p))
  const primeiro = anel[0]
  if (primeiro) anel.push(primeiro)

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { completo: pontas.every((p) => p.noTerreno) },
        geometry: { type: 'Polygon', coordinates: [anel] },
      },
    ],
  }
}
