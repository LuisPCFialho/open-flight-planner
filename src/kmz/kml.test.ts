import { describe, it, expect } from 'vitest'
import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { acrescentarPOI, poiNovo } from '../nucleo/operacoes-poi.ts'
import { exportarKML, importarKML } from './kml.ts'
import { lerXML, textoEm, filho } from './parse-xml.ts'

const chave = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 355.9 }

function rotaDeTeste(modo: Rota['modoAltitude'] = 'ALT'): Rota {
  let rota = rotaVazia({
    nome: 'Sever do Vouga',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, modoAltitude: modo }
  rota = acrescentarPOI(rota, poiNovo({ nome: 'Poste 12', lat: 40.749, lon: -8.408, altura: 40 }))

  for (let i = 0; i < 3; i++) {
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ lat: 40.75 + i * 0.001, lon: -8.41, altura: 60, index: i }),
    )
  }
  return rota
}

describe('exportacao para o Google Earth', () => {
  it('escreve um waypoint por marcador e o percurso como linha', () => {
    const raiz = lerXML(exportarKML(rotaDeTeste()))
    const documento = filho(raiz, 'Document')
    const marcadores = documento?.filhos.filter((f) => f.nome === 'Placemark') ?? []

    // Tres waypoints, um percurso e um POI.
    expect(marcadores).toHaveLength(5)
    expect(textoEm(documento, 'name')).toBe('Sever do Vouga')

    const percurso = marcadores.find((m) => filho(m, 'LineString'))
    expect(textoEm(percurso, 'name')).toContain('percurso')
  })

  it('escreve as alturas em elipsoidal, como o Google Earth espera', () => {
    const raiz = lerXML(exportarKML(rotaDeTeste()))
    const marcador = filho(raiz, 'Document')?.filhos.find(
      (f) => f.nome === 'Placemark' && filho(f, 'Point'),
    )

    expect(textoEm(marcador, 'Point/altitudeMode')).toBe('absolute')
    const [, , altura] = (textoEm(marcador, 'Point/coordinates') ?? '').split(',').map(Number)

    // 60 m acima de uma descolagem a 355,9 dao 415,9 ortometricos,
    // mais 55,6 de ondulacao dao 471,5 elipsoidais.
    expect(altura).toBeCloseTo(471.5, 1)
  })

  it('escreve a longitude antes da latitude, que e a ordem do KML', () => {
    const raiz = lerXML(exportarKML(rotaDeTeste()))
    const marcador = filho(raiz, 'Document')?.filhos.find(
      (f) => f.nome === 'Placemark' && filho(f, 'Point'),
    )
    const [lon, lat] = (textoEm(marcador, 'Point/coordinates') ?? '').split(',').map(Number)

    expect(lon).toBeCloseTo(-8.41, 6)
    expect(lat).toBeCloseTo(40.75, 6)
  })

  it('usa as cotas do terreno quando a rota esta em AGL', () => {
    const rota = rotaDeTeste('AGL')
    const cotas = new Map<string, number>()
    for (const w of rota.waypoints) cotas.set(chave(w), 400)
    for (const p of rota.pois) cotas.set(chave(p), 400)

    const raiz = lerXML(exportarKML(rota, { cotas, chave }))
    const marcador = filho(raiz, 'Document')?.filhos.find(
      (f) => f.nome === 'Placemark' && filho(f, 'Point'),
    )
    const [, , altura] = (textoEm(marcador, 'Point/coordinates') ?? '').split(',').map(Number)

    // 60 m acima de terreno a 400 sao 460 ortometricos, mais 55,6 de ondulacao.
    expect(altura).toBeCloseTo(515.6, 1)
  })

  it('nao escreve percurso numa rota de um so ponto', () => {
    let rota = rotaVazia({
      nome: 'so um',
      projetoId: 'p1',
      droneId: 'mini5pro',
      pontoDescolagem: DESCOLAGEM,
    })
    rota = acrescentarWaypoint(rota, waypointNovo({ lat: 40.75, lon: -8.41, altura: 60, index: 0 }))

    const raiz = lerXML(exportarKML(rota))
    const linhas = filho(raiz, 'Document')?.filhos.filter((f) => filho(f, 'LineString')) ?? []
    expect(linhas).toHaveLength(0)
  })
})

describe('leitura de KML', () => {
  it('le de volta o que escreveu', () => {
    const lido = importarKML(exportarKML(rotaDeTeste()))

    expect(lido.nome).toBe('Sever do Vouga')
    // Tres waypoints e um POI.
    expect(lido.pontos).toHaveLength(4)
    expect(lido.linhas).toHaveLength(1)
    expect(lido.linhas[0]?.pontos).toHaveLength(3)
    expect(lido.pontos[0]?.lat).toBeCloseTo(40.75, 6)
  })

  it('desce por dentro das pastas, que e onde o Google Earth costuma por tudo', () => {
    const kml = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Levantamento</name>
  <Folder><name>Marcacoes</name>
    <Folder><name>Vertices</name>
      <Placemark><name>V1</name><Point><coordinates>-8.41,40.75,300</coordinates></Point></Placemark>
    </Folder>
    <Placemark><name>Alinhamento</name>
      <LineString><coordinates>-8.41,40.75,300 -8.40,40.76,310</coordinates></LineString>
    </Placemark>
  </Folder>
</Document></kml>`

    const lido = importarKML(kml)
    expect(lido.nome).toBe('Levantamento')
    expect(lido.pontos.map((p) => p.nome)).toEqual(['V1'])
    expect(lido.linhas[0]?.nome).toBe('Alinhamento')
    expect(lido.linhas[0]?.pontos).toHaveLength(2)
  })

  it('aceita coordenadas sem altura e separadas por mudancas de linha', () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Limite</name><LinearRing><coordinates>
    -8.41,40.75
    -8.40,40.75
    -8.40,40.76
  </coordinates></LinearRing></Placemark>
</Document></kml>`

    const lido = importarKML(kml)
    expect(lido.linhas[0]?.pontos).toHaveLength(3)
    expect(lido.linhas[0]?.pontos[0]?.altura).toBeNull()
    expect(lido.linhas[0]?.pontos[1]?.lon).toBeCloseTo(-8.4, 6)
  })

  it('ignora coordenadas ilegiveis em vez de rebentar', () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>X</name><LineString><coordinates>-8.41,40.75 nao,e,numero -8.40,40.76</coordinates></LineString></Placemark>
</Document></kml>`

    expect(importarKML(kml).linhas[0]?.pontos).toHaveLength(2)
  })
})
