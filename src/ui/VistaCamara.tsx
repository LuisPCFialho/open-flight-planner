import { useEffect, useRef, useState } from 'react'
import { LngLat, Map as MapaLibre, type GeoJSONSource } from 'maplibre-gl'
import type { Area, LatLon } from '../nucleo/tipos.ts'
import type { Enquadramento } from '../nucleo/camara.ts'
import { estiloBase, FONTE_TERRENO } from '../mapa/estilo.ts'
import { areasGeoJSON } from '../mapa/geojson.ts'

/** Fonte propria: esta janela tem o seu mapa, separado do principal. */
const FONTE_AREAS_CAMARA = 'areas-na-camara'

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
  /** Aponta o gimbal, em graus. Ausente fora do voo, e entao nao se arrasta. */
  aoApontar?: (deltaPitch: number, deltaYaw: number) => void
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
  aoApontar,
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
  const alvoLat = centro?.ponto.lat
  const alvoLon = centro?.ponto.lon
  const alvoCota = centro?.cotaTerreno

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
      className={`vista-camara ${tamanho}${aoApontar ? ' apontavel' : ''}${aArrastar ? ' a-arrastar' : ''}`}
      title={aoApontar ? 'Arrastar aponta o gimbal' : undefined}
      onPointerDown={(evento) => {
        if (!aoApontar) return
        evento.currentTarget.setPointerCapture(evento.pointerId)
        arrasto.current = { x: evento.clientX, y: evento.clientY }
        setAArrastar(true)
      }}
      onPointerMove={(evento) => {
        const anterior = arrasto.current
        if (!aoApontar || !anterior) return

        const escala = grausPorPixel(evento.currentTarget)
        const dx = evento.clientX - anterior.x
        const dy = evento.clientY - anterior.y
        arrasto.current = { x: evento.clientX, y: evento.clientY }

        // Arrastar para a direita vira a camara para a direita; para baixo,
        // inclina para baixo. E o gimbal que se conduz, nao a imagem que se puxa.
        aoApontar(-dy * escala, dx * escala)
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
