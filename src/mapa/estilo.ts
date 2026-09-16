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
export const CAMADA_SOMBREADO = 'sombreado'

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
    /*
     * Ceu.
     *
     * Sem isto, acima do horizonte nao se desenha nada e a tela fica
     * transparente: na vista da camara em ecra inteiro via-se o mapa que esta
     * por tras, atravessado pela linha do horizonte. Com o terreno em 3D o
     * horizonte aparece sempre que a vista se inclina, portanto isto faz falta
     * aos dois mapas.
     */
    sky: {
      'sky-color': '#4a7cb0',
      'horizon-color': '#b9cddd',
      'fog-color': '#c3d2df',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.55,
      'fog-ground-blend': 0.05,
      'atmosphere-blend': 0.85,
    },
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': '#0b0e11' } },
      { id: 'ortofoto', type: 'raster', source: 'ortofoto' },
      /*
       * Sombreado do relevo por cima da ortofoto.
       *
       * A ortofoto de uma encosta de mato e um tapete verde sem forma: o vale e
       * o cabeco leem-se igual, e e justamente a forma do terreno que decide
       * onde a rota passa. O sombreado devolve-a, e em 2D e a unica maneira de a
       * ver. Sai da mesma fonte de elevacao que ja ali esta, portanto nao custa
       * mosaicos nenhuns.
       *
       * A opacidade e baixa: isto e para dar relevo a ortofoto, nao para a
       * substituir por um mapa cinzento.
       */
      {
        id: CAMADA_SOMBREADO,
        type: 'hillshade',
        source: FONTE_TERRENO,
        paint: {
          'hillshade-exaggeration': 0.45,
          'hillshade-shadow-color': '#0a0f16',
          'hillshade-highlight-color': '#f2f6fb',
          'hillshade-accent-color': '#1b2a3a',
        },
      },
    ],
  }
}
