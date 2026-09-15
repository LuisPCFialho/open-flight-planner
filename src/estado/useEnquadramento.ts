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

export function useEnquadramento(
  alvo: Alvo | null,
  drone: Drone,
  fonte: FonteTerrariumAWS,
): { enquadramento: Enquadramento | null; aCarregar: boolean } {
  const [enquadramento, setEnquadramento] = useState<Enquadramento | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const montado = useRef(true)

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

    return () => {
      obsoleto = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, fonte])

  return { enquadramento, aCarregar }
}
