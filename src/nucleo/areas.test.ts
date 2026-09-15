import { describe, it, expect } from 'vitest'
import type { LatLon } from './tipos.ts'
import { deslocar } from './geodesia.ts'
import {
  areaDoContorno,
  centroDasAreas,
  centroDoContorno,
  contornoFechado,
  formatarArea,
  perimetroDoContorno,
} from './areas.ts'

const CANTO: LatLon = { lat: 40.746552, lon: -8.41061 }

/** Quadrado de `lado` metros, com o canto sudoeste em `CANTO`. */
function quadrado(lado: number): LatLon[] {
  const nordeste = deslocar(deslocar(CANTO, 0, lado), 90, lado)
  return [CANTO, deslocar(CANTO, 90, lado), nordeste, deslocar(CANTO, 0, lado)]
}

describe('area do contorno', () => {
  it('da um hectare para um quadrado de cem metros de lado', () => {
    expect(areaDoContorno(quadrado(100))).toBeCloseTo(10000, 0)
  })

  it('escala com o quadrado do lado', () => {
    expect(areaDoContorno(quadrado(300))).toBeCloseTo(90000, -1)
  })

  it('nao depende do sentido em que o contorno foi desenhado', () => {
    const horario = quadrado(150)
    const antiHorario = [...horario].reverse()
    expect(areaDoContorno(antiHorario)).toBeCloseTo(areaDoContorno(horario), 3)
  })

  it('da zero para contornos degenerados, em vez de rebentar', () => {
    expect(areaDoContorno([])).toBe(0)
    expect(areaDoContorno([CANTO])).toBe(0)
    expect(areaDoContorno([CANTO, deslocar(CANTO, 90, 100)])).toBe(0)
  })

  it('da zero para tres pontos em linha recta', () => {
    const alinhados = [CANTO, deslocar(CANTO, 90, 100), deslocar(CANTO, 90, 200)]
    expect(areaDoContorno(alinhados)).toBeCloseTo(0, 3)
  })

  it('e o dobro para um rectangulo com o dobro do comprimento', () => {
    const rectangulo = [
      CANTO,
      deslocar(CANTO, 90, 200),
      deslocar(deslocar(CANTO, 90, 200), 0, 100),
      deslocar(CANTO, 0, 100),
    ]
    expect(areaDoContorno(rectangulo)).toBeCloseTo(20000, -1)
  })
})

describe('perimetro', () => {
  it('fecha o contorno, contando o troco do ultimo ponto ao primeiro', () => {
    expect(perimetroDoContorno(quadrado(100))).toBeCloseTo(400, 0)
  })

  it('da zero com menos de dois pontos', () => {
    expect(perimetroDoContorno([])).toBe(0)
    expect(perimetroDoContorno([CANTO])).toBe(0)
  })
})

describe('centro', () => {
  it('fica a meio da envolvente do contorno', () => {
    const centro = centroDoContorno(quadrado(100))
    if (!centro) throw new Error('sem centro')

    // A meio de cem metros em cada direccao, ou seja a cerca de 70 m do canto.
    const meio = deslocar(deslocar(CANTO, 0, 50), 90, 50)
    expect(centro.lat).toBeCloseTo(meio.lat, 5)
    expect(centro.lon).toBeCloseTo(meio.lon, 5)
  })

  it('nao inventa centro para um contorno vazio', () => {
    expect(centroDoContorno([])).toBeNull()
    expect(centroDasAreas([])).toBeNull()
  })

  it('abrange todas as areas de uma vez', () => {
    const longe = deslocar(CANTO, 90, 1000)
    const centro = centroDasAreas([
      { id: 'a', nome: 'a', contorno: quadrado(100) },
      { id: 'b', nome: 'b', contorno: [longe, deslocar(longe, 90, 100), deslocar(longe, 0, 100)] },
    ])
    if (!centro) throw new Error('sem centro')
    expect(centro.lon).toBeGreaterThan(CANTO.lon)
    expect(centro.lon).toBeLessThan(longe.lon)
  })
})

describe('formatacao', () => {
  it('fala em hectares a partir de um hectare', () => {
    expect(formatarArea(10000)).toBe('1.00 ha')
    expect(formatarArea(125400)).toBe('12.54 ha')
  })

  it('fala em metros quadrados abaixo disso', () => {
    expect(formatarArea(850)).toBe('850 m2')
  })

  it('nao escreve NaN', () => {
    expect(formatarArea(Number.NaN)).toBe('--')
  })
})

describe('fecho do anel para desenho', () => {
  it('repete o primeiro ponto no fim', () => {
    const contorno = quadrado(100)
    const anel = contornoFechado(contorno)

    expect(anel).toHaveLength(contorno.length + 1)
    expect(anel.at(-1)).toEqual(anel[0])
  })

  it('nao devolve anel nenhum para contornos que nao fecham area', () => {
    // Um poligono sem anel fechado nao desenha, e sem aviso nenhum: mais vale
    // nao chegar a produzir a geometria.
    expect(contornoFechado([])).toEqual([])
    expect(contornoFechado([CANTO])).toEqual([])
    expect(contornoFechado([CANTO, deslocar(CANTO, 90, 10)])).toEqual([])
  })
})
