import { describe, it, expect } from 'vitest'
import {
  arrastoDeOrientacao,
  GRAUS_INCLINACAO_POR_PIXEL,
  GRAUS_RUMO_POR_PIXEL,
  orientacaoAposArrasto,
} from './navegacao.ts'

const LIMITES = { minima: 0, maxima: 85 }
const PARADO = { rumo: 0, inclinacao: 0 }

describe('que arrasto conduz a orientacao', () => {
  it('o botao do meio, como no Earth', () => {
    expect(arrastoDeOrientacao({ button: 1, shiftKey: false })).toBe(true)
  })

  it('Shift com o botao esquerdo, em vez da caixa de zoom', () => {
    expect(arrastoDeOrientacao({ button: 0, shiftKey: true })).toBe(true)
  })

  it('o botao esquerdo sozinho desloca o mapa, e nao roda', () => {
    expect(arrastoDeOrientacao({ button: 0, shiftKey: false })).toBe(false)
  })

  it('o botao direito fica para o MapLibre, que ja o trata como o Earth', () => {
    expect(arrastoDeOrientacao({ button: 2, shiftKey: false })).toBe(false)
  })
})

describe('orientacao apos arrasto', () => {
  it('arrastar para cima inclina para a rasante', () => {
    const depois = orientacaoAposArrasto({ rumo: 0, inclinacao: 20 }, 0, -50, LIMITES)
    expect(depois.inclinacao).toBeCloseTo(20 + 50 * GRAUS_INCLINACAO_POR_PIXEL, 6)
    expect(depois.rumo).toBeCloseTo(0, 6)
  })

  it('arrastar para baixo volta a por a vista a prumo', () => {
    const depois = orientacaoAposArrasto({ rumo: 0, inclinacao: 60 }, 0, 50, LIMITES)
    expect(depois.inclinacao).toBeCloseTo(60 - 50 * GRAUS_INCLINACAO_POR_PIXEL, 6)
  })

  it('arrastar para o lado roda', () => {
    const depois = orientacaoAposArrasto(PARADO, 100, 0, LIMITES)
    expect(depois.rumo).toBeCloseTo(100 * GRAUS_RUMO_POR_PIXEL, 6)
  })

  it('nao passa dos limites de inclinacao do mapa', () => {
    expect(orientacaoAposArrasto(PARADO, 0, -10000, LIMITES).inclinacao).toBe(85)
    expect(orientacaoAposArrasto({ rumo: 0, inclinacao: 60 }, 0, 10000, LIMITES).inclinacao).toBe(0)
  })

  it('o rumo da a volta pelo zero em vez de crescer sem fim', () => {
    const depois = orientacaoAposArrasto({ rumo: 350, inclinacao: 0 }, 100, 0, LIMITES)
    expect(depois.rumo).toBeGreaterThanOrEqual(0)
    expect(depois.rumo).toBeLessThan(360)
    expect(depois.rumo).toBeCloseTo((350 + 40) % 360, 6)
  })

  it('tambem da a volta para tras', () => {
    const depois = orientacaoAposArrasto({ rumo: 10, inclinacao: 0 }, -100, 0, LIMITES)
    expect(depois.rumo).toBeCloseTo(330, 6)
  })

  it('um arrasto nulo nao mexe em nada', () => {
    const inicial = { rumo: 137, inclinacao: 42 }
    expect(orientacaoAposArrasto(inicial, 0, 0, LIMITES)).toEqual(inicial)
  })
})
