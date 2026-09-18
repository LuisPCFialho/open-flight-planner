import { useEffect, useRef, useState } from 'react'
import type { Drone, LatLon } from '../nucleo/tipos.ts'
import { projectarEnquadramento, type Enquadramento } from '../nucleo/camara.ts'
import type { FonteTerrariumAWS } from '../terreno/terrarium.ts'

/**
 * Projecta no terreno o que a camara vai apanhar num dado ponto.
 *
 * A marcha dos raios precisa da cota a cada passo, e por isso a area e trazida
 * para memoria primeiro. O raio a precarregar sai da geometria: com o gimbal
 * quase na horizontal os raios vao longe, e sem margem chegariam a mosaicos que
 * ainda nao estao carregados e parariam a meio, o que daria um enquadramento
 * curto de mais sem nada a dizer porque.
 */
export type Alvo = {
  posicao: LatLon
  alturaASL: number
  /** Rumo da aeronave em graus. */
  guinada: number
  gimbalPitch: number
  /** Rotacao do gimbal em relacao a aeronave, em graus. */
  gimbalYaw: number
}

/**
 * Azimute para onde a camara olha.
 *
 * O `gimbalHeadingYawBase` dos ficheiros reais e `aircraft`, portanto a rotacao
 * do gimbal conta-se a partir do nariz e o azimute e a soma dos dois.
 */
export function azimuteDaCamara(alvo: Pick<Alvo, 'guinada' | 'gimbalYaw'>): number {
  return ((alvo.guinada + alvo.gimbalYaw) % 360 + 360) % 360
}

const ALCANCE_MAXIMO = 3000

/**
 * Minimo de tempo entre duas projeccoes, em milesimos.
 *
 * A marcha dos raios amostra o terreno a cada passo, e com o gimbal quase na
 * horizontal o alcance chega aos tres quilometros: sao centenas de amostras por
 * raio, cinco raios, mais o precarregamento dos mosaicos que faltam. A correr a
 * cada fotograma do voo virtual, e isso que faz a aplicacao arrastar-se.
 *
 * Sete vezes por segundo chega e sobra para uma figura que so tem de dizer para
 * onde a camara aponta. O atraso e da ordem do fotograma e nao se ve; o que se
 * via era tudo o resto a abrandar por causa dela.
 */
export const INTERVALO_MINIMO_MS = 140

export function useEnquadramento(
  alvo: Alvo | null,
  drone: Drone,
  fonte: FonteTerrariumAWS,
): { enquadramento: Enquadramento | null; aCarregar: boolean } {
  const [enquadramento, setEnquadramento] = useState<Enquadramento | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const montado = useRef(true)
  /** Quando correu a ultima projeccao, para lhe pôr um tecto de cadência. */
  const ultimaProjeccao = useRef(0)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const fov = drone.camara.fovHorizontalGraus ?? 80
  const proporcao = drone.camara.proporcao ?? 4 / 3

  // Assinatura do alvo, para nao reprojectar a cada render.
  const assinatura = alvo
    ? `${alvo.posicao.lat.toFixed(6)},${alvo.posicao.lon.toFixed(6)},${alvo.alturaASL.toFixed(1)},${azimuteDaCamara(alvo).toFixed(1)},${alvo.gimbalPitch.toFixed(1)},${fov},${proporcao}`
    : ''

  useEffect(() => {
    if (!alvo) {
      setEnquadramento(null)
      return
    }

    let obsoleto = false

    /*
     * Estrangulamento, e nao adiamento.
     *
     * Adiar ate as coisas assentarem nunca dispararia: em voo a assinatura muda
     * a cada fotograma e o temporizador reiniciava-se sempre. O que se quer e um
     * tecto a cadencia, com a ultima posicao sempre a chegar no fim.
     */
    const desdeAUltima = Date.now() - ultimaProjeccao.current
    const espera = Math.max(0, INTERVALO_MINIMO_MS - desdeAUltima)

    const temporizador = setTimeout(() => {
      if (obsoleto || !montado.current) return
      ultimaProjeccao.current = Date.now()
      projectar()
    }, espera)

    return () => {
      obsoleto = true
      clearTimeout(temporizador)
    }

    function projectar(): void {
      if (!alvo) return
      setACarregar(true)

    // Alcance estimado: quanto mais horizontal o gimbal, mais longe vai o raio.
    const inclinacaoBordo = Math.max(1, Math.abs(alvo.gimbalPitch) - fov / 2)
    const alcance = Math.min(
      ALCANCE_MAXIMO,
      Math.max(200, 300 / Math.tan((inclinacaoBordo * Math.PI) / 180)),
    )

    fonte
      .precarregar(alvo.posicao, alcance * 1.2)
      .then(() => {
        if (obsoleto || !montado.current) return
        const projeccao = projectarEnquadramento(
          {
            posicao: alvo.posicao,
            alturaASL: alvo.alturaASL,
            // O que a camara aponta, nao o que a aeronave aponta.
            guinada: azimuteDaCamara(alvo),
            gimbalPitch: alvo.gimbalPitch,
            fovHorizontal: fov,
            proporcao,
          },
          // Fora da area precarregada devolve o nivel do voo, o que faz o raio
          // parar em vez de continuar a marchar sobre terreno desconhecido.
          (ponto) => fonte.cotaSincrona(ponto.lat, ponto.lon) ?? alvo.alturaASL,
          { alcance, passo: Math.max(2, alcance / 400) },
        )
        setEnquadramento(projeccao)
      })
      .catch(() => {
        if (!obsoleto && montado.current) setEnquadramento(null)
      })
      .finally(() => {
        if (!obsoleto && montado.current) setACarregar(false)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, fonte])

  return { enquadramento, aCarregar }
}
