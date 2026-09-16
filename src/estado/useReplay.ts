import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Rota } from '../nucleo/tipos.ts'
import { duracaoDoReplay, estadoNoInstante, type EstadoReplay } from '../nucleo/replay.ts'

/**
 * O leitor que percorre a rota no tempo.
 *
 * O relogio anda num ciclo de animacao e nao num temporizador: e o unico modo
 * de a aeronave se mover a mesma cadencia a que o ecra desenha, e de a
 * velocidade ser a mesma em maquinas diferentes. O instante e sempre em
 * segundos de voo real - o multiplicador so decide quantos deles passam por
 * cada segundo de relogio de parede.
 */

export type Replay = {
  /** O leitor esta aberto. Fechado, a rota nao e percorrida. */
  activo: boolean
  aCorrer: boolean
  /** Segundos de voo desde o inicio. */
  instante: number
  /** Segundos que o voo inteiro demora. */
  duracao: number
  /** Quantos segundos de voo por segundo de relogio. */
  velocidade: number
  /** Onde esta a aeronave, e para onde olha. */
  estado: EstadoReplay | null
  abrir: () => void
  fechar: () => void
  alternar: () => void
  irPara: (segundos: number) => void
  mudarVelocidade: (nova: number) => void
}

export function useReplay(rota: Rota | null): Replay {
  const [activo, setActivo] = useState(false)
  const [aCorrer, setACorrer] = useState(false)
  const [instante, setInstante] = useState(0)
  const [velocidade, setVelocidade] = useState(1)

  const duracao = useMemo(() => (rota ? duracaoDoReplay(rota) : 0), [rota])
  const estado = useMemo(
    () => (rota && activo ? estadoNoInstante(rota, instante) : null),
    [rota, activo, instante],
  )

  const velocidadeRef = useRef(velocidade)
  velocidadeRef.current = velocidade
  const duracaoRef = useRef(duracao)
  duracaoRef.current = duracao

  const abrir = useCallback(() => {
    setInstante(0)
    setActivo(true)
    setACorrer(true)
  }, [])

  const fechar = useCallback(() => {
    setActivo(false)
    setACorrer(false)
  }, [])

  const irPara = useCallback((segundos: number) => {
    setInstante(Math.max(0, Math.min(duracaoRef.current, segundos)))
  }, [])

  const alternar = useCallback(() => {
    setACorrer((antes) => {
      // Carregar em reproduzir no fim volta ao principio, em vez de nao fazer
      // nada com o botao a piscar.
      if (!antes && instante >= duracaoRef.current) setInstante(0)
      return !antes
    })
  }, [instante])

  const mudarVelocidade = useCallback((nova: number) => {
    if (nova > 0) setVelocidade(nova)
  }, [])

  // --- relogio --------------------------------------------------------------
  useEffect(() => {
    if (!activo || !aCorrer) return

    let pedido = 0
    let anterior = performance.now()

    const passo = (agora: number): void => {
      // Um salto grande - mudar de separador, por exemplo - nao deve atirar a
      // aeronave para o fim da rota.
      const delta = Math.min(0.25, (agora - anterior) / 1000)
      anterior = agora
      pedido = requestAnimationFrame(passo)

      setInstante((actual) => {
        const proximo = actual + delta * velocidadeRef.current
        if (proximo >= duracaoRef.current) {
          setACorrer(false)
          return duracaoRef.current
        }
        return proximo
      })
    }

    pedido = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(pedido)
  }, [activo, aCorrer])

  return {
    activo,
    aCorrer,
    instante,
    duracao,
    velocidade,
    estado,
    abrir,
    fechar,
    alternar,
    irPara,
    mudarVelocidade,
  }
}
