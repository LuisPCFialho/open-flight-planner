import { describe, it, expect } from 'vitest'
import { deslocar } from './geodesia.ts'
import { formatarDistancia, medir } from './medicao.ts'

const ORIGEM = { lat: 40.746552, lon: -8.41061 }

describe('regua', () => {
  it('sem pontos nao mede nada', () => {
    const m = medir([])
    expect(m.distancia).toBe(0)
    expect(m.ultimoTroco).toBe(0)
    expect(m.area).toBeNull()
  })

  it('um ponto ainda nao e uma medida', () => {
    expect(medir([ORIGEM]).distancia).toBe(0)
  })

  it('dois pontos dao a distancia entre eles', () => {
    const m = medir([ORIGEM, deslocar(ORIGEM, 90, 250)])
    expect(m.distancia).toBeCloseTo(250, 0)
    expect(m.ultimoTroco).toBeCloseTo(250, 0)
  })

  it('a distancia acumula ao longo da linha quebrada', () => {
    const a = ORIGEM
    const b = deslocar(a, 90, 100)
    const c = deslocar(b, 0, 150)
    expect(medir([a, b, c]).distancia).toBeCloseTo(250, 0)
  })

  it('o ultimo troco e so o que se acabou de medir', () => {
    const a = ORIGEM
    const b = deslocar(a, 90, 100)
    const c = deslocar(b, 0, 150)
    expect(medir([a, b, c]).ultimoTroco).toBeCloseTo(150, 0)
  })

  it('com dois pontos nao ha area, e nao ha area zero', () => {
    // Zero daria a entender que a area e nula; o que se passa e que nao existe.
    expect(medir([ORIGEM, deslocar(ORIGEM, 90, 100)]).area).toBeNull()
  })

  it('um quadrado de cem metros de lado da um hectare', () => {
    const a = ORIGEM
    const b = deslocar(a, 90, 100)
    const c = deslocar(b, 0, 100)
    const d = deslocar(a, 0, 100)
    const area = medir([a, b, c, d]).area ?? 0
    expect(area).toBeGreaterThan(9900)
    expect(area).toBeLessThan(10100)
  })

  it('a area nao depende do sentido em que se marca', () => {
    const a = ORIGEM
    const b = deslocar(a, 90, 100)
    const c = deslocar(b, 0, 100)
    const d = deslocar(a, 0, 100)
    expect(medir([a, b, c, d]).area).toBeCloseTo(medir([d, c, b, a]).area ?? 0, 3)
  })

  it('devolve os pontos que recebeu', () => {
    const pontos = [ORIGEM, deslocar(ORIGEM, 45, 30)]
    expect(medir(pontos).pontos).toBe(pontos)
  })
})

describe('formatar distancias', () => {
  it('em metros ate ao quilometro', () => {
    expect(formatarDistancia(0)).toBe('0.0 m')
    expect(formatarDistancia(247.34)).toBe('247.3 m')
    expect(formatarDistancia(999.9)).toBe('999.9 m')
  })

  it('em quilometros a partir do quilometro', () => {
    expect(formatarDistancia(1000)).toBe('1.000 km')
    expect(formatarDistancia(18338)).toBe('18.338 km')
  })
})
