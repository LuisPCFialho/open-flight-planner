import { describe, it, expect } from 'vitest'
import { AMBAR, VERDE, VERMELHO, corDoTroco, corPorAlturaAcimaDoSolo } from './cores-rota.ts'

const INTERVALO = { minimo: 30, maximo: 120 }

/**
 * Compara cores com tolerancia.
 *
 * Nas pontas a mistura chega a 0,9999999999999998 e nao a 1, que e o que a
 * aritmetica de virgula flutuante da. A cor e a mesma; o `toEqual` e que nao.
 */
function ehCor(obtida: readonly number[], esperada: readonly number[]): void {
  for (const [i, canal] of esperada.entries()) {
    expect(obtida[i]).toBeCloseTo(canal, 6)
  }
}

describe('cor pela altura acima do solo', () => {
  it('abaixo do minimo e vermelho', () => {
    expect(corPorAlturaAcimaDoSolo(12, INTERVALO)).toEqual(VERMELHO)
  })

  it('acima do tecto e vermelho', () => {
    expect(corPorAlturaAcimaDoSolo(180, INTERVALO)).toEqual(VERMELHO)
  })

  it('a meio do intervalo e verde', () => {
    expect(corPorAlturaAcimaDoSolo(75, INTERVALO)).toEqual(VERDE)
  })

  it('no limite de baixo e ambar, e nao verde', () => {
    // Estar legal por um metro nao se pode ler igual a estar folgado.
    ehCor(corPorAlturaAcimaDoSolo(30, INTERVALO), AMBAR)
  })

  it('no limite de cima e ambar', () => {
    ehCor(corPorAlturaAcimaDoSolo(120, INTERVALO), AMBAR)
  })

  it('o limite inferior ainda conta como dentro', () => {
    expect(corPorAlturaAcimaDoSolo(30, INTERVALO)).not.toEqual(VERMELHO)
    expect(corPorAlturaAcimaDoSolo(29.99, INTERVALO)).toEqual(VERMELHO)
  })

  it('a passagem de ambar a verde e continua', () => {
    // Um degrau de cor a meio do intervalo lia-se como um problema que nao ha.
    let anterior = corPorAlturaAcimaDoSolo(30, INTERVALO)
    for (let agl = 30.5; agl <= 120; agl += 0.5) {
      const agora = corPorAlturaAcimaDoSolo(agl, INTERVALO)
      const salto = Math.max(
        Math.abs(agora[0] - anterior[0]),
        Math.abs(agora[1] - anterior[1]),
        Math.abs(agora[2] - anterior[2]),
      )
      expect(salto).toBeLessThan(0.05)
      anterior = agora
    }
  })

  it('sem cota do terreno nao se finge que esta bom', () => {
    expect(corPorAlturaAcimaDoSolo(null, INTERVALO)).toEqual(AMBAR)
    expect(corPorAlturaAcimaDoSolo(NaN, INTERVALO)).toEqual(AMBAR)
  })

  it('um intervalo sem largura nao rebenta na divisao', () => {
    const cor = corPorAlturaAcimaDoSolo(60, { minimo: 60, maximo: 60 })
    expect(cor.every((c) => Number.isFinite(c))).toBe(true)
  })

  it('devolve sempre cor opaca e dentro da gama', () => {
    for (const agl of [-10, 0, 30, 45, 75, 110, 120, 500]) {
      const cor = corPorAlturaAcimaDoSolo(agl, INTERVALO)
      expect(cor[3]).toBe(1)
      for (const canal of cor) {
        expect(canal).toBeGreaterThanOrEqual(0)
        expect(canal).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('cor de um troco', () => {
  it('vale o pior dos dois extremos', () => {
    expect(corDoTroco(75, 10, INTERVALO)).toEqual(VERMELHO)
    expect(corDoTroco(10, 75, INTERVALO)).toEqual(VERMELHO)
  })

  it('dois extremos folgados dao verde', () => {
    expect(corDoTroco(70, 80, INTERVALO)).toEqual(VERDE)
  })

  it('um extremo junto ao limite tinge o troco inteiro', () => {
    expect(corDoTroco(75, 31, INTERVALO)).not.toEqual(VERDE)
  })

  it('uma cota em falta num extremo chega para avisar', () => {
    expect(corDoTroco(75, null, INTERVALO)).toEqual(AMBAR)
  })
})
