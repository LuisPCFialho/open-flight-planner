import { useEffect, useRef } from 'react'
import { LngLat, Map as MapaLibre } from 'maplibre-gl'
import type { LatLon } from '../nucleo/tipos.ts'
import type { Enquadramento } from '../nucleo/camara.ts'
import { estiloBase, FONTE_TERRENO } from '../mapa/estilo.ts'

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
 */

type Props = {
  posicao: LatLon
  /** Altura de voo ortometrica. */
  alturaASL: number
  enquadramento: Enquadramento | null
  aCarregar: boolean
}

export function VistaCamara({ posicao, alturaASL, enquadramento, aCarregar }: Props) {
  const contentor = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaLibre | null>(null)
  const pronto = useRef(false)

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
      pronto.current = true
    })

    return () => {
      pronto.current = false
      instancia.remove()
      mapa.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const centro = enquadramento?.centro
  const alvoLat = centro?.ponto.lat
  const alvoLon = centro?.ponto.lon
  const alvoCota = centro?.cotaTerreno

  useEffect(() => {
    const instancia = mapa.current
    if (!instancia || !pronto.current) return
    if (alvoLat === undefined || alvoLon === undefined || alvoCota === undefined) return

    const opcoes = instancia.calculateCameraOptionsFromTo(
      new LngLat(posicao.lon, posicao.lat),
      alturaASL,
      new LngLat(alvoLon, alvoLat),
      alvoCota,
    )
    instancia.jumpTo(opcoes)
  }, [posicao.lat, posicao.lon, alturaASL, alvoLat, alvoLon, alvoCota])

  return (
    <div className="vista-camara">
      <div className="vista-camara-mapa" ref={contentor} />

      <div className="vista-camara-moldura" aria-hidden="true">
        <span className="terco vertical um" />
        <span className="terco vertical dois" />
        <span className="terco horizontal um" />
        <span className="terco horizontal dois" />
        <span className="mira" />
      </div>

      <div className="vista-camara-leituras numerico">
        {centro ? (
          <>
            <span title="Distancia obliqua ao centro do enquadramento">
              {centro.distancia.toFixed(0)} m ao centro
            </span>
            <span title="Largura do terreno coberta pela foto">
              {enquadramento?.larguraCoberta?.toFixed(0) ?? '--'} m de largura
            </span>
          </>
        ) : (
          <span>{aCarregar ? 'a projectar...' : 'a camara aponta acima do horizonte'}</span>
        )}
      </div>
    </div>
  )
}
