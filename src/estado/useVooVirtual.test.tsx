import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useVooVirtual, type EstadoVoo } from './useVooVirtual.ts'

/**
 * Pilotar a aeronave pelo mapa e gravar o waypoint com a atitude em que ela
 * esta.
 *
 * O que aqui se parte sem dar erro sao as teclas: uma que fica presa deixa a
 * aeronave a andar sozinha, e uma que comanda enquanto se escreve o nome da
 * rota grava waypoints que ninguem pediu.
 */

const PARTIDA: EstadoVoo = {
  posicao: { lat: 40.746552, lon: -8.41061 },
  altura: 60,
  guinada: 0,
  gimbalPitch: -30,
  gimbalYaw: 0,
}

/** Ciclo de animacao com manivela, para o movimento nao depender do ecra. */
function relogioDeManivela() {
  let agora = 0
  let proximo: ((tempo: number) => void) | null = null

  vi.stubGlobal('requestAnimationFrame', (chamada: (tempo: number) => void) => {
    proximo = chamada
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    proximo = null
  })
  vi.spyOn(performance, 'now').mockImplementation(() => agora)

  return {
    avancar(ms: number) {
      agora += ms
      const chamada = proximo
      proximo = null
      if (chamada) act(() => chamada(agora))
    },
  }
}

let relogio: ReturnType<typeof relogioDeManivela>
let aoGravarWaypoint: ReturnType<typeof vi.fn<(estado: EstadoVoo) => void>>
let aoInserirFoto: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  relogio = relogioDeManivela()
  aoGravarWaypoint = vi.fn<(estado: EstadoVoo) => void>()
  aoInserirFoto = vi.fn<() => void>()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function montar() {
  return renderHook(() => useVooVirtual({ aoGravarWaypoint, aoInserirFoto }))
}

/** Uma tecla premida na janela, com os modificadores que se pedirem. */
function teclar(tecla: string, extras: Partial<KeyboardEventInit> = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: tecla, bubbles: true, ...extras }))
  })
}

function largar(tecla: string): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: tecla, bubbles: true }))
  })
}

describe('voo virtual', () => {
  it('nasce desligado', () => {
    const { result } = montar()
    expect(result.current.activo).toBe(false)
  })

  it('arranca no sitio e com a atitude que se lhe da', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    expect(result.current.activo).toBe(true)
    expect(result.current.estado.posicao).toEqual(PARTIDA.posicao)
    expect(result.current.estado.gimbalPitch).toBe(-30)
  })

  it('desligado, o teclado nao comanda nada', () => {
    // As mesmas teclas servem a edicao quando nao se esta a voar.
    const { result } = montar()
    const antes = result.current.estado.posicao

    teclar('w')
    relogio.avancar(100)
    relogio.avancar(100)

    expect(result.current.estado.posicao).toEqual(antes)
  })

  it('uma tecla de movimento desloca a aeronave', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    teclar('w')
    relogio.avancar(100)
    relogio.avancar(100)

    expect(result.current.estado.posicao).not.toEqual(PARTIDA.posicao)
  })

  it('largar a tecla para a aeronave', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    teclar('w')
    relogio.avancar(100)
    largar('w')
    const parou = result.current.estado.posicao

    relogio.avancar(300)
    expect(result.current.estado.posicao).toEqual(parou)
  })

  it('perder o foco larga as teclas todas', () => {
    /*
     * Sem isto as teclas ficavam presas: bastava mudar de janela a meio de um
     * movimento para a aeronave continuar a andar sozinha, e so parava quando
     * se voltasse e se carregasse na mesma tecla outra vez.
     */
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    teclar('w')
    relogio.avancar(100)
    act(() => void window.dispatchEvent(new Event('blur')))
    const parou = result.current.estado.posicao

    relogio.avancar(300)
    expect(result.current.estado.posicao).toEqual(parou)
  })

  it('Shift e espaco gravam um waypoint, e um so', () => {
    /*
     * Ja gravou dois de cada vez. O React chama os updaters duas vezes em modo
     * estrito, e gravar de dentro de um deles duplicava o waypoint - por isso a
     * atitude vive num ref e a gravacao acontece fora.
     */
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', shiftKey: true, bubbles: true }),
      )
    })

    expect(aoGravarWaypoint).toHaveBeenCalledTimes(1)
    expect(aoGravarWaypoint.mock.calls[0]?.[0]).toMatchObject({ altura: 60, gimbalPitch: -30 })
  })

  it('Shift e F pedem uma foto no ultimo waypoint gravado', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    teclar('F', { shiftKey: true })
    expect(aoInserirFoto).toHaveBeenCalledTimes(1)
  })

  it('Escape sai do voo', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    teclar('Escape')

    expect(result.current.activo).toBe(false)
  })

  it('sair do voo larga as teclas que estivessem premidas', () => {
    // Senao, ao voltar a entrar a aeronave partia logo a andar.
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    teclar('w')
    act(() => result.current.parar())

    act(() => result.current.arrancar(PARTIDA))
    const partida = result.current.estado.posicao
    relogio.avancar(200)

    expect(result.current.estado.posicao).toEqual(partida)
  })

  it('escrever num campo nao pilota', () => {
    /*
     * As teclas de voo sao letras. Sem esta guarda, escrever "Sever do Vouga" no
     * nome da rota fazia a aeronave andar e gravava waypoints pelo caminho.
     */
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    const campo = document.createElement('input')
    document.body.appendChild(campo)
    act(() => {
      campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))
    })
    relogio.avancar(200)

    expect(result.current.estado.posicao).toEqual(PARTIDA.posicao)
    campo.remove()
  })

  it('R recentra o gimbal', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    act(() => result.current.apontar(0, 40))
    expect(result.current.estado.gimbalYaw).not.toBe(0)

    teclar('r')
    expect(result.current.estado.gimbalYaw).toBe(0)
  })

  it('apontar o gimbal fica preso aos limites', () => {
    // Um gimbal que se vira mais do que o real mostrava o que a foto nao apanha.
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    act(() => result.current.apontar(-500, 500))

    expect(result.current.estado.gimbalPitch).toBeGreaterThanOrEqual(-90)
    expect(Math.abs(result.current.estado.gimbalYaw)).toBeLessThanOrEqual(90)
  })

  it('mais e menos mudam a velocidade de reconhecimento', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    const inicial = result.current.velocidade

    teclar('+')
    expect(result.current.velocidade).toBeGreaterThan(inicial)

    teclar('-')
    teclar('-')
    expect(result.current.velocidade).toBeLessThan(inicial)
  })

  it('a velocidade nunca chega a zero', () => {
    // A zero a aeronave nao anda e o comando parece avariado.
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    for (let i = 0; i < 40; i++) teclar('-')

    expect(result.current.velocidade).toBeGreaterThan(0)
  })

  it('o mapa pode colocar a aeronave sem passar pelo teclado', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))

    const novo = { lat: 41, lon: -8 }
    act(() => result.current.colocar(novo))
    expect(result.current.estado.posicao).toEqual(novo)
  })

  it('gravar a pedido usa a atitude do momento', () => {
    const { result } = montar()
    act(() => result.current.arrancar(PARTIDA))
    act(() => result.current.apontar(-20, 0))
    act(() => result.current.gravar())

    const gravado = aoGravarWaypoint.mock.calls[0]?.[0] as EstadoVoo
    expect(gravado.gimbalPitch).toBeCloseTo(result.current.estado.gimbalPitch, 6)
  })

  it('desmontar deixa de ouvir o teclado', () => {
    const { result, unmount } = montar()
    act(() => result.current.arrancar(PARTIDA))
    unmount()

    teclar('F', { shiftKey: true })
    expect(aoInserirFoto).not.toHaveBeenCalled()
  })
})
