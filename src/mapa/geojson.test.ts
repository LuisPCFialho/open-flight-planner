import { describe, it, expect } from 'vitest'
import type { Feature, LineString, Polygon } from 'geojson'
import type { Area, Rota } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import {
  areasGeoJSON,
  enquadramentoGeoJSON,
  medicaoGeoJSON,
  segmentosGeoJSON,
  trajectoCasaGeoJSON,
} from './geojson.ts'

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
  const ponta = (lat: number, lon: number, noTerreno = true) => ({
    lat,
    lon,
    alt: 356,
    noTerreno,
  })
  const CENTRO = { lat: 40.705, lon: -8.395 }
  const cheio = [
    ponta(40.7, -8.4),
    ponta(40.7, -8.39),
    ponta(40.71, -8.39),
    ponta(40.71, -8.4),
  ]

  it('sem pontas nao ha nada', () => {
    expect(enquadramentoGeoJSON([], CENTRO, CANTO).features).toHaveLength(0)
  })

  it('com menos de tres pontas tambem nao: um segmento nao e uma mancha', () => {
    const curto = [ponta(40.7, -8.4), ponta(40.7, -8.39)]
    expect(enquadramentoGeoJSON(curto, CENTRO, CANTO).features).toHaveLength(0)
  })

  /*
   * O caso que fazia a mancha desaparecer. Com o gimbal a doze ou treze graus -
   * o que uma rota de inspeccao usa - os dois raios de cima passam acima do
   * horizonte e nunca cortam o chao. Antes isso apagava o poligono e deixava a
   * piramide: a mesma coisa via-se umas vezes sim, outras nao.
   */
  it('pontas projectadas desenham na mesma, marcadas como incompletas', () => {
    const comCeu = [
      ponta(40.7, -8.4, false),
      ponta(40.7, -8.39, false),
      ponta(40.71, -8.39),
      ponta(40.71, -8.4),
    ]
    const features = enquadramentoGeoJSON(comCeu, CENTRO, null).features
    expect(features).toHaveLength(1)
    expect(features[0]?.properties?.completo).toBe(false)
  })

  it('com os quatro cantos no terreno, o poligono conta-se como completo', () => {
    const features = enquadramentoGeoJSON(cheio, CENTRO, null).features
    expect(features[0]?.properties?.completo).toBe(true)
  })

  it('sem aeronave desenha-se so o poligono', () => {
    // E o que sobra quando nada esta seleccionado e nao ha voo a decorrer.
    const features = enquadramentoGeoJSON(cheio, CENTRO, null).features
    expect(features).toHaveLength(1)
    expect(features[0]?.geometry.type).toBe('Polygon')
  })

  it('com aeronave vem tambem um raio por canto e um para o centro', () => {
    /*
     * Os raios sao o que deixa perceber de onde a camara esta a olhar: so com o
     * poligono nao se distingue uma vista de cima de uma vista rasante.
     */
    const features = enquadramentoGeoJSON(cheio, CENTRO, CANTO).features
    expect(features).toHaveLength(1 + 4 + 1)
    expect(features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(5)
  })

  it('sem centro nao ha raio ao centro', () => {
    expect(enquadramentoGeoJSON(cheio, null, CANTO).features).toHaveLength(1 + 4)
  })

  it('cada raio parte da aeronave', () => {
    const features = enquadramentoGeoJSON(cheio, CENTRO, CANTO).features
    for (const f of features.filter((x) => x.geometry.type === 'LineString')) {
      expect(geometria<LineString>(f).coordinates[0]).toEqual([CANTO.lon, CANTO.lat])
    }
  })

  it('o poligono do que a foto apanha fecha-se', () => {
    const anel = geometria<Polygon>(
      enquadramentoGeoJSON(cheio, CENTRO, null).features[0],
    ).coordinates[0]
    expect(anel?.at(0)).toEqual(anel?.at(-1))
  })
})

describe('ponto de descolagem e pernas de transito', () => {
  const papeis = (r: Rota): string[] =>
    trajectoCasaGeoJSON(r).features.map((f) => String(f.properties?.papel))

  it('o sitio de onde se levanta aparece mesmo sem rota nenhuma', () => {
    expect(papeis(rota(0))).toEqual(['casa'])
  })

  it('a saida vai do ponto de descolagem ao primeiro waypoint', () => {
    const r = rota(3)
    const saida = trajectoCasaGeoJSON(r).features.find((f) => f.properties?.papel === 'saida')
    const linha = geometria<LineString>(saida)
    expect(linha.coordinates[0]).toEqual([r.pontoDescolagem.lon, r.pontoDescolagem.lat])
    expect(linha.coordinates[1]).toEqual([r.waypoints[0]?.lon, r.waypoints[0]?.lat])
  })

  it('com regresso a casa a ultima perna acaba no ponto de descolagem', () => {
    const r: Rota = { ...rota(3), acaoFinal: 'goHome' }
    const volta = trajectoCasaGeoJSON(r).features.find((f) => f.properties?.papel === 'regresso')
    const linha = geometria<LineString>(volta)
    expect(linha.coordinates[0]).toEqual([r.waypoints[2]?.lon, r.waypoints[2]?.lat])
    expect(linha.coordinates[1]).toEqual([r.pontoDescolagem.lon, r.pontoDescolagem.lat])
  })

  it('com regresso ao primeiro ponto a volta acaba la, e nao em casa', () => {
    const r: Rota = { ...rota(3), acaoFinal: 'gotoFirstWaypoint' }
    const volta = trajectoCasaGeoJSON(r).features.find((f) => f.properties?.papel === 'regresso')
    expect(geometria<LineString>(volta).coordinates[1]).toEqual([
      r.waypoints[0]?.lon,
      r.waypoints[0]?.lat,
    ])
  })

  /*
   * Com `autoLand` a aeronave pousa onde acaba e com `noAction` fica a pairar.
   * Desenhar uma volta era mostrar um voo que nao vai acontecer.
   */
  it('quem nao volta nao leva perna de regresso', () => {
    expect(papeis({ ...rota(3), acaoFinal: 'autoLand' })).toEqual(['casa', 'saida'])
    expect(papeis({ ...rota(3), acaoFinal: 'noAction' })).toEqual(['casa', 'saida'])
  })

  it('com um waypoint so a volta seria a ida ao contrario, e nao se desenha', () => {
    expect(papeis({ ...rota(1), acaoFinal: 'goHome' })).toEqual(['casa', 'saida'])
  })
})
