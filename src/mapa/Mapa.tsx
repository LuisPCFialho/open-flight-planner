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
import { algumDentroDaVista, contornoFechado } from '../nucleo/areas.ts'
import { arrastoDeOrientacao, orientacaoAposArrasto } from './navegacao.ts'
import { estiloBase, FONTE_TERRENO } from './estilo.ts'
import { CamadaRota3D, type PontoRota3D } from './camada-rota-3d.ts'
import type { Enquadramento } from '../nucleo/camara.ts'

const FONTE_SEGMENTOS = 'rota-segmentos'
const CAMADA_SEGMENTOS = 'rota-terreno'
const FONTE_ENQUADRAMENTO = 'enquadramento'
const CAMADA_ENQUADRAMENTO_AREA = 'enquadramento-area'
const CAMADA_ENQUADRAMENTO_LINHA = 'enquadramento-linha'
/** Pixeis a partir dos quais se considera que houve arrasto e nao clique. */
const LIMITE_ARRASTO = 4

const FONTE_AREAS = 'areas-referencia'
const CAMADA_AREAS_PREENCHIMENTO = 'areas-preenchimento'
const CAMADA_AREAS_CONTORNO = 'areas-contorno'

export type CursorTerreno = { lat: number; lon: number; cotaTerreno: number | null }

export type PropsMapa = {
  rota: Rota
  /** Pontos ja com as cotas resolvidas. Um waypoint sem cota nao e desenhado em 3D. */
  pontos3D: readonly PontoRota3D[]
  seleccionados: ReadonlySet<string>
  modo3D: boolean
  /** Enquanto activo, clicar no mapa cria um ponto de interesse em vez de um waypoint. */
  modoPOI: boolean
  /** O que a camara do waypoint seleccionado vai apanhar, projectado no terreno. */
  enquadramento: Enquadramento | null
  /** Posicao da aeronave em voo virtual, para o mapa a seguir. */
  seguir: { posicao: LatLon; guinada: number } | null
  /**
   * Ponto para onde levar a vista.
   *
   * O `pedido` distingue dois pedidos seguidos para o mesmo ponto, que de outra
   * forma seriam indistinguiveis e o segundo nao faria nada.
   */
  centrarEm: {
    posicao: LatLon
    pedido: number
    /** Envolvente a enquadrar, quando o alvo e uma area e nao um ponto. */
    envolvente?: [[number, number], [number, number]]
  } | null
  centroInicial: LatLon
  aoAdicionarWaypoint: (lat: number, lon: number) => void
  aoInserirWaypoint: (posicao: number, lat: number, lon: number) => void
  /** `definitivo` distingue o arrastar continuo do largar, para o historico. */
  aoMoverWaypoint: (id: string, lat: number, lon: number, definitivo: boolean) => void
  aoSeleccionar: (id: string, juntar: boolean) => void
  aoMoverCursor: (cursor: CursorTerreno | null) => void
  aoRemoverPOI: (id: string) => void
  /** Apaga o waypoint, pelo mesmo caminho do botao da lista, para se poder desfazer. */
  aoEliminarWaypoint: (id: string) => void
  /** Avisa quando os waypoints saem ou voltam a entrar na janela visivel. */
  aoMudarVisibilidadeDaRota: (visivel: boolean) => void
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

    /*
     * Rato como no Google Earth.
     *
     * A caixa de zoom do Shift e um habito de mapas 2D que o Earth nao tem; la,
     * Shift e o botao do meio inclinam e rodam. O resto ja batia certo: esquerdo
     * desloca, roda aproxima sobre o cursor, direito e Ctrl rodam e inclinam.
     */
    instancia.boxZoom.disable()

    const tela = instancia.getCanvas()
    let arrasto: { x: number; y: number } | null = null

    const comecarArrasto = (evento: MouseEvent): void => {
      if (!arrastoDeOrientacao(evento)) return
      evento.preventDefault()
      arrasto = { x: evento.clientX, y: evento.clientY }
      // Sem isto o arrastar do mapa corre ao mesmo tempo e a vista foge.
      instancia.dragPan.disable()
    }

    const moverArrasto = (evento: MouseEvent): void => {
      if (!arrasto) return
      const orientacao = orientacaoAposArrasto(
        { rumo: instancia.getBearing(), inclinacao: instancia.getPitch() },
        evento.clientX - arrasto.x,
        evento.clientY - arrasto.y,
        { minima: instancia.getMinPitch(), maxima: instancia.getMaxPitch() },
      )
      arrasto = { x: evento.clientX, y: evento.clientY }
      instancia.setBearing(orientacao.rumo)
      instancia.setPitch(orientacao.inclinacao)
    }

    const largarArrasto = (): void => {
      if (!arrasto) return
      arrasto = null
      instancia.dragPan.enable()
    }

    tela.addEventListener('mousedown', comecarArrasto)
    window.addEventListener('mousemove', moverArrasto)
    window.addEventListener('mouseup', largarArrasto)
    // O botao do meio abre o deslocamento automatico do Windows se nao for travado.
    tela.addEventListener('auxclick', (evento) => {
      if (evento.button === 1) evento.preventDefault()
    })

    // Um mosaico que nao chega tem de ser visivel, nao pode dar um mapa preto sem explicacao.
    instancia.on('error', (evento) => {
      callbacks.current.aoErro(evento.error?.message ?? 'falha no mapa')
    })

    instancia.setStyle(estiloBase())

    if (import.meta.env.DEV) {
      /*
       * Acessores, e nao a instancia directa.
       *
       * Em modo estrito o React monta duas vezes, e guardar a instancia deixava
       * a referencia a apontar para um mapa ja destruido, que responde a tudo
       * com silencio. Passou horas a fazer parecer avariado o que estava bom.
       */
      Object.defineProperty(window, '__mapa', {
        configurable: true,
        get: () => mapa.current,
      })
      Object.assign(window, { __camada3D: () => camada3D.current })
    }

    instancia.on('load', () => {
      /*
       * As areas de referencia entram primeiro, e por isso ficam por baixo.
       *
       * Sao o rascunho do que ha para filmar: a rota desenha-se por cima delas,
       * e nao ao contrario. O preenchimento e fraco de proposito para nao
       * esconder a ortofoto, que e o que se esta a ler.
       */
      instancia.addSource(FONTE_AREAS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: CAMADA_AREAS_PREENCHIMENTO,
        type: 'fill',
        source: FONTE_AREAS,
        paint: { 'fill-color': '#4fd973', 'fill-opacity': 0.12 },
      })
      instancia.addLayer({
        id: CAMADA_AREAS_CONTORNO,
        type: 'line',
        source: FONTE_AREAS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4fd973',
          'line-width': 2,
          'line-opacity': 0.9,
          'line-dasharray': [3, 2],
        },
      })

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

      instancia.addSource(FONTE_ENQUADRAMENTO, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: CAMADA_ENQUADRAMENTO_AREA,
        type: 'fill',
        source: FONTE_ENQUADRAMENTO,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#f0b429', 'fill-opacity': 0.22 },
      })
      instancia.addLayer({
        id: CAMADA_ENQUADRAMENTO_LINHA,
        type: 'line',
        source: FONTE_ENQUADRAMENTO,
        paint: { 'line-color': '#f0b429', 'line-width': 1.2, 'line-opacity': 0.9 },
      })

      const camada = new CamadaRota3D()
      camada3D.current = camada
      instancia.addLayer(camada)

      pronto.current = true
      desenhar(instancia, camada, marcadores.current, marcadoresPOI.current, callbacks.current, callbacks)
    })

    /*
     * Distinguir o clique do arrasto.
     *
     * O browser dispara `click` depois de qualquer par de premir e largar sobre
     * o mesmo elemento, por mais que o rato tenha andado pelo meio. Resultado:
     * deslocar, rodar ou inclinar o mapa acabava a deixar um waypoint - ou um
     * POI, com o modo ligado - no sitio onde se largou o botao. Quem estava a
     * navegar ia semeando pontos sem dar por isso.
     */
    let inicioDoPremir: { x: number; y: number } | null = null
    let houveArrasto = false

    const aoPremirParaClique = (evento: MouseEvent): void => {
      inicioDoPremir = { x: evento.clientX, y: evento.clientY }
      houveArrasto = false
    }
    const aoMoverParaClique = (evento: MouseEvent): void => {
      if (!inicioDoPremir) return
      const andou = Math.hypot(evento.clientX - inicioDoPremir.x, evento.clientY - inicioDoPremir.y)
      if (andou > LIMITE_ARRASTO) houveArrasto = true
    }
    // O `houveArrasto` nao se limpa aqui: o `click` ainda vem a seguir e precisa
    // dele. Limpa-se no premir seguinte.
    const aoLargarParaClique = (): void => {
      inicioDoPremir = null
    }

    tela.addEventListener('mousedown', aoPremirParaClique)
    window.addEventListener('mousemove', aoMoverParaClique)
    window.addEventListener('mouseup', aoLargarParaClique)

    // Clique em vazio acrescenta um waypoint no fim.
    instancia.on('click', (evento) => {
      if (houveArrasto) return
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

    /*
     * Saber se a rota ainda esta no ecra.
     *
     * So se avisa quando o valor muda: isto corre a cada fotograma de
     * deslocamento, e mandar o mesmo valor a cada um punha a aplicacao inteira a
     * redesenhar sem motivo.
     */
    let rotaVisivel: boolean | null = null
    const verificarVisibilidade = (): void => {
      const waypoints = callbacks.current.rota.waypoints
      const limites = instancia.getBounds()
      const sudoeste = limites.getSouthWest()
      const nordeste = limites.getNorthEast()

      const visivel =
        waypoints.length === 0 ||
        algumDentroDaVista(waypoints, {
          sudoeste: { lat: sudoeste.lat, lon: sudoeste.lng },
          nordeste: { lat: nordeste.lat, lon: nordeste.lng },
        })

      if (visivel === rotaVisivel) return
      rotaVisivel = visivel
      callbacks.current.aoMudarVisibilidadeDaRota(visivel)
    }

    instancia.on('move', verificarVisibilidade)
    instancia.on('moveend', verificarVisibilidade)

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
      tela.removeEventListener('mousedown', comecarArrasto)
      window.removeEventListener('mousemove', moverArrasto)
      window.removeEventListener('mouseup', largarArrasto)
      tela.removeEventListener('mousedown', aoPremirParaClique)
      window.removeEventListener('mousemove', aoMoverParaClique)
      window.removeEventListener('mouseup', aoLargarParaClique)
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
    // Acrescentar ou apagar waypoints muda a resposta com o mapa parado.
    instancia.fire('moveend')
  })

  // Em voo virtual o mapa acompanha a aeronave, como no Pilot 2.
  useEffect(() => {
    const instancia = mapa.current
    const seguir = props.seguir
    if (!instancia || !pronto.current || !seguir) return

    instancia.jumpTo({
      center: [seguir.posicao.lon, seguir.posicao.lat],
      bearing: seguir.guinada,
    })
  }, [props.seguir])

  // Levar a vista a um waypoint, a pedido da lista ou do perfil.
  useEffect(() => {
    const instancia = mapa.current
    const alvo = props.centrarEm
    // Nao espera pelo `load`: mover a camara nao depende de o estilo ter chegado.
    if (!instancia || !alvo) return

    // Uma area quer-se enquadrada inteira; um waypoint quer-se de perto.
    if (alvo.envolvente) {
      instancia.fitBounds(alvo.envolvente, { padding: 60, duration: 500, maxZoom: 18 })
      return
    }

    instancia.easeTo({
      center: [alvo.posicao.lon, alvo.posicao.lat],
      zoom: Math.max(instancia.getZoom(), 17),
      duration: 500,
    })
  }, [props.centrarEm])

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

  const fonteAreas = instancia.getSource(FONTE_AREAS) as GeoJSONSource | undefined
  if (fonteAreas) fonteAreas.setData(areasGeoJSON(props.rota))

  camada.definirPontos(props.pontos3D)

  const fonteEnquadramento = instancia.getSource(FONTE_ENQUADRAMENTO) as GeoJSONSource | undefined
  if (fonteEnquadramento) fonteEnquadramento.setData(enquadramentoGeoJSON(props))

  sincronizarMarcadores(instancia, marcadores, props, callbacks)
  sincronizarPOIs(instancia, marcadoresPOI, props, callbacks)
}

/**
 * Poligono do que a foto vai apanhar, mais as arestas da piramide de visao desde
 * a aeronave ate aos cantos.
 */
function enquadramentoGeoJSON(props: PropsMapa): FeatureCollection {
  const enquadramento = props.enquadramento
  if (!enquadramento) return { type: 'FeatureCollection', features: [] }

  const cantos = enquadramento.cantos.filter((c) => c !== null)
  if (cantos.length < 3) return { type: 'FeatureCollection', features: [] }

  const anel = cantos.map((c) => [c.ponto.lon, c.ponto.lat])
  const primeiro = anel[0]
  if (primeiro) anel.push(primeiro)

  const features: Feature[] = [
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } },
  ]

  const aeronave = props.seguir?.posicao ?? posicaoDoSeleccionado(props)
  if (aeronave) {
    for (const canto of cantos) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [aeronave.lon, aeronave.lat],
            [canto.ponto.lon, canto.ponto.lat],
          ],
        },
      })
    }
  }

  const centro = enquadramento.centro
  if (aeronave && centro) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [aeronave.lon, aeronave.lat],
          [centro.ponto.lon, centro.ponto.lat],
        ],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

function posicaoDoSeleccionado(props: PropsMapa): LatLon | null {
  const waypoint = props.rota.waypoints.find((w) => props.seleccionados.has(w.id))
  return waypoint ? { lat: waypoint.lat, lon: waypoint.lon } : null
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
      elemento.addEventListener('contextmenu', (evento) => {
        evento.preventDefault()
        evento.stopPropagation()
        callbacks.current.aoRemoverPOI(poi.id)
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
function areasGeoJSON(rota: Rota): FeatureCollection {
  const features: Feature[] = []

  for (const area of rota.areas ?? []) {
    const anel = contornoFechado(area.contorno)
    if (anel.length === 0) continue

    features.push({
      type: 'Feature',
      properties: { id: area.id, nome: area.nome },
      geometry: { type: 'Polygon', coordinates: [anel.map((p) => [p.lon, p.lat])] },
    })
  }

  return { type: 'FeatureCollection', features }
}

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

      // Botao direito em cima do waypoint apaga-o. Desfaz-se com Ctrl+Z, como
      // tudo o resto: passa pelo mesmo caminho do botao de eliminar da lista.
      elemento.addEventListener('contextmenu', (evento) => {
        evento.preventDefault()
        evento.stopPropagation()
        callbacks.current.aoEliminarWaypoint(waypoint.id)
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
