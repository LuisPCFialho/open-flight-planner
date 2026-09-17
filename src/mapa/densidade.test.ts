import { describe, it, expect } from 'vitest'
import type { LatLon } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { espacamentoTipico, marcadoresDensos, metrosPorPixel } from './densidade.ts'

/**
 * Quando os marcadores numerados deixam de caber.
 *
 * A conta decide se o mapa mostra numeros ou pontos, e e facil de enganar: uma
 * media em vez da mediana dizia que ha espaco de sobra numa rota de cobertura,
 * que e exactamente o caso em que nao ha.
 */

const PARTIDA = { lat: 40.746552, lon: -8.41061 }

/** Uma fila de waypoints igualmente espacados, a leste. */
function fila(quantos: number, metros: number): LatLon[] {
  const pontos: LatLon[] = [PARTIDA]
  for (let i = 1; i < quantos; i++) {
    const anterior = pontos[i - 1]
    if (anterior) pontos.push(deslocar(anterior, 90, metros))
  }
  return pontos
}

describe('espacamento tipico', () => {
  it('sem dois waypoints nao ha espacamento nenhum', () => {
    expect(espacamentoTipico([])).toBeNull()
    expect(espacamentoTipico([PARTIDA])).toBeNull()
  })

  it('numa fila regular e o proprio passo', () => {
    expect(espacamentoTipico(fila(6, 40))).toBeCloseTo(40, 0)
  })

  /*
   * O caso que justifica a mediana. Uma rota de cobertura sao dezenas de saltos
   * curtos entre fotos e meia duzia de transicoes longas entre passagens: a
   * media deixa-se puxar pelas longas e conclui que ha espaco de sobra.
   */
  it('nao se deixa puxar por meia duzia de saltos longos', () => {
    const pontos = fila(20, 20)
    const ultimo = pontos[pontos.length - 1]
    if (ultimo) pontos.push(deslocar(ultimo, 90, 2000))

    expect(espacamentoTipico(pontos)).toBeCloseTo(20, 0)
  })

  it('com dois saltos, e a media dos dois', () => {
    const pontos = [PARTIDA, deslocar(PARTIDA, 90, 30)]
    const segundo = pontos[1]
    if (segundo) pontos.push(deslocar(segundo, 90, 50))

    expect(espacamentoTipico(pontos)).toBeCloseTo(40, 0)
  })
})

describe('metros por pixel', () => {
  it('diminui para metade a cada nivel de zoom', () => {
    const a = metrosPorPixel(40, 14)
    const b = metrosPorPixel(40, 15)
    expect(b).toBeCloseTo(a / 2, 6)
  })

  it('encolhe com a latitude, como a projeccao manda', () => {
    expect(metrosPorPixel(60, 14)).toBeLessThan(metrosPorPixel(0, 14))
  })
})

describe('marcadores densos', () => {
  it('uma rota de cobertura vista de longe conta como densa', () => {
    // Vinte metros entre fotos, a um zoom em que cada pixel vale uns 2,4 m.
    expect(marcadoresDensos(fila(50, 20), PARTIDA.lat, 15)).toBe(true)
  })

  it('a mesma rota de perto ja nao e densa: aproximar devolve os numeros', () => {
    expect(marcadoresDensos(fila(50, 20), PARTIDA.lat, 19)).toBe(false)
  })

  it('uma rota de inspeccao com waypoints afastados nunca e densa', () => {
    expect(marcadoresDensos(fila(8, 300), PARTIDA.lat, 15)).toBe(false)
  })

  it('sem waypoints que cheguem, nao ha densidade nenhuma a declarar', () => {
    expect(marcadoresDensos([], PARTIDA.lat, 15)).toBe(false)
    expect(marcadoresDensos([PARTIDA], PARTIDA.lat, 15)).toBe(false)
  })
})
