import { useEffect, useRef, useState } from 'react'
import { LngLat, Map as MapaLibre, type GeoJSONSource } from 'maplibre-gl'
import type { Area, LatLon } from '../nucleo/tipos.ts'
import {
  abaixoDoHorizonte,
  pontoAoLongoDoRaio,
  type Enquadramento,
} from '../nucleo/camara.ts'
import { estiloBase, FONTE_TERRENO } from '../mapa/estilo.ts'
import { areasGeoJSON } from '../mapa/geojson.ts'

/** Fonte propria: esta janela tem o seu mapa, separado do principal. */
const FONTE_AREAS_CAMARA = 'areas-na-camara'

/** Ate onde se mira quando a camara nao encontra terreno. */
const DISTANCIA_SEM_TERRENO = 400

/**
 * O que a camara ve, em primeira pessoa.
 *
 * E um segundo mapa com a camara colocada onde a aeronave esta e apontada ao
 * centro do enquadramento, atraves de `calculateCameraOptionsFromTo`. Nao e uma
 * simulacao da optica, e sim a ortofoto vista do sitio e do angulo certos, que e
 * o que decide se o enquadramento apanha o que interessa.
 *
 * As molduras sobrepostas sao a regra dos tercos e o centro, para se poder
 * compor a foto como se compoe qualquer outra.
 *
 * Em voo, arrastar aqui dentro aponta o gimbal. A conversao de pixeis para graus
 * sai do campo de visao e da largura do elemento, portanto um detalhe do terreno
 * acompanha o cursor em vez de fugir a frente ou ficar para tras.
 */

/** Quanto da zona do mapa a vista ocupa. */
export type TamanhoCamara = 'normal' | 'grande' | 'inteira'

const SEGUINTE: Record<TamanhoCamara, TamanhoCamara> = {
  normal: 'grande',
  grande: 'inteira',
  inteira: 'normal',
}

const NOME: Record<TamanhoCamara, string> = {
  normal: 'Normal',
  grande: 'Grande',
  inteira: 'Ecra inteiro',
}

type Props = {
  posicao: LatLon
  /** Altura de voo ortometrica. */
  alturaASL: number
  enquadramento: Enquadramento | null
  /**
   * Os limites importados, desenhados tambem aqui.
   *
   * Sem eles a vista de camara mostrava ortofoto e mais nada, e quem pilotava
   * nao tinha como saber se estava a apanhar a parcela ou o monte do lado - que
   * e a unica pergunta que se faz a esta janela.
   */
  areas: readonly Area[] | undefined
  aCarregar: boolean
  /** Campo de visao horizontal em graus, para o arrasto ser de um para um. */
  fovHorizontal: number
  tamanho: TamanhoCamara
  aoMudarTamanho: (tamanho: TamanhoCamara) => void
  /**
   * Arrastar na vista: para cima e para baixo inclina o gimbal, para os lados
   * roda a aeronave. Ausentes fora do voo, e entao nao se arrasta.
   *
   * Era tudo gimbal, e o horizontal batia no limite de um quarto de volta: a
   * partir dai arrastar nao fazia nada, e o aparelho no mapa nunca se via
   * virar. Quem estava a pilotar concluia que o modelo nao rodava - rodava, mas
   * so com o Q e o E.
   */
  aoInclinar?: (deltaPitch: number) => void
  aoRodar?: (deltaGraus: number) => void
}

export function VistaCamara({
  posicao,
  alturaASL,
  enquadramento,
  areas,
  aCarregar,
  fovHorizontal,
  tamanho,
  aoMudarTamanho,
  aoInclinar,
  aoRodar,
}: Props) {
  const contentor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaLibre | null>(null)
  /*
   * Estado, e nao `ref`, de proposito.
   *
   * Num `ref`, um efeito que dependa dos dados corre uma vez antes de o mapa
   * carregar, desiste, e nunca mais volta a correr - porque os dados nao
   * mudaram. Foi assim que os limites importados deixaram de aparecer aqui. Em
   * estado, a chegada do mapa provoca render e os efeitos correm outra vez.
   */
  const [pronto, setPronto] = useState(false)
  const arrasto = useRef<{ x: number; y: number } | null>(null)
  const [aArrastar, setAArrastar] = useState(false)

  useEffect(() => {
    if (!contentor.current) return

    const instancia = new MapaLibre({
      container: contentor.current,
      style: { version: 8, sources: {}, layers: [] },
      center: [posicao.lon, posicao.lat],
      zoom: 16,
      maxPitch: 85,
      // Sem controlos nem interaccao: isto e uma leitura, nao um mapa para navegar.
      interactive: false,
      attributionControl: false,
    })
    mapa.current = instancia
    instancia.setStyle(estiloBase())

    instancia.on('load', () => {
      instancia.setTerrain({ source: FONTE_TERRENO, exaggeration: 1 })

      /*
       * A fonte e as camadas dos limites, que faltavam por inteiro.
       *
       * O efeito que escreve os dados existia e chamava `setData` numa fonte
       * que nunca tinha sido criada. O `getSource` devolvia `undefined`, o `?.`
       * engolia a chamada, e nao havia erro nenhum a dizer que o desenho nao
       * estava a acontecer - so uma vista de camara com ortofoto e mais nada.
       *
       * As cores sao as mesmas do mapa principal de proposito: e o mesmo
       * limite visto de outro sitio, e tem de se ler como o mesmo.
       */
      instancia.addSource(FONTE_AREAS_CAMARA, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      instancia.addLayer({
        id: 'areas-camara-preenchimento',
        type: 'fill',
        source: FONTE_AREAS_CAMARA,
        paint: {
          'fill-color': ['case', ['get', 'interdita'], '#f25a4c', '#4fd973'],
          'fill-opacity': ['case', ['get', 'interdita'], 0.2, 0.14],
        },
      })
      instancia.addLayer({
        id: 'areas-camara-contorno',
        type: 'line',
        source: FONTE_AREAS_CAMARA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['get', 'interdita'], '#f25a4c', '#4fd973'],
          'line-width': 3,
          'line-dasharray': [3, 2],
        },
      })

      setPronto(true)
    })

    return () => {
      setPronto(false)
      instancia.remove()
      mapa.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    const fonte = instancia.getSource(FONTE_AREAS_CAMARA) as GeoJSONSource | undefined
    fonte?.setData(areasGeoJSON(areas))
  }, [areas, pronto])

  const centro = enquadramento?.centro

  /*
   * Para onde a vista aponta.
   *
   * O ponto visado quando a camara chega ao terreno. Quando nao chega - gimbal
   * apontado acima do horizonte - vale a propria linha de vista, baixada o
   * minimo para a camara do mapa a conseguir seguir.
   *
   * Sem esta segunda hipotese a vista ficava parada no ultimo sitio que tinha
   * visto: mexia a altitude e mais nada, e parecia encravada. Uma vista que
   * responde e mais util do que uma vista exacta que congela, e o ecra continua
   * a dizer por palavras que a camara esta acima do horizonte.
   */
  const mira = centro
    ? { lat: centro.ponto.lat, lon: centro.ponto.lon, alt: centro.cotaTerreno }
    : enquadramento
      ? (() => {
          const longe = pontoAoLongoDoRaio(
            posicao,
            alturaASL,
            abaixoDoHorizonte(enquadramento.direccaoDoCentro),
            DISTANCIA_SEM_TERRENO,
          )
          return { lat: longe.ponto.lat, lon: longe.ponto.lon, alt: longe.altura }
        })()
      : null

  const alvoLat = mira?.lat
  const alvoLon = mira?.lon
  const alvoCota = mira?.alt

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto) return
    if (alvoLat === undefined || alvoLon === undefined || alvoCota === undefined) return

    const opcoes = instancia.calculateCameraOptionsFromTo(
      new LngLat(posicao.lon, posicao.lat),
      alturaASL,
      new LngLat(alvoLon, alvoLat),
      alvoCota,
    )
    instancia.jumpTo(opcoes)
  }, [posicao.lat, posicao.lon, alturaASL, alvoLat, alvoLon, alvoCota, pronto])

  const grausPorPixel = (elemento: HTMLElement): number =>
    fovHorizontal / Math.max(1, elemento.clientWidth)

  return (
    <div
      className={`vista-camara ${tamanho}${aoRodar ? ' apontavel' : ''}${aArrastar ? ' a-arrastar' : ''}`}
      title={aoRodar ? 'Arrastar: para os lados roda a aeronave, para cima e baixo inclina o gimbal' : undefined}
      onPointerDown={(evento) => {
        if (!aoRodar) return
        evento.currentTarget.setPointerCapture(evento.pointerId)
        arrasto.current = { x: evento.clientX, y: evento.clientY }
        setAArrastar(true)
      }}
      onPointerMove={(evento) => {
        const anterior = arrasto.current
        if (!aoRodar || !anterior) return

        const escala = grausPorPixel(evento.currentTarget)
        const dx = evento.clientX - anterior.x
        const dy = evento.clientY - anterior.y
        arrasto.current = { x: evento.clientX, y: evento.clientY }

        // Arrastar para a direita vira o nariz para a direita; para baixo,
        // inclina o gimbal para baixo. E a aeronave que se conduz, nao a
        // imagem que se puxa.
        aoRodar(dx * escala)
        aoInclinar?.(-dy * escala)
      }}
      onPointerUp={(evento) => {
        if (arrasto.current) evento.currentTarget.releasePointerCapture(evento.pointerId)
        arrasto.current = null
        setAArrastar(false)
      }}
      onPointerCancel={() => {
        arrasto.current = null
        setAArrastar(false)
      }}
    >
      <div className="vista-camara-mapa" ref={contentor} />

      <div className="vista-camara-moldura" aria-hidden="true">
        <span className="terco vertical um" />
        <span className="terco vertical dois" />
        <span className="terco horizontal um" />
        <span className="terco horizontal dois" />
        <span className="mira" />
      </div>

      <button
        type="button"
        className="vista-camara-tamanho"
        title={`Ver em ${NOME[SEGUINTE[tamanho]].toLowerCase()}`}
        // O arrasto aponta o gimbal; sem isto carregar aqui tambem o mexia.
        onPointerDown={(evento) => evento.stopPropagation()}
        onClick={() => aoMudarTamanho(SEGUINTE[tamanho])}
      >
        {NOME[SEGUINTE[tamanho]]}
      </button>

      <div className="vista-camara-leituras numerico">
        {centro ? (
          <>
            <span title="Distância oblíqua ao centro do enquadramento">
              {centro.distancia.toFixed(0)} m ao centro
            </span>
            <span title="Largura do terreno coberta pela foto">
              {enquadramento?.larguraCoberta?.toFixed(0) ?? '--'} m de largura
            </span>
          </>
        ) : (
          <span>{aCarregar ? 'a projectar...' : 'a câmara aponta acima do horizonte'}</span>
        )}
      </div>
    </div>
  )
}
