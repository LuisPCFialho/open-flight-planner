import { useEffect, useRef } from 'react'
import {
  Map as MapaLibre,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
} from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { estiloBase, FONTE_TERRENO } from './estilo.ts'
import { CamadaRota3D, type PontoRota3D } from './camada-rota-3d.ts'

const FONTE_SEGMENTOS = 'rota-segmentos'
const CAMADA_SEGMENTOS = 'rota-terreno'

export type CursorTerreno = { lat: number; lon: number; cotaTerreno: number | null }

export type PropsMapa = {
  rota: Rota
  /** Pontos ja com as cotas resolvidas. Um waypoint sem cota nao e desenhado em 3D. */
  pontos3D: readonly PontoRota3D[]
  seleccionados: ReadonlySet<string>
  modo3D: boolean
  /** Enquanto activo, clicar no mapa cria um ponto de interesse em vez de um waypoint. */
  modoPOI: boolean
  centroInicial: LatLon
  aoAdicionarWaypoint: (lat: number, lon: number) => void
  aoInserirWaypoint: (posicao: number, lat: number, lon: number) => void
  /** `definitivo` distingue o arrastar continuo do largar, para o historico. */
  aoMoverWaypoint: (id: string, lat: number, lon: number, definitivo: boolean) => void
  aoSeleccionar: (id: string, juntar: boolean) => void
  aoMoverCursor: (cursor: CursorTerreno | null) => void
  aoRemoverPOI: (id: string) => void
  aoErro: (mensagem: string) => void
}

export function Mapa(props: PropsMapa) {
  const contentor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaLibre | null>(null)
  const camada3D = useRef<CamadaRota3D | null>(null)
  const marcadores = useRef(new Map<string, Marker>())
  const marcadoresPOI = useRef(new Map<string, Marker>())
  const pronto = useRef(false)

  /** As funcoes mudam a cada render; os handlers do MapLibre registam-se uma vez. */
  const callbacks = useRef(props)
  callbacks.current = props

  // --- criacao do mapa, uma unica vez ---------------------------------------
  useEffect(() => {
    if (!contentor.current) return

    /*
     * O estilo e aplicado depois de o mapa existir, e nao passado ao construtor.
     * Quando vai no construtor, qualquer rejeicao do estilo acontece antes de
     * haver a quem entregar o erro: o mapa fica mudo, sem camadas e sem eventos,
     * com um unico fotograma desenhado no canvas e nada que o explique.
     */
    const instancia = new MapaLibre({
      container: contentor.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [props.centroInicial.lon, props.centroInicial.lat],
      zoom: 15,
      maxPitch: 85,
      attributionControl: { compact: true },
    })
    mapa.current = instancia

    instancia.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')
    instancia.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    // Um mosaico que nao chega tem de ser visivel, nao pode dar um mapa preto sem explicacao.
    instancia.on('error', (evento) => {
      callbacks.current.aoErro(evento.error?.message ?? 'falha no mapa')
    })

    instancia.setStyle(estiloBase())

    if (import.meta.env.DEV) {
      Object.assign(window, { __mapa: instancia, __camada3D: () => camada3D.current })
    }

    instancia.on('load', () => {
      instancia.addSource(FONTE_SEGMENTOS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: CAMADA_SEGMENTOS,
        type: 'line',
        source: FONTE_SEGMENTOS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4aa3ff',
          'line-width': 2,
          'line-opacity': 0.85,
        },
      })

      const camada = new CamadaRota3D()
      camada3D.current = camada
      instancia.addLayer(camada)

      pronto.current = true
      desenhar(instancia, camada, marcadores.current, marcadoresPOI.current, callbacks.current, callbacks)
    })

    // Clique em vazio acrescenta um waypoint no fim.
    instancia.on('click', (evento) => {
      const alvos = instancia.queryRenderedFeatures(evento.point, { layers: [CAMADA_SEGMENTOS] })
      const original = evento.originalEvent

      if (alvos.length > 0 && original.altKey) {
        const indice = alvos[0]?.properties?.['indice']
        if (typeof indice === 'number') {
          callbacks.current.aoInserirWaypoint(indice + 1, evento.lngLat.lat, evento.lngLat.lng)
          return
        }
      }
      if (original.altKey) return

      callbacks.current.aoAdicionarWaypoint(evento.lngLat.lat, evento.lngLat.lng)
    })

    instancia.on('mousemove', (evento) => {
      const { lat, lng } = evento.lngLat
      const cota = instancia.queryTerrainElevation(evento.lngLat)
      callbacks.current.aoMoverCursor({ lat, lon: lng, cotaTerreno: cota ?? null })
    })
    instancia.on('mouseout', () => callbacks.current.aoMoverCursor(null))

    // Cursor de insercao quando se passa sobre um troco com alt carregado.
    instancia.on('mouseenter', CAMADA_SEGMENTOS, () => {
      instancia.getCanvas().style.cursor = 'copy'
    })
    instancia.on('mouseleave', CAMADA_SEGMENTOS, () => {
      instancia.getCanvas().style.cursor = ''
    })

    return () => {
      pronto.current = false
      for (const marcador of marcadores.current.values()) marcador.remove()
      marcadores.current.clear()
      for (const marcador of marcadoresPOI.current.values()) marcador.remove()
      marcadoresPOI.current.clear()
      camada3D.current = null
      instancia.remove()
      mapa.current = null
    }
    // Criado uma vez. O centro inicial so conta no arranque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- terreno e inclinacao, ao alternar 2D e 3D ----------------------------
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto.current) return

    if (props.modo3D) {
      instancia.setTerrain({ source: FONTE_TERRENO, exaggeration: 1 })
      if (instancia.getPitch() < 30) instancia.easeTo({ pitch: 62, duration: 600 })
    } else {
      instancia.setTerrain(null)
      instancia.easeTo({ pitch: 0, bearing: 0, duration: 600 })
    }
  }, [props.modo3D])

  // --- redesenho quando a rota muda -----------------------------------------
  useEffect(() => {
    const instancia = mapa.current
    const camada = camada3D.current
    if (!instancia || !camada || !pronto.current) return
    desenhar(instancia, camada, marcadores.current, marcadoresPOI.current, props, callbacks)
  })

  // O cursor diz de imediato que o proximo clique cria um POI, nao um waypoint.
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto.current) return
    instancia.getCanvas().style.cursor = props.modoPOI ? 'crosshair' : ''
  }, [props.modoPOI])

  return <div className="mapa" ref={contentor} />
}

// --- desenho -----------------------------------------------------------------

/**
 * Referencia sempre actualizada para as callbacks.
 *
 * Os handlers de um marcador sao registados uma unica vez, quando o marcador
 * nasce. Se fechassem sobre as funcoes desse render, a seleccao por intervalo
 * passaria a consultar uma rota antiga assim que a rota mudasse.
 */
type RefCallbacks = { current: PropsMapa }

function desenhar(
  instancia: MapaLibre,
  camada: CamadaRota3D,
  marcadores: Map<string, Marker>,
  marcadoresPOI: Map<string, Marker>,
  props: PropsMapa,
  callbacks: RefCallbacks,
): void {
  const fonte = instancia.getSource(FONTE_SEGMENTOS) as GeoJSONSource | undefined
  if (fonte) fonte.setData(segmentosGeoJSON(props.rota))

  camada.definirPontos(props.pontos3D)
  sincronizarMarcadores(instancia, marcadores, props, callbacks)
  sincronizarPOIs(instancia, marcadoresPOI, props, callbacks)
}

/**
 * Marcadores dos pontos de interesse. Sao losangos, para nao se confundirem com
 * os circulos numerados dos waypoints a um relance.
 */
function sincronizarPOIs(
  instancia: MapaLibre,
  marcadores: Map<string, Marker>,
  props: PropsMapa,
  callbacks: RefCallbacks,
): void {
  const vivos = new Set(props.rota.pois.map((p) => p.id))
  for (const [id, marcador] of marcadores) {
    if (!vivos.has(id)) {
      marcador.remove()
      marcadores.delete(id)
    }
  }

  for (const poi of props.rota.pois) {
    let marcador = marcadores.get(poi.id)

    if (!marcador) {
      const elemento = document.createElement('button')
      elemento.type = 'button'
      elemento.className = 'marcador-poi'
      elemento.addEventListener('click', (evento) => {
        evento.stopPropagation()
        if (evento.shiftKey) callbacks.current.aoRemoverPOI(poi.id)
      })

      marcador = new Marker({ element: elemento, draggable: false })
      marcador.setLngLat([poi.lon, poi.lat]).addTo(instancia)
      marcadores.set(poi.id, marcador)
    } else {
      const atual = marcador.getLngLat()
      if (atual.lat !== poi.lat || atual.lng !== poi.lon) {
        marcador.setLngLat([poi.lon, poi.lat])
      }
    }

    const elemento = marcador.getElement()
    elemento.title = `${poi.nome} — shift e clique para remover`
    elemento.setAttribute('aria-label', `Ponto de interesse ${poi.nome}`)
  }
}

/** Um troco por feature, para se saber onde inserir quando se alt+clica na linha. */
function segmentosGeoJSON(rota: Rota): FeatureCollection {
  const features: Feature[] = []
  for (let i = 1; i < rota.waypoints.length; i++) {
    const de = rota.waypoints[i - 1]
    const para = rota.waypoints[i]
    if (!de || !para) continue
    features.push({
      type: 'Feature',
      properties: { indice: i - 1 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [de.lon, de.lat],
          [para.lon, para.lat],
        ],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

function sincronizarMarcadores(
  instancia: MapaLibre,
  marcadores: Map<string, Marker>,
  props: PropsMapa,
  callbacks: RefCallbacks,
): void {
  const vivos = new Set(props.rota.waypoints.map((w) => w.id))
  for (const [id, marcador] of marcadores) {
    if (!vivos.has(id)) {
      marcador.remove()
      marcadores.delete(id)
    }
  }

  for (const waypoint of props.rota.waypoints) {
    const seleccionado = props.seleccionados.has(waypoint.id)
    let marcador = marcadores.get(waypoint.id)

    if (!marcador) {
      const elemento = document.createElement('button')
      elemento.type = 'button'
      elemento.className = 'marcador-waypoint'

      elemento.addEventListener('click', (evento) => {
        evento.stopPropagation()
        callbacks.current.aoSeleccionar(
          waypoint.id,
          evento.shiftKey || evento.ctrlKey || evento.metaKey,
        )
      })

      marcador = new Marker({ element: elemento, draggable: true })
      marcador.setLngLat([waypoint.lon, waypoint.lat]).addTo(instancia)

      const novo = marcador
      novo.on('drag', () => {
        const pos = novo.getLngLat()
        callbacks.current.aoMoverWaypoint(waypoint.id, pos.lat, pos.lng, false)
      })
      novo.on('dragend', () => {
        const pos = novo.getLngLat()
        callbacks.current.aoMoverWaypoint(waypoint.id, pos.lat, pos.lng, true)
      })

      marcadores.set(waypoint.id, marcador)
    } else {
      const atual = marcador.getLngLat()
      if (atual.lat !== waypoint.lat || atual.lng !== waypoint.lon) {
        marcador.setLngLat([waypoint.lon, waypoint.lat])
      }
    }

    const elemento = marcador.getElement()
    elemento.textContent = String(waypoint.index + 1)
    elemento.classList.toggle('seleccionado', seleccionado)
    elemento.setAttribute('aria-label', `Waypoint ${waypoint.index + 1}`)
  }
}
