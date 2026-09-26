import { Marker, type Map as MapaLibre } from 'maplibre-gl'
import type { POI, Waypoint } from '../nucleo/tipos.ts'

/**
 * Os marcadores do DOM: os circulos numerados dos waypoints e os losangos dos
 * pontos de interesse.
 *
 * Sao elementos do documento e nao geometria WebGL, e e deliberado. O numero
 * tem de se ler a qualquer escala, o arrasto tem de ser preciso ao pixel, e o
 * botao direito tem de abrir onde se carregou - tres coisas que num desenho
 * proprio se pagam caro. Medido com 120 waypoints, custam 9% do tempo de cada
 * fotograma, e isso e barato pelo que dao.
 *
 * A sincronizacao e por diferenca, e nao por reconstrucao: um marcador que ja
 * existe muda de posicao, e so os que desapareceram e que sao removidos.
 * Recriar todos a cada alteracao perdia o arrasto a meio.
 */

/**
 * O que os marcadores precisam de chamar.
 *
 * Vai num `ref` porque os ouvintes sao registados uma vez, quando o marcador
 * nasce. Uma funcao fechada sobre as props do momento passaria a consultar uma
 * rota antiga assim que a rota mudasse.
 */
export type AccoesDeMarcador = {
  current: {
    aoSeleccionar: (id: string, juntar: boolean, intervalo: boolean) => void
    aoMoverWaypoint: (id: string, lat: number, lon: number, terminado: boolean) => void
    aoEliminarWaypoint: (id: string) => void
    aoRemoverPOI: (id: string) => void
  }
}

/** Apaga os marcadores cujo elemento ja nao existe na rota. */
function removerOsQueMorreram(marcadores: Map<string, Marker>, vivos: ReadonlySet<string>): void {
  for (const [id, marcador] of marcadores) {
    if (vivos.has(id)) continue
    marcador.remove()
    marcadores.delete(id)
  }
}

/** Move o marcador so quando ele esta mesmo noutro sitio. */
function colocar(marcador: Marker, lat: number, lon: number): void {
  const actual = marcador.getLngLat()
  if (actual.lat === lat && actual.lng === lon) return
  marcador.setLngLat([lon, lat])
}

/**
 * Marcadores dos pontos de interesse. Sao losangos, para nao se confundirem com
 * os circulos numerados dos waypoints a um relance.
 */
export function sincronizarPOIs(
  instancia: MapaLibre,
  marcadores: Map<string, Marker>,
  pois: readonly POI[],
  accoes: AccoesDeMarcador,
): void {
  removerOsQueMorreram(marcadores, new Set(pois.map((p) => p.id)))

  for (const poi of pois) {
    let marcador = marcadores.get(poi.id)

    if (!marcador) {
      const elemento = document.createElement('button')
      elemento.type = 'button'
      elemento.className = 'marcador-poi'
      elemento.addEventListener('click', (evento) => {
        evento.stopPropagation()
        if (evento.shiftKey) accoes.current.aoRemoverPOI(poi.id)
      })
      elemento.addEventListener('contextmenu', (evento) => {
        evento.preventDefault()
        evento.stopPropagation()
        accoes.current.aoRemoverPOI(poi.id)
      })

      marcador = new Marker({ element: elemento, draggable: false })
      marcador.setLngLat([poi.lon, poi.lat]).addTo(instancia)
      marcadores.set(poi.id, marcador)
    } else {
      colocar(marcador, poi.lat, poi.lon)
    }

    const elemento = marcador.getElement()
    elemento.title = `${poi.nome} — shift e clique para remover`
    elemento.setAttribute('aria-label', `Ponto de interesse ${poi.nome}`)
  }
}

/** Os circulos numerados dos waypoints, arrastaveis. */
export function sincronizarMarcadores(
  instancia: MapaLibre,
  marcadores: Map<string, Marker>,
  waypoints: readonly Waypoint[],
  seleccionados: ReadonlySet<string>,
  accoes: AccoesDeMarcador,
): void {
  removerOsQueMorreram(marcadores, new Set(waypoints.map((w) => w.id)))

  for (const waypoint of waypoints) {
    let marcador = marcadores.get(waypoint.id)

    if (!marcador) {
      const elemento = document.createElement('button')
      elemento.type = 'button'
      elemento.className = 'marcador-waypoint'

      /*
       * Ctrl junta um, shift apanha o intervalo - como na lista e como em
       * qualquer lista.
       *
       * Antes as duas teclas faziam a mesma coisa, juntar. Quem quisesse os
       * vinte pontos de uma passagem tinha de lhes bater um a um com o ctrl
       * premido, e no mapa e onde se ve qual e a passagem.
       */
      elemento.addEventListener('click', (evento) => {
        evento.stopPropagation()
        accoes.current.aoSeleccionar(
          waypoint.id,
          evento.ctrlKey || evento.metaKey,
          evento.shiftKey,
        )
      })

      /*
       * Botao direito em cima do waypoint apaga-o. Desfaz-se com Ctrl+Z, como
       * tudo o resto: passa pelo mesmo caminho do botao de eliminar da lista.
       */
      elemento.addEventListener('contextmenu', (evento) => {
        evento.preventDefault()
        evento.stopPropagation()
        accoes.current.aoEliminarWaypoint(waypoint.id)
      })

      marcador = new Marker({ element: elemento, draggable: true })
      marcador.setLngLat([waypoint.lon, waypoint.lat]).addTo(instancia)

      /*
       * O arrasto avisa duas vezes: durante, para a rota acompanhar o rato, e no
       * fim, com `terminado`. E o que permite juntar o arrasto todo num so passo
       * do historico, em vez de um por pixel.
       */
      const novo = marcador
      novo.on('drag', () => {
        const pos = novo.getLngLat()
        accoes.current.aoMoverWaypoint(waypoint.id, pos.lat, pos.lng, false)
      })
      novo.on('dragend', () => {
        const pos = novo.getLngLat()
        accoes.current.aoMoverWaypoint(waypoint.id, pos.lat, pos.lng, true)
      })

      marcadores.set(waypoint.id, marcador)
    } else {
      colocar(marcador, waypoint.lat, waypoint.lon)
    }

    const elemento = marcador.getElement()
    elemento.textContent = String(waypoint.index + 1)
    elemento.classList.toggle('seleccionado', seleccionados.has(waypoint.id))
    elemento.setAttribute('aria-label', `Waypoint ${waypoint.index + 1}`)
  }
}
