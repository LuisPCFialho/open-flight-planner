import type { StyleSpecification } from 'maplibre-gl'

/**
 * Ortofoto do Esri World Imagery.
 *
 * Nota: o servidor e `server.arcgisonline.com`. A forma `server.arcgis.com`
 * responde 301 e os mosaicos nunca chegam a carregar.
 */
export const URL_ORTOFOTO =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Mosaicos de elevacao Terrarium da AWS, os mesmos que alimentam o amostrador de cotas. */
export const URL_TERRENO = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

export const FONTE_TERRENO = 'terreno'

export function estiloBase(): StyleSpecification {
  return {
    version: 8,
    // Sem glifos nem sprites: nao ha rotulos de mapa, so ortofoto e o que desenhamos.
    sources: {
      ortofoto: {
        type: 'raster',
        tiles: [URL_ORTOFOTO],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      },
      [FONTE_TERRENO]: {
        type: 'raster-dem',
        tiles: [URL_TERRENO],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
        attribution: 'Terrain tiles, AWS Open Data',
      },
    },
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': '#0b0e11' } },
      { id: 'ortofoto', type: 'raster', source: 'ortofoto' },
    ],
  }
}
