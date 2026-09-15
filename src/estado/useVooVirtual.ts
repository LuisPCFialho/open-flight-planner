import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLon } from '../nucleo/tipos.ts'
import { apontarGimbal, avancarVoo, type EstadoVoo } from '../nucleo/voo.ts'

export type { EstadoVoo }

/**
 * Voo virtual: pilotar a aeronave pelo mapa e gravar o waypoint no sitio e com
 * a atitude em que ela esta.
 *
 * Os comandos sao os do Pilot 2, para nao haver duas maneiras de fazer a mesma
 * coisa: W A S D deslocam, Q E rodam a aeronave, C Z sobem e descem.
 *
 * A camara tem comandos so dela, que e o que faz falta para enquadrar: as setas
 * de cima e baixo inclinam o gimbal, as da esquerda e direita rodam-no em
 * relacao a aeronave, e R volta a por o gimbal a olhar em frente. Com Alt
 * premido tudo anda a um quinto da velocidade, para o ajuste fino do
 * enquadramento. Arrastar o rato na vista da camara aponta-a directamente.
 *
 * Shift e espaco grava o waypoint, Shift e F acrescenta-lhe a foto.
 *
 * O movimento corre num ciclo de animacao e nao no evento de tecla, para a
 * velocidade ser a mesma em qualquer teclado, independentemente da cadencia de
 * repeticao que cada um tenha configurada.
 */

export type ComandosVoo = {
  activo: boolean
  estado: EstadoVoo
  arrancar: (inicial: EstadoVoo) => void
  parar: () => void
  /** Move a aeronave sem passar pelo teclado, para o mapa poder posiciona-la. */
  colocar: (posicao: LatLon) => void
  /** Grava o waypoint na posicao e atitude actuais. */
  gravar: () => void
  /** Aponta a camara, em graus. Serve o arrastar do rato na vista da camara. */
  apontar: (deltaPitch: number, deltaYaw: number) => void
}

const TECLAS = new Set([
  'w', 'a', 's', 'd', 'q', 'e', 'z', 'c',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
])

export function useVooVirtual(opcoes: {
  aoGravarWaypoint: (estado: EstadoVoo) => void
  aoInserirFoto: () => void
}): ComandosVoo {
  const [activo, setActivo] = useState(false)
  const [estado, setEstado] = useState<EstadoVoo>({
    posicao: { lat: 0, lon: 0 },
    altura: 60,
    guinada: 0,
    gimbalPitch: -30,
    gimbalYaw: 0,
  })

  const premidas = useRef(new Set<string>())
  const callbacks = useRef(opcoes)
  callbacks.current = opcoes

  /*
   * O estado tambem vive num ref.
   *
   * Gravar o waypoint tem de ler a atitude actual, e faze-lo de dentro de um
   * updater de `setState` seria impuro: o React chama os updaters duas vezes em
   * modo estrito, e cada Shift+Space gravava dois waypoints. O ref da o valor
   * actual sem passar por lado nenhum que possa correr duas vezes.
   */
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  const gravar = useCallback(() => {
    callbacks.current.aoGravarWaypoint(estadoRef.current)
  }, [])

  const arrancar = useCallback((inicial: EstadoVoo) => {
    setEstado(inicial)
    setActivo(true)
  }, [])

  const parar = useCallback(() => {
    premidas.current.clear()
    setActivo(false)
  }, [])

  const colocar = useCallback((posicao: LatLon) => {
    setEstado((anterior) => ({ ...anterior, posicao }))
  }, [])

  const apontar = useCallback((deltaPitch: number, deltaYaw: number) => {
    setEstado((anterior) => apontarGimbal(anterior, deltaPitch, deltaYaw))
  }, [])

  // --- teclado --------------------------------------------------------------
  useEffect(() => {
    if (!activo) return

    const aoPremir = (evento: KeyboardEvent): void => {
      const alvo = evento.target
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) return

      const tecla = evento.key.toLowerCase()

      if (evento.shiftKey && evento.code === 'Space') {
        evento.preventDefault()
        gravar()
        return
      }
      if (evento.shiftKey && tecla === 'f') {
        evento.preventDefault()
        callbacks.current.aoInserirFoto()
        return
      }
      if (tecla === 'escape') {
        parar()
        return
      }
      // Recentrar o gimbal e instantaneo, nao e um movimento continuo.
      if (tecla === 'r') {
        evento.preventDefault()
        setEstado((anterior) => ({ ...anterior, gimbalYaw: 0 }))
        return
      }
      if (tecla === 'alt') {
        // Sem isto o Alt passava o foco para o menu do browser a meio do voo.
        evento.preventDefault()
        premidas.current.add('alt')
        return
      }
      if (TECLAS.has(tecla)) {
        evento.preventDefault()
        premidas.current.add(tecla)
      }
    }

    const aoLargar = (evento: KeyboardEvent): void => {
      premidas.current.delete(evento.key.toLowerCase())
    }
    // Ao perder o foco as teclas ficariam presas e a aeronave continuava sozinha.
    const aoPerderFoco = (): void => premidas.current.clear()

    window.addEventListener('keydown', aoPremir)
    window.addEventListener('keyup', aoLargar)
    window.addEventListener('blur', aoPerderFoco)
    return () => {
      window.removeEventListener('keydown', aoPremir)
      window.removeEventListener('keyup', aoLargar)
      window.removeEventListener('blur', aoPerderFoco)
    }
  }, [activo, parar, gravar])

  // --- ciclo de movimento ---------------------------------------------------
  useEffect(() => {
    if (!activo) return

    let pedido = 0
    let anterior = performance.now()

    const passo = (agora: number): void => {
      const delta = Math.min(0.1, (agora - anterior) / 1000)
      anterior = agora
      pedido = requestAnimationFrame(passo)

      const teclas = premidas.current
      if (teclas.size === 0) return

      setEstado((actual) => avancarVoo(actual, teclas, delta))
    }

    pedido = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(pedido)
  }, [activo])

  return { activo, estado, arrancar, parar, colocar, gravar, apontar }
}
