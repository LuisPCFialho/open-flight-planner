import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { paraASL } from '../nucleo/geodesia.ts'
import { no, numero, serializar, valor, type No } from './xml.ts'
import { filhos, lerXML, textoEm, type NoLido } from './parse-xml.ts'

/**
 * KML simples, de pontos e linhas, para trocar com o Google Earth.
 *
 * Nao e o KML da DJI e nao tenta se-lo: nao leva accoes, gimbal nem velocidades.
 * Serve para mostrar um percurso a alguem que so tem o Google Earth, e para
 * trazer de la um alinhamento ou uma marcacao de campo.
 *
 * As alturas vao em `absolute`, que no Google Earth quer dizer acima do
 * elipsoide. Como as nossas sao ortometricas, soma-se a ondulacao do geoide,
 * sem o que o percurso apareceria 55,6 m abaixo do sitio em Portugal.
 */

const NS_KML = 'http://www.opengis.net/kml/2.2'

export type PontoKML = { nome: string; lat: number; lon: number; altura: number | null }
export type LinhaKML = { nome: string; pontos: { lat: number; lon: number; altura: number | null }[] }
export type ConteudoKML = { nome: string; pontos: PontoKML[]; linhas: LinhaKML[] }

export type OpcoesKML = {
  cotas?: ReadonlyMap<string, number>
  chave?: (ponto: LatLon) => string
}

export function exportarKML(rota: Rota, opcoes: OpcoesKML = {}): string {
  const cotaDescolagem = rota.pontoDescolagem.cotaTerreno

  const alturaElipsoidal = (ponto: { lat: number; lon: number; altura: number }): number => {
    const cota =
      opcoes.chave && opcoes.cotas ? opcoes.cotas.get(opcoes.chave(ponto)) : undefined
    const asl = paraASL(ponto.altura, rota.modoAltitude, {
      cotaDescolagem,
      cotaTerreno: cota ?? cotaDescolagem,
    })
    return asl + rota.ondulacaoGeoide
  }

  const marcadores: No[] = rota.waypoints.map((waypoint) =>
    no('Placemark', [
      valor('name', String(waypoint.index + 1)),
      valor('styleUrl', '#waypoint'),
      no('Point', [
        valor('altitudeMode', 'absolute'),
        valor(
          'coordinates',
          `${numero(waypoint.lon, 9)},${numero(waypoint.lat, 9)},${numero(alturaElipsoidal(waypoint), 2)}`,
        ),
      ]),
    ]),
  )

  const pontosDaLinha = rota.waypoints
    .map((w) => `${numero(w.lon, 9)},${numero(w.lat, 9)},${numero(alturaElipsoidal(w), 2)}`)
    .join(' ')

  const percurso =
    rota.waypoints.length > 1
      ? [
          no('Placemark', [
            valor('name', `${rota.nome} (percurso)`),
            valor('styleUrl', '#percurso'),
            no('LineString', [
              valor('altitudeMode', 'absolute'),
              valor('extrude', 1),
              valor('tessellate', 1),
              valor('coordinates', pontosDaLinha),
            ]),
          ]),
        ]
      : []

  const pois: No[] = rota.pois.map((poi) =>
    no('Placemark', [
      valor('name', poi.nome),
      valor('styleUrl', '#poi'),
      no('Point', [
        valor('altitudeMode', 'absolute'),
        valor(
          'coordinates',
          `${numero(poi.lon, 9)},${numero(poi.lat, 9)},${numero(alturaElipsoidal(poi), 2)}`,
        ),
      ]),
    ]),
  )

  const documento = no('Document', [
    valor('name', rota.nome),
    estilo('waypoint', 'ff4fd97f'),
    estilo('percurso', 'ff4fd97f'),
    estilo('poi', 'ff2994f0'),
    ...percurso,
    ...marcadores,
    ...pois,
  ])

  return serializar(no('kml', [documento], { xmlns: NS_KML }))
}

/** Cor em `aabbggrr`, que e a ordem que o KML usa. */
function estilo(id: string, cor: string): No {
  return no(
    'Style',
    [
      no('LineStyle', [valor('color', cor), valor('width', 2)]),
      no('IconStyle', [valor('color', cor), valor('scale', 0.8)]),
    ],
    { id },
  )
}

// --- leitura -----------------------------------------------------------------

/**
 * Le pontos e linhas de um KML, descendo por quantas pastas existirem.
 *
 * O Google Earth aninha `Folder` a vontade, e um alinhamento entregue por um
 * topografo vem quase sempre dentro de uma delas.
 */
export function importarKML(fonte: string): ConteudoKML {
  const raiz = lerXML(fonte)
  const documento = raiz.filhos.find((f) => f.nome === 'Document') ?? raiz

  const pontos: PontoKML[] = []
  const linhas: LinhaKML[] = []

  const percorrer = (elemento: NoLido): void => {
    for (const placemark of filhos(elemento, 'Placemark')) {
      const nome = textoEm(placemark, 'name') ?? 'sem nome'

      const ponto = placemark.filhos.find((f) => f.nome === 'Point')
      if (ponto) {
        const [primeiro] = lerCoordenadas(ponto.filhos.find((f) => f.nome === 'coordinates')?.texto)
        if (primeiro) pontos.push({ nome, ...primeiro })
      }

      for (const tipo of ['LineString', 'LinearRing']) {
        const linha = placemark.filhos.find((f) => f.nome === tipo)
        if (!linha) continue
        const lidos = lerCoordenadas(linha.filhos.find((f) => f.nome === 'coordinates')?.texto)
        if (lidos.length > 1) linhas.push({ nome, pontos: lidos })
      }
    }

    for (const pasta of [...filhos(elemento, 'Folder'), ...filhos(elemento, 'Document')]) {
      percorrer(pasta)
    }
  }

  percorrer(documento)
  return { nome: textoEm(documento, 'name') ?? 'KML importado', pontos, linhas }
}

/** `lon,lat[,alt]` separados por espacos ou mudancas de linha. */
function lerCoordenadas(texto: string | undefined): { lat: number; lon: number; altura: number | null }[] {
  if (!texto) return []

  const lidos: { lat: number; lon: number; altura: number | null }[] = []
  for (const grupo of texto.trim().split(/\s+/)) {
    const [lon, lat, alt] = grupo.split(',').map((p) => Number.parseFloat(p))
    if (lon === undefined || lat === undefined) continue
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    lidos.push({ lat, lon, altura: alt !== undefined && Number.isFinite(alt) ? alt : null })
  }
  return lidos
}
