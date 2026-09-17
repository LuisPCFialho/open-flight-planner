import type { Feature, FeatureCollection } from 'geojson'
import type { Area, LatLon, Rota } from '../nucleo/tipos.ts'
import { contornoFechado } from '../nucleo/areas.ts'
import type { Enquadramento } from '../nucleo/camara.ts'

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
      properties: { id: area.id, nome: area.nome },
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
 * O que a camara apanha, projectado no terreno.
 *
 * E o poligono dos cantos mais os raios que vao da aeronave a cada canto e ao
 * centro. Os raios sao o que deixa perceber de onde a camara esta a olhar -
 * so com o poligono nao se distingue uma vista de cima de uma vista rasante.
 *
 * Com menos de tres cantos nao ha poligono nenhum: acontece quando os raios
 * saem do terreno carregado, e nesse caso vale mais nao desenhar nada do que
 * desenhar um triangulo que nao quer dizer nada.
 */
export function enquadramentoGeoJSON(
  // So os cantos e o centro interessam aqui; o resto do enquadramento e numeros
  // que vao para a leitura no ecra, e pedi-los obrigava os testes a inventa-los.
  enquadramento: Pick<Enquadramento, 'cantos' | 'centro'> | null | undefined,
  aeronave: LatLon | null,
): FeatureCollection {
  if (!enquadramento) return VAZIO

  const cantos = enquadramento.cantos.filter((c) => c !== null)
  if (cantos.length < 3) return VAZIO

  const anel = cantos.map((c) => coordenada(c.ponto))
  const primeiro = anel[0]
  if (primeiro) anel.push(primeiro)

  const features: Feature[] = [
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } },
  ]

  if (aeronave) {
    for (const canto of cantos) features.push(linha(aeronave, canto.ponto))
    if (enquadramento.centro) features.push(linha(aeronave, enquadramento.centro.ponto))
  }

  return { type: 'FeatureCollection', features }
}
