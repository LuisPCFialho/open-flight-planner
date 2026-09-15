import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { amostrarPercurso } from '../nucleo/geodesia.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'

/**
 * Amostra o terreno ao longo da rota, de `passo` em `passo` metros.
 *
 * Os pontos vem de `amostrarPercurso`, a mesma funcao que o motor de terreno usa
 * por dentro, para o grafico e as validacoes assentarem exactamente nas mesmas
 * amostras. Se cada um gerasse as suas, o grafico podia mostrar folga onde a
 * validacao via colisao.
 *
 * O recalculo so acontece quando a geometria muda. Mexer na altura de um
 * waypoint muda a linha de voo, que e desenhada por cima, mas nao o terreno.
 */
export type PerfilAmostrado = {
  pontos: LatLon[]
  cotas: number[]
  aCarregar: boolean
  erro: string | null
}

export function usePerfilTerreno(
  rota: Rota | null,
  fonte: FonteTerreno,
  passo: number,
): PerfilAmostrado {
  const [resultado, setResultado] = useState<{ pontos: LatLon[]; cotas: number[] }>({
    pontos: [],
    cotas: [],
  })
  const [aCarregar, setACarregar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  /** Assinatura da geometria: so isto e que obriga a reamostrar o terreno. */
  const geometria = useMemo(() => {
    if (!rota) return ''
    return rota.waypoints.map((w) => `${w.lat.toFixed(6)},${w.lon.toFixed(6)}`).join(';')
  }, [rota])

  useEffect(() => {
    if (!rota || rota.waypoints.length < 2) {
      setResultado({ pontos: [], cotas: [] })
      return
    }

    const pontos = amostrarPercurso(rota.waypoints, passo)
    let obsoleto = false
    setACarregar(true)

    fonte
      .perfil(rota.waypoints, passo)
      .then((cotas) => {
        if (obsoleto || !montado.current) return
        setResultado({ pontos, cotas })
        setErro(null)
      })
      .catch((causa: unknown) => {
        if (obsoleto || !montado.current) return
        setErro(causa instanceof Error ? causa.message : 'falha a obter o perfil do terreno')
      })
      .finally(() => {
        if (!obsoleto && montado.current) setACarregar(false)
      })

    return () => {
      // Um perfil de uma geometria antiga nao serve para nada, ao contrario de
      // uma cota isolada, que continua valida onde quer que o waypoint va parar.
      obsoleto = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometria, passo, fonte])

  return { ...resultado, aCarregar, erro }
}
