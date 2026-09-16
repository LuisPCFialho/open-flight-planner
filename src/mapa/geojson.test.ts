import { describe, it, expect } from 'vitest'
import type { Feature, LineString, Polygon } from 'geojson'
import type { Area, Rota } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { areasGeoJSON, enquadramentoGeoJSON, medicaoGeoJSON, segmentosGeoJSON } from './geojson.ts'

/**
 * O GeoJSON que o mapa desenha. O que se verifica aqui nao e o aspecto: e a
 * ordem das coordenadas - o GeoJSON escreve longitude primeiro, ao contrario de
 * toda a gente - e quais os poligonos que se fecham e quais nao.
 */

const CANTO = { lat: 40.746552, lon: -8.41061 }

function rota(quantos: number): Rota {
  let r = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: { ...CANTO, cotaTerreno: 356 },
  })

  let ponto = { ...CANTO }
  for (let i = 0; i < quantos; i++) {
    r = acrescentarWaypoint(r, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, 100)
  }
  return r
}

const geometria = <T>(f: Feature | undefined): T => f?.geometry as T

describe('trocos da rota', () => {
  it('um waypoint sozinho nao da troco nenhum', () => {
    expect(segmentosGeoJSON(rota(1).waypoints).features).toHaveLength(0)
  })

  it('n waypoints dao n-1 trocos', () => {
    expect(segmentosGeoJSON(rota(5).waypoints).features).toHaveLength(4)
  })

  it('cada troco leva o seu indice', () => {
    /*
     * E o indice que permite inserir um ponto no meio de um troco, com Alt e
     * clique, sabendo em qual se carregou.
     */
    const features = segmentosGeoJSON(rota(4).waypoints).features
    expect(features.map((f) => f.properties?.['indice'])).toEqual([0, 1, 2])
  })

  it('as coordenadas sao longitude primeiro', () => {
    // O GeoJSON escreve [lon, lat], ao contrario de toda a gente.
    const r = rota(2)
    const linha = geometria<LineString>(segmentosGeoJSON(r.waypoints).features[0])
    expect(linha.coordinates[0]).toEqual([r.waypoints[0]?.lon, r.waypoints[0]?.lat])
  })

  it('uma rota vazia da uma coleccao vazia, e nao um erro', () => {
    expect(segmentosGeoJSON([])).toEqual({ type: 'FeatureCollection', features: [] })
  })
})

describe('areas de referencia', () => {
  const quadrado: Area = {
    id: 'a1',
    nome: 'Parcela',
    contorno: [
      CANTO,
      deslocar(CANTO, 90, 100),
      deslocar(deslocar(CANTO, 90, 100), 0, 100),
      deslocar(CANTO, 0, 100),
    ],
  }

  it('sem areas nao ha nada a desenhar', () => {
    expect(areasGeoJSON(undefined).features).toHaveLength(0)
    expect(areasGeoJSON([]).features).toHaveLength(0)
  })

  it('o anel fecha-se, repetindo o primeiro ponto no fim', () => {
    // Um poligono GeoJSON que nao fecha e invalido, e o MapLibre nao o desenha.
    const anel = geometria<Polygon>(areasGeoJSON([quadrado]).features[0]).coordinates[0]
    expect(anel).toBeDefined()
    expect(anel?.at(0)).toEqual(anel?.at(-1))
    expect(anel).toHaveLength(5)
  })

  it('o nome e o identificador viajam nas propriedades', () => {
    const f = areasGeoJSON([quadrado]).features[0]
    expect(f?.properties).toEqual({ id: 'a1', nome: 'Parcela' })
  })

  it('uma area sem contorno nao entra', () => {
    const vazia: Area = { id: 'a2', nome: 'sem nada', contorno: [] }
    expect(areasGeoJSON([quadrado, vazia]).features).toHaveLength(1)
  })
})

describe('regua', () => {
  const pontos = [CANTO, deslocar(CANTO, 90, 100), deslocar(CANTO, 0, 100)]

  it('um ponto so da um ponto', () => {
    const features = medicaoGeoJSON([CANTO]).features
    expect(features).toHaveLength(1)
    expect(features[0]?.geometry.type).toBe('Point')
  })

  it('dois pontos dao os pontos e a linha, sem poligono', () => {
    const tipos = medicaoGeoJSON(pontos.slice(0, 2)).features.map((f) => f.geometry.type)
    expect(tipos).toEqual(['Point', 'Point', 'LineString'])
  })

  it('tres pontos ja dao area', () => {
    const tipos = medicaoGeoJSON(pontos).features.map((f) => f.geometry.type)
    expect(tipos).toEqual(['Point', 'Point', 'Point', 'LineString', 'Polygon'])
  })

  it('o poligono fecha-se mas a linha nao', () => {
    /*
     * O que se esta a medir e o caminho que se marcou. Fechar a linha daria a
     * entender que ha ali um lado que ainda nao se marcou.
     */
    const features = medicaoGeoJSON(pontos).features
    const linha = geometria<LineString>(features.find((f) => f.geometry.type === 'LineString'))
    const poligono = geometria<Polygon>(features.find((f) => f.geometry.type === 'Polygon'))

    expect(linha.coordinates).toHaveLength(3)
    expect(linha.coordinates.at(0)).not.toEqual(linha.coordinates.at(-1))
    expect(poligono.coordinates[0]).toHaveLength(4)
    expect(poligono.coordinates[0]?.at(0)).toEqual(poligono.coordinates[0]?.at(-1))
  })

  it('sem pontos nao ha nada', () => {
    expect(medicaoGeoJSON([]).features).toHaveLength(0)
  })
})

describe('enquadramento da camara', () => {
  const canto = (lat: number, lon: number) => ({
    ponto: { lat, lon },
    cotaTerreno: 356,
    distancia: 100,
  })
  const cheio = {
    cantos: [canto(40.7, -8.4), canto(40.7, -8.39), canto(40.71, -8.39), canto(40.71, -8.4)],
    centro: canto(40.705, -8.395),
  }

  it('sem enquadramento nao ha nada', () => {
    expect(enquadramentoGeoJSON(null, CANTO).features).toHaveLength(0)
    expect(enquadramentoGeoJSON(undefined, CANTO).features).toHaveLength(0)
  })

  it('com menos de tres cantos tambem nao', () => {
    /*
     * Acontece quando os raios saem do terreno carregado. Vale mais nao
     * desenhar nada do que desenhar um triangulo que nao quer dizer nada.
     */
    const curto = { cantos: [canto(40.7, -8.4), canto(40.7, -8.39)], centro: null }
    expect(enquadramentoGeoJSON(curto, CANTO).features).toHaveLength(0)
  })

  it('um canto que o raio nao alcancou nao conta', () => {
    const comFalha = { cantos: [...cheio.cantos.slice(0, 2), null], centro: null }
    expect(enquadramentoGeoJSON(comFalha, CANTO).features).toHaveLength(0)
  })

  it('sem aeronave desenha-se so o poligono', () => {
    // E o que sobra quando nada esta seleccionado e nao ha voo a decorrer.
    const features = enquadramentoGeoJSON(cheio, null).features
    expect(features).toHaveLength(1)
    expect(features[0]?.geometry.type).toBe('Polygon')
  })

  it('com aeronave vem tambem um raio por canto e um para o centro', () => {
    /*
     * Os raios sao o que deixa perceber de onde a camara esta a olhar: so com o
     * poligono nao se distingue uma vista de cima de uma vista rasante.
     */
    const features = enquadramentoGeoJSON(cheio, CANTO).features
    expect(features).toHaveLength(1 + 4 + 1)
    expect(features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(5)
  })

  it('sem centro nao ha raio ao centro', () => {
    const semCentro = { ...cheio, centro: null }
    expect(enquadramentoGeoJSON(semCentro, CANTO).features).toHaveLength(1 + 4)
  })

  it('cada raio parte da aeronave', () => {
    const features = enquadramentoGeoJSON(cheio, CANTO).features
    for (const f of features.filter((x) => x.geometry.type === 'LineString')) {
      expect(geometria<LineString>(f).coordinates[0]).toEqual([CANTO.lon, CANTO.lat])
    }
  })

  it('o poligono do que a foto apanha fecha-se', () => {
    const anel = geometria<Polygon>(enquadramentoGeoJSON(cheio, null).features[0]).coordinates[0]
    expect(anel?.at(0)).toEqual(anel?.at(-1))
  })
})
