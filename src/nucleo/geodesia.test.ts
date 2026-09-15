import { describe, it, expect } from 'vitest'
import type { LatLon } from './tipos.ts'
import {
  distancia,
  distancia3D,
  rumo,
  deslocar,
  amostrarSegmento,
  comprimento,
  paraASL,
  deASL,
  aslParaHae,
  haeParaAsl,
} from './geodesia.ts'

/**
 * Oraculo independente: Vincenty inverso sobre o elipsoide WGS84, precisao
 * submilimetrica. So existe no teste, para confirmar a aproximacao local usada
 * em producao. Formulacao de Vincenty (1975).
 */
function vincenty(p1: LatLon, p2: LatLon): number {
  const a = 6378137.0
  const f = 1 / 298.257223563
  const b = (1 - f) * a
  const rad = Math.PI / 180

  const L = (p2.lon - p1.lon) * rad
  const U1 = Math.atan((1 - f) * Math.tan(p1.lat * rad))
  const U2 = Math.atan((1 - f) * Math.tan(p2.lat * rad))
  const sinU1 = Math.sin(U1)
  const cosU1 = Math.cos(U1)
  const sinU2 = Math.sin(U2)
  const cosU2 = Math.cos(U2)

  let lambda = L
  let lambdaAnterior = 0
  let iteracoes = 0
  let sinSigma = 0
  let cosSigma = 0
  let sigma = 0
  let cos2SigmaM = 0
  let cosSqAlpha = 0

  do {
    const sinLambda = Math.sin(lambda)
    const cosLambda = Math.cos(lambda)
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    )
    if (sinSigma === 0) return 0
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSqAlpha = 1 - sinAlpha ** 2
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
    lambdaAnterior = lambda
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)))
  } while (Math.abs(lambda - lambdaAnterior) > 1e-12 && ++iteracoes < 200)

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)))

  return b * A * (sigma - deltaSigma)
}

// Coordenadas lidas do HUD do simulador do Pilot 2, rota de Sever do Vouga.
const WP67: LatLon = { lat: 40.74707639, lon: -8.4121861 }
const WP57: LatLon = { lat: 40.75179939, lon: -8.4049744 }
const WP54: LatLon = { lat: 40.751448, lon: -8.4066787 }
const DESCOLAGEM: LatLon = { lat: 40.746552, lon: -8.41061 }

describe('distancia', () => {
  it('concorda com Vincenty ao milimetro nos trocos de uma rota real', () => {
    const pares: Array<[LatLon, LatLon]> = [
      [WP67, WP57],
      [WP57, WP54],
      [DESCOLAGEM, WP67],
      [DESCOLAGEM, WP54],
    ]
    for (const [a, b] of pares) {
      expect(distancia(a, b)).toBeCloseTo(vincenty(a, b), 3)
    }
  })

  it('fica dentro de 1 ppm de Vincenty ate aos 10 km, em qualquer rumo', () => {
    const origem: LatLon = { lat: 40.75, lon: -8.41 }
    for (const rumoGraus of [0, 45, 90, 135, 180, 270, 315]) {
      for (const metros of [10, 100, 1000, 10000]) {
        const destino = deslocar(origem, rumoGraus, metros)
        const referencia = vincenty(origem, destino)
        const erroRelativo = Math.abs(distancia(origem, destino) - referencia) / referencia
        expect(erroRelativo).toBeLessThan(1e-6)
      }
    }
  })

  it('e zero para o mesmo ponto e e simetrica', () => {
    expect(distancia(WP67, WP67)).toBe(0)
    expect(distancia(WP67, WP57)).toBeCloseTo(distancia(WP57, WP67), 9)
  })
})

describe('deslocar e rumo', () => {
  it('sao inversos um do outro', () => {
    const origem: LatLon = { lat: 40.75, lon: -8.41 }
    for (const rumoGraus of [0, 30, 90, 180, 240, 359]) {
      const destino = deslocar(origem, rumoGraus, 500)
      expect(rumo(origem, destino)).toBeCloseTo(rumoGraus, 4)
      expect(distancia(origem, destino)).toBeCloseTo(500, 3)
    }
  })

  it('devolve rumos cardeais corretos', () => {
    const o: LatLon = { lat: 40.75, lon: -8.41 }
    expect(rumo(o, { lat: 40.76, lon: -8.41 })).toBeCloseTo(0, 6)
    expect(rumo(o, { lat: 40.75, lon: -8.4 })).toBeCloseTo(90, 6)
    expect(rumo(o, { lat: 40.74, lon: -8.41 })).toBeCloseTo(180, 6)
    expect(rumo(o, { lat: 40.75, lon: -8.42 })).toBeCloseTo(270, 6)
  })
})

describe('amostrarSegmento', () => {
  it('inclui as duas extremidades e respeita o passo maximo', () => {
    const pontos = amostrarSegmento(WP67, WP57, 10)
    expect(pontos[0]).toEqual(WP67)
    const ultimo = pontos.at(-1)
    expect(ultimo?.lat).toBeCloseTo(WP57.lat, 12)
    expect(ultimo?.lon).toBeCloseTo(WP57.lon, 12)
    for (let i = 1; i < pontos.length; i++) {
      const anterior = pontos[i - 1]
      const atual = pontos[i]
      if (!anterior || !atual) throw new Error('amostra em falta')
      expect(distancia(anterior, atual)).toBeLessThanOrEqual(10.0001)
    }
  })

  it('devolve as duas extremidades quando o segmento e mais curto que o passo', () => {
    expect(amostrarSegmento(WP57, WP54, 1000)).toHaveLength(2)
  })

  it('rejeita passo nao positivo', () => {
    expect(() => amostrarSegmento(WP67, WP57, 0)).toThrow()
  })
})

describe('comprimento', () => {
  it('soma os trocos e ignora listas com menos de dois pontos', () => {
    expect(comprimento([])).toBe(0)
    expect(comprimento([WP67])).toBe(0)
    expect(comprimento([WP67, WP57, WP54])).toBeCloseTo(
      distancia(WP67, WP57) + distancia(WP57, WP54),
      9,
    )
  })
})

describe('conversoes de altura', () => {
  /**
   * Numeros lidos no HUD do simulador, waypoint 54:
   * ALT 244 m, 605,6 m ASL, 311,9 m acima do solo.
   * Logo a descolagem esta a 361,6 m ASL e o terreno sob o waypoint a 293,7 m.
   */
  const ctx = { cotaDescolagem: 361.6, cotaTerreno: 293.7 }

  it('reproduz a leitura do waypoint 54 do simulador', () => {
    expect(paraASL(244, 'ALT', ctx)).toBeCloseTo(605.6, 6)
    expect(deASL(605.6, 'AGL', ctx)).toBeCloseTo(311.9, 6)
    expect(deASL(605.6, 'ALT', ctx)).toBeCloseTo(244, 6)
    expect(paraASL(311.9, 'AGL', ctx)).toBeCloseTo(605.6, 6)
  })

  it('e a identidade no modo ASL', () => {
    expect(paraASL(523, 'ASL', ctx)).toBe(523)
    expect(deASL(523, 'ASL', ctx)).toBe(523)
  })

  it('paraASL e deASL sao inversas nos tres modos', () => {
    for (const modo of ['ASL', 'ALT', 'AGL'] as const) {
      expect(deASL(paraASL(120, modo, ctx), modo, ctx)).toBeCloseTo(120, 9)
    }
  })

  /**
   * Ondulacao do geoide confirmada por tres leituras independentes do simulador
   * em Sever do Vouga. Ver docs/observacoes-pilot2-simulador.md.
   */
  const N = 55.6

  it('reproduz os pares ASL/HAE mostrados nos waypoints', () => {
    expect(aslParaHae(886.7, N)).toBeCloseTo(942.3, 6)
    expect(aslParaHae(647.3, N)).toBeCloseTo(702.9, 6)
    expect(haeParaAsl(344.3, N)).toBeCloseTo(288.7, 6)
    expect(haeParaAsl(445.7, N)).toBeCloseTo(390.1, 6)
  })

  it('confirma que o takeOffRefPoint do ficheiro de referencia e elipsoidal', () => {
    // takeOffRefPoint = 40.746552,-8.410610,417.225221
    // O HUD da a descolagem a 361,6 m ASL: 605,6 ASL menos 244 ALT.
    expect(haeParaAsl(417.225221, N)).toBeCloseTo(361.6, 1)
  })
})

describe('distancia3D', () => {
  it('combina afastamento horizontal e diferenca de altura', () => {
    const horizontal = distancia(WP67, WP57)
    expect(distancia3D(WP67, 100, WP57, 100)).toBeCloseTo(horizontal, 9)
    expect(distancia3D(WP67, 100, WP67, 150)).toBeCloseTo(50, 9)
    expect(distancia3D(WP67, 100, WP57, 150)).toBeCloseTo(Math.hypot(horizontal, 50), 9)
  })
})
