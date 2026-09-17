import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Rota } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { useReplay } from './useReplay.ts'

/**
 * O leitor que percorre a rota no tempo.
 *
 * O relogio anda num ciclo de animacao, e por isso os testes trazem o seu
 * proprio: sem ele, ou se esperava por fotogramas verdadeiros - que numa janela
 * tapada sao travados a um por segundo - ou nao se verificava o relogio de todo,
 * que e a parte que interessa.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Uma rota para leste, com duracao suficiente para se andar la dentro. */
function rota(quantos = 4): Rota {
  let r = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  r = { ...r, velocidadeGlobal: 10 }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    r = acrescentarWaypoint(r, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, 200)
  }
  return r
}

/**
 * Um ciclo de animacao com manivela.
 *
 * `avancar(ms)` entrega um fotograma com o tempo que se pedir, em vez de
 * esperar pelo ecra.
 */
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
    temFotogramaPendente: () => proximo !== null,
  }
}

let relogio: ReturnType<typeof relogioDeManivela>

beforeEach(() => {
  relogio = relogioDeManivela()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('leitor da rota', () => {
  it('nasce fechado e parado', () => {
    const { result } = renderHook(() => useReplay(rota()))
    expect(result.current.activo).toBe(false)
    expect(result.current.aCorrer).toBe(false)
    expect(result.current.estado).toBeNull()
  })

  it('sem rota nao ha duracao nem estado', () => {
    const { result } = renderHook(() => useReplay(null))
    expect(result.current.duracao).toBe(0)
    expect(result.current.estado).toBeNull()
  })

  it('a duracao sai da rota', () => {
    const { result } = renderHook(() => useReplay(rota()))
    expect(result.current.duracao).toBeGreaterThan(0)
  })

  it('abrir comeca do principio e ja a andar', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())

    expect(result.current.activo).toBe(true)
    expect(result.current.aCorrer).toBe(true)
    expect(result.current.instante).toBe(0)
    expect(result.current.estado).not.toBeNull()
  })

  it('fechar para e deixa de haver estado', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    act(() => result.current.fechar())

    expect(result.current.activo).toBe(false)
    expect(result.current.aCorrer).toBe(false)
    expect(result.current.estado).toBeNull()
  })

  it('o relogio anda em segundos de voo', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())

    relogio.avancar(100)
    relogio.avancar(100)

    // Dois decimos de segundo de parede, a velocidade normal, sao dois de voo.
    expect(result.current.instante).toBeCloseTo(0.2, 3)
  })

  it('o multiplicador decide quantos segundos de voo passam por segundo de parede', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    act(() => result.current.mudarVelocidade(10))

    relogio.avancar(100)
    expect(result.current.instante).toBeCloseTo(1, 3)
  })

  it('um salto grande nao atira a aeronave para o fim', () => {
    /*
     * Acontece a mudar de separador: o ciclo de animacao para, e o primeiro
     * fotograma a seguir traz minutos de diferenca. Sem tecto, a aeronave
     * aparecia no fim da rota sem ter percorrido nada.
     */
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())

    relogio.avancar(60_000)
    expect(result.current.instante).toBeLessThanOrEqual(0.25)
  })

  it('parado, o relogio nao anda', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    act(() => result.current.alternar())
    const parado = result.current.instante

    relogio.avancar(500)
    expect(result.current.instante).toBe(parado)
  })

  it('chegar ao fim para sozinho, sem passar alem da duracao', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    act(() => result.current.mudarVelocidade(50))

    for (let i = 0; i < 200 && result.current.aCorrer; i++) relogio.avancar(200)

    expect(result.current.aCorrer).toBe(false)
    expect(result.current.instante).toBeCloseTo(result.current.duracao, 6)
  })

  it('reproduzir no fim volta ao principio', () => {
    /*
     * Sem isto, o botao ficava a piscar sem nada acontecer.
     *
     * A rota ao chegar ao fim para sozinha, e so a partir dai e que carregar em
     * reproduzir rebobina - com ela ainda a andar, o botao e uma pausa e mais
     * nada. Por isso o ensaio leva dois toques: o primeiro para, o segundo
     * volta ao principio.
     */
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    act(() => result.current.irPara(result.current.duracao))

    act(() => result.current.alternar())
    expect(result.current.aCorrer).toBe(false)
    expect(result.current.instante).toBeCloseTo(result.current.duracao, 6)

    act(() => result.current.alternar())
    expect(result.current.instante).toBe(0)
    expect(result.current.aCorrer).toBe(true)
  })

  it('a barra de posicao nao sai dos limites', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())

    act(() => result.current.irPara(-50))
    expect(result.current.instante).toBe(0)

    act(() => result.current.irPara(1e6))
    expect(result.current.instante).toBe(result.current.duracao)
  })

  it('uma velocidade impossivel e recusada', () => {
    // Zero parava o relogio sem o botao dizer que estava parado.
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.mudarVelocidade(0))
    expect(result.current.velocidade).toBe(1)

    act(() => result.current.mudarVelocidade(-4))
    expect(result.current.velocidade).toBe(1)
  })

  it('a aeronave avanca na rota a medida que o relogio anda', () => {
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    const partida = result.current.estado?.posicao

    act(() => result.current.irPara(result.current.duracao / 2))
    const meio = result.current.estado?.posicao

    expect(meio?.lon).not.toBeCloseTo(partida?.lon ?? 0, 6)
  })

  it('fechar larga o ciclo de animacao', () => {
    // Um ciclo que nao se solta continua a pedir fotogramas para sempre.
    const { result } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    relogio.avancar(100)
    expect(relogio.temFotogramaPendente()).toBe(true)

    act(() => result.current.fechar())
    expect(relogio.temFotogramaPendente()).toBe(false)
  })

  it('desmontar tambem', () => {
    const { result, unmount } = renderHook(() => useReplay(rota()))
    act(() => result.current.abrir())
    relogio.avancar(100)

    unmount()
    expect(relogio.temFotogramaPendente()).toBe(false)
  })
})
