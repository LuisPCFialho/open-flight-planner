import { useEffect, useRef, useState } from 'react'
import {
  Map as MapaLibre,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { algumDentroDaVista } from '../nucleo/areas.ts'
import { arrastoDeOrientacao, orientacaoAposArrasto } from './navegacao.ts'
import { CAMADA_SOMBREADO, estiloBase, FONTE_TERRENO } from './estilo.ts'
import { CamadaRota3D, type PontoRota3D, type Segmento3D } from './camada-rota-3d.ts'
import { CamadaDrones, type DroneNoMapa } from './camada-drones.ts'
import { ligarEstilo } from './arranque.ts'
import { sincronizarMarcadores, sincronizarPOIs } from './marcadores.ts'
import { marcadoresDensos } from './densidade.ts'
import {
  areasGeoJSON,
  enquadramentoGeoJSON,
  medicaoGeoJSON,
  segmentosGeoJSON,
  trajectoCasaGeoJSON,
} from './geojson.ts'
import type { PontaDoEnquadramento } from '../estado/alvo-camara.ts'

const FONTE_SEGMENTOS = 'rota-segmentos'
const CAMADA_SEGMENTOS = 'rota-terreno'
const FONTE_ENQUADRAMENTO = 'enquadramento'
const CAMADA_ENQUADRAMENTO_AREA = 'enquadramento-area'
const CAMADA_ENQUADRAMENTO_LINHA = 'enquadramento-linha'
/** Pixeis a partir dos quais se considera que houve arrasto e nao clique. */
const LIMITE_ARRASTO = 4

const FONTE_MEDICAO = 'medicao'
const CAMADA_MEDICAO_LINHA = 'medicao-linha'
const CAMADA_MEDICAO_AREA = 'medicao-area'
const CAMADA_MEDICAO_PONTOS = 'medicao-pontos'

const FONTE_AREAS = 'areas-referencia'
const CAMADA_AREAS_PREENCHIMENTO = 'areas-preenchimento'
const CAMADA_AREAS_CONTORNO = 'areas-contorno'

const FONTE_CASA = 'ponto-casa'
const CAMADA_CASA_PERNAS = 'casa-pernas'
const CAMADA_CASA_PONTO = 'casa-ponto'

export type CursorTerreno = { lat: number; lon: number; cotaTerreno: number | null }

export type PropsMapa = {
  rota: Rota
  /** Pontos ja com as cotas resolvidas. Um waypoint sem cota nao e desenhado em 3D. */
  pontos3D: readonly PontoRota3D[]
  /**
   * A aeronave a mover-se, quando o leitor esta a correr.
   *
   * Vem a parte dos waypoints porque so entra na camada dos aparelhos: metida
   * nos pontos da rota, acrescentaria um troco e uma vertical a linha de voo.
   */
  aeronave: DroneNoMapa | null
  seleccionados: ReadonlySet<string>
  modo3D: boolean
  /**
   * O que um clique no mapa faz. Em `navegar` nao faz nada: o botao esquerdo
   * so desloca a vista e escolhe waypoints.
   */
  modoMapa: 'navegar' | 'waypoint' | 'poi' | 'medir'
  /** Intervalo aceite acima do solo, que decide a cor de cada troço da rota. */
  intervaloAcimaDoSolo: { minimo: number; maximo: number }
  /** Quantas vezes se estica a altura do terreno em 3D. */
  /** Sombreado do relevo por cima da ortofoto. */
  sombreado: boolean
  /** Pontos da regua. Vazio quando nao se esta a medir. */
  medicao: readonly LatLon[]
  /**
   * Os quatro cantos do que a camara apanha, ja resolvidos.
   *
   * Vem das mesmas contas de que sai a piramide em 3D, de proposito: tinham
   * conta propria e discordavam - com o gimbal pouco inclinado aparecia a
   * piramide e nao aparecia a mancha no chao.
   */
  pontasEnquadramento: readonly PontaDoEnquadramento[]
  /** O ponto visado ao centro, para se desenhar o raio que la vai. */
  centroEnquadramento: LatLon | null
  /** Arestas da piramide que a camara projecta, desenhadas a altura de voo. */
  arestasEnquadramento: readonly Segmento3D[]
  /** Posicao da aeronave em voo virtual ou no leitor, para o mapa a seguir. */
  seguir: { posicao: LatLon } | null
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
  /** Clique em vazio, ja filtrado de arrastos. O modo decide o que fazer com ele. */
  aoClicarNoMapa: (lat: number, lon: number) => void
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
  /**
   * Rumo e inclinacao, a cada mudanca da vista.
   *
   * Vai para um canal e nao para estado: isto muda a cada fotograma enquanto se
   * arrasta, e em estado renderizava a aplicacao inteira 60 vezes por segundo.
   */
  aoMudarOrientacao: (orientacao: { rumo: number; inclinacao: number }) => void
  /** Pedido de apontar a norte, vindo da bussola. */
  apontarANorte: number
  aoErro: (mensagem: string) => void
}

export function Mapa(props: PropsMapa) {
  const contentor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaLibre | null>(null)
  const camada3D = useRef<CamadaRota3D | null>(null)
  const camadaDrones = useRef<CamadaDrones | null>(null)
  const marcadores = useRef(new Map<string, Marker>())
  const marcadoresPOI = useRef(new Map<string, Marker>())
  /*
   * O estilo do mapa chega depois do primeiro render, e ate chegar nao ha
   * camadas onde escrever. Isto e estado e nao referencia de proposito: os
   * efeitos de desenho tem de voltar a correr quando o mapa fica pronto, senao
   * o que ja estava desenhado a espera nunca chega a aparecer.
   */
  const [pronto, setPronto] = useState(false)

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

    /*
     * Os marcadores em locais, e nao em `.current`, para a limpeza os apanhar.
     *
     * Sao contentores criados uma vez e nunca substituidos, mas quem le o
     * codigo - e o linter - nao tem como saber isso olhando so para a limpeza.
     */
    const marcadoresNoMapa = marcadores.current
    const poisNoMapa = marcadoresPOI.current

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
      Object.assign(window, {
        __camada3D: () => camada3D.current,
        __camadaDrones: () => camadaDrones.current,
      })
    }

    /**
     * As nossas fontes e camadas. Chamada por `ligarEstilo` quando o estilo
     * estiver de pe, e pode rebentar se ainda nao estiver - e la que isso se
     * trata.
     */
    const instalar = (): void => {
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
        paint: { 'fill-color': '#4fd973', 'fill-opacity': 0.14 },
      })
      instancia.addLayer({
        id: CAMADA_AREAS_CONTORNO,
        type: 'line',
        source: FONTE_AREAS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4fd973',
          // Sobre ortofoto de mato e vinha, dois pixeis de linha perdem-se.
          'line-width': 3,
          'line-opacity': 1,
          'line-dasharray': [3, 2],
        },
      })

      /*
       * O ponto de descolagem e as pernas de saida e de regresso.
       *
       * Tracejado e apagado de proposito: e voo de transito, nao e o que se vai
       * filmar. Entra antes da rota para ficar por baixo dela - se as duas se
       * cruzarem, e a rota que tem de se ver.
       */
      instancia.addSource(FONTE_CASA, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: CAMADA_CASA_PERNAS,
        type: 'line',
        source: FONTE_CASA,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': '#dfe7f0',
          'line-width': 1.6,
          'line-opacity': 0.6,
          'line-dasharray': [2, 2.5],
        },
      })
      instancia.addLayer({
        id: CAMADA_CASA_PONTO,
        type: 'circle',
        source: FONTE_CASA,
        filter: ['==', ['geometry-type'], 'Point'],
        // Um aro, e nao um disco: o interior deixa ver o sitio onde se levanta.
        paint: {
          'circle-radius': 7,
          'circle-color': '#0b0e11',
          'circle-opacity': 0.35,
          'circle-stroke-color': '#dfe7f0',
          'circle-stroke-width': 2.5,
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
        /*
         * Mais fraco quando os cantos nao chegaram todos ao chao.
         *
         * Nesse caso o poligono nao e o que a foto cobre - e para onde ela
         * olha, com a parte de cima a sair pelo horizonte. Desenha-se na mesma,
         * para nao desaparecer a meio de uma rota, mas nao com o peso de uma
         * medicao.
         */
        paint: { 'fill-color': '#f0b429', 'fill-opacity': ['case', ['get', 'completo'], 0.22, 0.1] },
      })
      instancia.addLayer({
        id: CAMADA_ENQUADRAMENTO_LINHA,
        type: 'line',
        source: FONTE_ENQUADRAMENTO,
        paint: { 'line-color': '#f0b429', 'line-width': 1.2, 'line-opacity': 0.9 },
      })

      /*
       * A regua entra por ultimo entre as camadas do estilo, para ficar por
       * cima de tudo o que e mapa. E uma sobreposicao de trabalho: enquanto se
       * mede, e o que interessa ver.
       */
      instancia.addSource(FONTE_MEDICAO, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: CAMADA_MEDICAO_AREA,
        type: 'fill',
        source: FONTE_MEDICAO,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#f0b429', 'fill-opacity': 0.18 },
      })
      instancia.addLayer({
        id: CAMADA_MEDICAO_LINHA,
        type: 'line',
        source: FONTE_MEDICAO,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f0b429', 'line-width': 2.5 },
      })
      instancia.addLayer({
        id: CAMADA_MEDICAO_PONTOS,
        type: 'circle',
        source: FONTE_MEDICAO,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#f0b429',
          'circle-stroke-color': '#0b0e11',
          'circle-stroke-width': 1.5,
        },
      })

      const camada = new CamadaRota3D()
      camada3D.current = camada
      instancia.addLayer(camada)

      // Depois da rota, para os aparelhos ficarem por cima das linhas.
      const drones = new CamadaDrones()
      camadaDrones.current = drones
      instancia.addLayer(drones)

      setPronto(true)
    }

    /*
     * A ordem aqui e o que faltava, e custou um mapa em branco.
     *
     * O `setStyle` estava antes de se subscrever o `load`. Em desenvolvimento
     * ninguem dava por isso - o codigo nao esta minificado, ha o recarregamento
     * a quente pelo meio, e a subscricao chegava a tempo. Na versao construida o
     * estilo fica pronto primeiro, o `load` passa sem ninguem a ouvir, e o mapa
     * nasce com a ortofoto e mais nada: sem rota, sem areas, sem marcadores, sem
     * erro nenhum que o explique.
     *
     * Agora subscreve-se antes, aplica-se o estilo depois, e ainda se tenta
     * instalar a mao - para o caso de o estilo ja estar de pe quando chegarmos
     * aqui. As tres tentativas sao inofensivas porque a instalacao e idempotente.
     */
    // A ordem e a tolerancia a falhas estao em `arranque.ts`, com testes: foi
    // por ai que a versao construida nasceu uma vez com o mapa vazio.
    ligarEstilo(instancia, estiloBase(), instalar)

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

    /*
     * Clique em vazio. So faz alguma coisa com um modo ligado.
     *
     * Em `navegar` nao cria nada: o botao esquerdo desloca a vista e escolhe
     * waypoints, e mais nada. Sem isto, qualquer clique a olhar para o terreno
     * deixava la um waypoint.
     */
    instancia.on('click', (evento) => {
      if (houveArrasto) return
      const original = evento.originalEvent

      // Alt sobre um troco insere um ponto no meio, e so no modo de waypoints.
      if (original.altKey) {
        if (callbacks.current.modoMapa !== 'waypoint') return
        const alvos = instancia.queryRenderedFeatures(evento.point, { layers: [CAMADA_SEGMENTOS] })
        const indice = alvos[0]?.properties?.['indice']
        if (typeof indice === 'number') {
          callbacks.current.aoInserirWaypoint(indice + 1, evento.lngLat.lat, evento.lngLat.lng)
        }
        return
      }

      callbacks.current.aoClicarNoMapa(evento.lngLat.lat, evento.lngLat.lng)
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

    const reportarOrientacao = (): void => {
      callbacks.current.aoMudarOrientacao({
        rumo: instancia.getBearing(),
        inclinacao: instancia.getPitch(),
      })
    }
    instancia.on('rotate', reportarOrientacao)
    instancia.on('pitch', reportarOrientacao)
    instancia.on('move', reportarOrientacao)
    reportarOrientacao()

    /*
     * A leitura de coordenadas sob o cursor, a um por fotograma.
     *
     * O rato emite bem mais eventos do que o ecra desenha, e cada um destes
     * levanta a cota do terreno - que e um lancamento de raio contra os mosaicos
     * - e poe a aplicacao inteira a renderizar. Guardar o ultimo evento e
     * tratar so esse quando o fotograma chega da a mesma leitura ao utilizador
     * pelo trabalho de um so.
     */
    let ultimoCursor: { lat: number; lng: number } | null = null
    let cursorAgendado = 0

    const tratarCursor = (): void => {
      cursorAgendado = 0
      const ponto = ultimoCursor
      if (!ponto) return
      const cota = instancia.queryTerrainElevation(ponto)
      callbacks.current.aoMoverCursor({ lat: ponto.lat, lon: ponto.lng, cotaTerreno: cota ?? null })
    }

    instancia.on('mousemove', (evento) => {
      ultimoCursor = { lat: evento.lngLat.lat, lng: evento.lngLat.lng }
      if (cursorAgendado === 0) cursorAgendado = requestAnimationFrame(tratarCursor)
    })
    instancia.on('mouseout', () => {
      ultimoCursor = null
      callbacks.current.aoMoverCursor(null)
    })

    // Cursor de insercao ao passar sobre um troco, e so onde ela e possivel.
    instancia.on('mouseenter', CAMADA_SEGMENTOS, () => {
      if (callbacks.current.modoMapa !== 'waypoint') return
      instancia.getCanvas().style.cursor = 'copy'
    })
    instancia.on('mouseleave', CAMADA_SEGMENTOS, () => {
      instancia.getCanvas().style.cursor =
        callbacks.current.modoMapa === 'navegar' ? '' : 'crosshair'
    })

    return () => {
      setPronto(false)
      if (cursorAgendado !== 0) cancelAnimationFrame(cursorAgendado)
      tela.removeEventListener('mousedown', comecarArrasto)
      window.removeEventListener('mousemove', moverArrasto)
      window.removeEventListener('mouseup', largarArrasto)
      tela.removeEventListener('mousedown', aoPremirParaClique)
      window.removeEventListener('mousemove', aoMoverParaClique)
      window.removeEventListener('mouseup', aoLargarParaClique)
      for (const marcador of marcadoresNoMapa.values()) marcador.remove()
      marcadoresNoMapa.clear()
      for (const marcador of poisNoMapa.values()) marcador.remove()
      poisNoMapa.clear()
      camada3D.current = null
      camadaDrones.current = null

      instancia.remove()
      mapa.current = null
    }
    // Criado uma vez. O centro inicial so conta no arranque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- terreno e inclinacao, ao alternar 2D e 3D ----------------------------
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return

    if (props.modo3D) {
      instancia.setTerrain({ source: FONTE_TERRENO, exaggeration: 1 })
      if (instancia.getPitch() < 30) instancia.easeTo({ pitch: 62, duration: 600 })
    } else {
      instancia.setTerrain(null)
      instancia.easeTo({ pitch: 0, bearing: 0, duration: 600 })
    }
  }, [props.modo3D, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto || !instancia.getLayer(CAMADA_SOMBREADO)) return
    instancia.setLayoutProperty(
      CAMADA_SOMBREADO,
      'visibility',
      props.sombreado ? 'visible' : 'none',
    )
  }, [props.sombreado, pronto])

  /*
   * --- redesenho, um efeito por coisa desenhada ------------------------------
   *
   * Isto era um unico efeito sem lista de dependencias, ou seja corria a cada
   * render do componente. E o componente renderiza a cada movimento do rato,
   * porque a barra de estado mostra as coordenadas sob o cursor. Resultado
   * medido com 122 waypoints: 27 ms de trabalho por cada movimento do rato, a
   * reconstruir a geometria inteira da rota, a refazer todo o GeoJSON e a
   * reescrever o DOM de todos os marcadores - para desenhar exactamente o mesmo.
   *
   * Cada pedaco passa a depender so do que o alimenta. Os valores vem todos
   * memorizados do lado de fora, portanto a identidade so muda quando o
   * conteudo muda de facto.
   */
  const waypoints = props.rota.waypoints

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_SEGMENTOS) as GeoJSONSource | undefined
    fonte?.setData(segmentosGeoJSON(waypoints))
    // Acrescentar ou apagar waypoints muda a resposta com o mapa parado.
    instancia.fire('moveend')
  }, [waypoints, pronto])

  const intervaloAGL = props.intervaloAcimaDoSolo

  useEffect(() => {
    if (!pronto) return
    camada3D.current?.definirPontos(props.pontos3D, intervaloAGL)
  }, [props.pontos3D, intervaloAGL, pronto])

  useEffect(() => {
    if (!pronto) return
    camada3D.current?.definirArestas(props.arestasEnquadramento)
  }, [props.arestasEnquadramento, pronto])

  useEffect(() => {
    if (!pronto) return
    const aeronave = props.aeronave
    camadaDrones.current?.definirPontos(
      aeronave ? [...props.pontos3D, aeronave] : props.pontos3D,
    )
  }, [props.pontos3D, props.aeronave, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_AREAS) as GeoJSONSource | undefined
    fonte?.setData(areasGeoJSON(props.rota.areas))
  }, [props.rota.areas, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_CASA) as GeoJSONSource | undefined
    fonte?.setData(trajectoCasaGeoJSON(props.rota))
  }, [props.rota, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_ENQUADRAMENTO) as GeoJSONSource | undefined
    fonte?.setData(
      enquadramentoGeoJSON(
        props.pontasEnquadramento,
        props.centroEnquadramento,
        posicaoDaAeronave(props),
      ),
    )
    // O enquadramento sai da camara do ponto seleccionado ou da aeronave em voo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.pontasEnquadramento,
    props.centroEnquadramento,
    props.seguir,
    props.seleccionados,
    waypoints,
    pronto,
  ])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    sincronizarMarcadores(instancia, marcadores.current, waypoints, props.seleccionados, callbacks)
  }, [waypoints, props.seleccionados, pronto])

  /*
   * Numa rota de cobertura os marcadores numerados atropelam-se.
   *
   * Vinte metros entre fotos, vistos de cima, sao circulos de vinte e dois
   * pixeis a cair uns por cima dos outros: nao se le numero nenhum nem se
   * percebe por onde a rota passa. A decisao e uma classe no contentor e o
   * resto e do CSS - os marcadores encolhem para pontos e o numero sai, e quem
   * precisar dele aproxima a vista, que e o gesto natural.
   */
  useEffect(() => {
    const instancia = mapa.current
    const elemento = contentor.current
    if (!instancia || !elemento || !pronto) return

    const rever = (): void => {
      const centro = instancia.getCenter()
      elemento.classList.toggle(
        'marcadores-densos',
        marcadoresDensos(waypoints, centro.lat, instancia.getZoom()),
      )
    }

    rever()
    instancia.on('zoomend', rever)
    return () => {
      instancia.off('zoomend', rever)
    }
  }, [waypoints, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    sincronizarPOIs(instancia, marcadoresPOI.current, props.rota.pois, callbacks)
  }, [props.rota.pois, pronto])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_MEDICAO) as GeoJSONSource | undefined
    fonte?.setData(medicaoGeoJSON(props.medicao))
  }, [props.medicao, pronto])

  /*
   * Em voo virtual e no leitor o mapa acompanha a aeronave. Acompanha a
   * posicao, e so a posicao.
   *
   * Rodava tambem, para o rumo ficar sempre para cima. So que o modelo 3D ja
   * roda com a guinada, em coordenadas do mundo: mapa e aparelho rodavam o
   * mesmo angulo em sentidos contrarios e o resultado no ecra era zero. Rodar a
   * aeronave nao mexia nada - o que se via era o terreno a girar a volta de um
   * aparelho aparentemente preso.
   *
   * Sem a rotacao, virar o nariz vira o modelo, que e o que se quer ver. A
   * orientacao do mapa passa a ser de quem esta a ver, e a bussola continua la
   * para voltar ao norte.
   */
  useEffect(() => {
    const instancia = mapa.current
    const seguir = props.seguir
    if (!instancia || !pronto || !seguir) return

    instancia.jumpTo({ center: [seguir.posicao.lon, seguir.posicao.lat] })
  }, [props.seguir, pronto])

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

  // A bussola pede o norte. O `pedido` distingue dois cliques seguidos.
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto || props.apontarANorte === 0) return
    instancia.easeTo({ bearing: 0, pitch: 0, duration: 400 })
  }, [props.apontarANorte, pronto])

  // O cursor diz de imediato que o proximo clique cria um POI, nao um waypoint.
  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    instancia.getCanvas().style.cursor = props.modoMapa === 'navegar' ? '' : 'crosshair'
  }, [props.modoMapa, pronto])

  /*
   * O estado de instalacao fica no proprio elemento.
   *
   * E a unica forma de, de fora, distinguir "o mapa nao tem camadas nossas" de
   * "o mapa tem-nas e estao vazias" - e essa distincao ja custou uma manha. Os
   * acessores de diagnostico so existem em desenvolvimento, e o defeito que
   * aconteceu so aparecia na versao construida.
   */
  return <div className="mapa" data-pronto={pronto ? 'sim' : 'nao'} ref={contentor} />
}

/** De onde partem os raios do enquadramento: a aeronave, ou o ponto escolhido. */
function posicaoDaAeronave(props: PropsMapa): LatLon | null {
  if (props.seguir) return props.seguir.posicao
  const waypoint = props.rota.waypoints.find((w) => props.seleccionados.has(w.id))
  return waypoint ? { lat: waypoint.lat, lon: waypoint.lon } : null
}
