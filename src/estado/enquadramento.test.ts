import { describe, it, expect } from 'vitest'
import { azimuteDaCamara } from './useEnquadramento.ts'

/**
 * O `gimbalHeadingYawBase` dos ficheiros reais e `aircraft`: a rotacao do gimbal
 * conta-se a partir do nariz da aeronave, nao do norte.
 */
describe('azimute da camara', () => {
  it('soma a rotacao do gimbal ao rumo da aeronave', () => {
    expect(azimuteDaCamara({ guinada: 90, gimbalYaw: 30 })).toBeCloseTo(120, 6)
  })

  it('e o proprio rumo com o gimbal a olhar em frente', () => {
    expect(azimuteDaCamara({ guinada: 217.5, gimbalYaw: 0 })).toBeCloseTo(217.5, 6)
  })

  it('da a volta pelo zero em vez de passar dos 360', () => {
    expect(azimuteDaCamara({ guinada: 350, gimbalYaw: 30 })).toBeCloseTo(20, 6)
  })

  it('da a volta tambem para tras do zero', () => {
    expect(azimuteDaCamara({ guinada: 10, gimbalYaw: -40 })).toBeCloseTo(330, 6)
  })
})
