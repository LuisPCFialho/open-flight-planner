import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLon } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'

/**
 * Voo virtual: pilotar a aeronave pelo mapa e gravar o waypoint no sitio e com
 * a atitude em que ela esta.
 *
 * Os comandos sao os do Pilot 2, para nao haver duas maneiras de fazer a mesma
 * coisa: W A S D deslocam, Q E rodam, C Z sobem e descem, as setas mexem o
 * gimbal. Shift e espaco grava o waypoint, Shift e F acrescenta-lhe a foto.
 *
 * O movimento corre num ciclo de animacao e nao no evento de tecla, para a
 * velocidade ser a mesma em qualquer teclado, independentemente da cadencia de
 * repeticao que cada um tenha configurada.
 */

export type EstadoVoo = {
  posicao: LatLon
  /** Altura no modo de altitude da rota. */
  altura: number
  /** Rumo da aeronave em graus. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
}

export type ComandosVoo = {
  activo: boolean
  estado: EstadoVoo
  arrancar: (inicial: EstadoVoo) => void
  parar: () => void
  /** Move a aeronave sem passar pelo teclado, para o mapa poder posiciona-la. */
  colocar: (posicao: LatLon) => void
  /** Grava o waypoint na posicao e atitude actuais. */
  gravar: () => void
}

/** Metros por segundo em translacao, graus por segundo em rotacao. */
const VELOCIDADE = 18
const VELOCIDADE_VERTICAL = 10
const ROTACAO = 70
const ROTACAO_GIMBAL = 45

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

      setEstado((actual) => {
        const metros = VELOCIDADE * delta

        let { posicao, altura, guinada, gimbalPitch } = actual

        // Deslocacao no referencial da aeronave: W e sempre em frente.
        let frente = 0
        let lado = 0
        if (teclas.has('w')) frente += 1
        if (teclas.has('s')) frente -= 1
        if (teclas.has('d')) lado += 1
        if (teclas.has('a')) lado -= 1

        if (frente !== 0 || lado !== 0) {
          const comprimento = Math.hypot(frente, lado)
          const rumo = (guinada + (Math.atan2(lado, frente) * 180) / Math.PI + 360) % 360
          posicao = deslocar(posicao, rumo, metros * comprimento)
        }

        if (teclas.has('q')) guinada -= ROTACAO * delta
        if (teclas.has('e')) guinada += ROTACAO * delta
        guinada = ((guinada % 360) + 360) % 360

        if (teclas.has('c')) altura += VELOCIDADE_VERTICAL * delta
        if (teclas.has('z')) altura -= VELOCIDADE_VERTICAL * delta

        if (teclas.has('arrowup')) gimbalPitch += ROTACAO_GIMBAL * delta
        if (teclas.has('arrowdown')) gimbalPitch -= ROTACAO_GIMBAL * delta
        gimbalPitch = Math.max(-90, Math.min(45, gimbalPitch))

        if (teclas.has('arrowleft')) guinada = ((guinada - ROTACAO * delta) % 360 + 360) % 360
        if (teclas.has('arrowright')) guinada = ((guinada + ROTACAO * delta) % 360 + 360) % 360

        return { posicao, altura, guinada, gimbalPitch }
      })
    }

    pedido = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(pedido)
  }, [activo])

  return { activo, estado, arrancar, parar, colocar, gravar }
}
