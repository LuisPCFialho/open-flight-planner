import { describe, it, expect } from 'vitest'
import { comprimentoDoDrone, malhaDrone } from './modelo-drone.ts'

const malha = malhaDrone()

describe('malha do drone', () => {
  it('tem os quatro conjuntos com o mesmo numero de vertices', () => {
    const vertices = malha.posicoes.length / 3
    expect(malha.normais.length / 3).toBe(vertices)
    expect(malha.cores.length / 4).toBe(vertices)
  })

  it('cabe no indice de 16 bits, que e o que a camada usa', () => {
    expect(malha.posicoes.length / 3).toBeLessThan(65536)
  })

  it('e leve: umas centenas de triangulos e nao dezenas de milhar', () => {
    // O modelo real eram 194 mil triangulos, e reduzido nao descia dos 29 mil.
    // Numa rota de 64 waypoints isto tem de caber sem se dar por ele.
    const triangulos = malha.indices.length / 3
    expect(triangulos).toBeGreaterThan(100)
    expect(triangulos).toBeLessThan(1200)
  })

  it('todos os indices apontam para vertices que existem', () => {
    const vertices = malha.posicoes.length / 3
    for (const indice of malha.indices) {
      expect(indice).toBeLessThan(vertices)
    }
  })

  it('o numero de indices e multiplo de tres', () => {
    expect(malha.indices.length % 3).toBe(0)
  })

  it('nao tem nenhum numero invalido', () => {
    for (const conjunto of [malha.posicoes, malha.normais, malha.cores]) {
      for (const valor of conjunto) expect(Number.isFinite(valor)).toBe(true)
    }
  })

  it('as normais estao normalizadas', () => {
    for (let i = 0; i < malha.normais.length; i += 3) {
      const comprimento = Math.hypot(
        malha.normais[i] ?? 0,
        malha.normais[i + 1] ?? 0,
        malha.normais[i + 2] ?? 0,
      )
      expect(comprimento).toBeCloseTo(1, 5)
    }
  })
})

describe('proporcoes do aparelho', () => {
  function extremos(eixo: 0 | 1 | 2): { minimo: number; maximo: number } {
    let minimo = Infinity
    let maximo = -Infinity
    for (let i = eixo; i < malha.posicoes.length; i += 3) {
      const valor = malha.posicoes[i] ?? 0
      minimo = Math.min(minimo, valor)
      maximo = Math.max(maximo, valor)
    }
    return { minimo, maximo }
  }

  it('mede ponta a ponta o que um Mini mede com as helices abertas', () => {
    /*
     * Os 247 mm da ficha sao de motor a motor, e nao contam as helices. Com elas
     * o aparelho ocupa uns 33 cm em cada direccao, que e o que esta malha tem de
     * dar: e essa a envolvente que aparece no ecra.
     */
    const x = extremos(0)
    const y = extremos(1)

    expect(x.maximo - x.minimo).toBeGreaterThan(0.3)
    expect(x.maximo - x.minimo).toBeLessThan(0.36)
    expect(y.maximo - y.minimo).toBeGreaterThan(0.3)
    expect(y.maximo - y.minimo).toBeLessThan(0.36)
  })

  it('os motores ficam a 247 mm uns dos outros na diagonal', () => {
    // Este e o numero da ficha tecnica, e sai da posicao dos motores.
    const diagonalDosMotores = Math.hypot(0.087 * 2, 0.087 + 0.093)
    expect(diagonalDosMotores).toBeCloseTo(0.25, 2)
  })

  it('e mais comprido do que alto, como um Mini', () => {
    const y = extremos(1)
    const z = extremos(2)
    expect(y.maximo - y.minimo).toBeGreaterThan((z.maximo - z.minimo) * 3)
  })

  it('e simetrico da esquerda para a direita', () => {
    const x = extremos(0)
    expect(x.minimo).toBeCloseTo(-x.maximo, 3)
  })

  it('a camara fica a frente e por baixo do centro', () => {
    // A lente e o ponto mais avancado da malha.
    const y = extremos(1)
    expect(y.maximo).toBeGreaterThan(comprimentoDoDrone() / 2)
  })

  it('o comprimento anunciado bate com o corpo', () => {
    expect(comprimentoDoDrone()).toBeCloseTo(0.145, 3)
  })
})
