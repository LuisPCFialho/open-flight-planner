import { describe, it, expect } from 'vitest'
import { encolherPaineis, LARGURA_APERTADA, MAPA_MINIMO } from './larguras.ts'

/**
 * A largura guardada e uma preferencia, e uma preferencia escolhida num ecra
 * grande nao serve num pequeno. O que se verifica aqui e que o aperto e
 * temporario: nao toca no que esta guardado, e desfaz-se sozinho quando ha
 * espaco outra vez.
 */

const ESCOLHIDAS = { esquerda: 240, direita: 300 }

describe('aperto dos paineis laterais', () => {
  it('com espaco de sobra, ninguem mexe em nada', () => {
    expect(encolherPaineis(1920, ESCOLHIDAS)).toEqual(ESCOLHIDAS)
  })

  it('mesmo no limite exacto ainda nao aperta', () => {
    const janela = ESCOLHIDAS.esquerda + ESCOLHIDAS.direita + MAPA_MINIMO
    expect(encolherPaineis(janela, ESCOLHIDAS)).toEqual(ESCOLHIDAS)
  })

  it('numa janela estreita o mapa fica com o minimo que lhe e devido', () => {
    // Era este o problema: a 900 sobravam 350 para o mapa.
    const largura = 900
    const apertadas = encolherPaineis(largura, ESCOLHIDAS)
    const mapa = largura - apertadas.esquerda - apertadas.direita

    expect(mapa).toBeGreaterThanOrEqual(MAPA_MINIMO)
  })

  it('aperta os dois, e nao so um', () => {
    const apertadas = encolherPaineis(900, ESCOLHIDAS)
    expect(apertadas.esquerda).toBeLessThan(ESCOLHIDAS.esquerda)
    expect(apertadas.direita).toBeLessThan(ESCOLHIDAS.direita)
  })

  it('o que estava mais largo continua mais largo', () => {
    // Apertar na mesma proporcao mantem a escolha de quem arrastou.
    const apertadas = encolherPaineis(900, ESCOLHIDAS)
    expect(apertadas.direita).toBeGreaterThan(apertadas.esquerda)
  })

  it('nenhum desce abaixo do minimo apertado', () => {
    for (const janela of [400, 600, 700, 800, 900, 1000, 1100]) {
      const apertadas = encolherPaineis(janela, ESCOLHIDAS)
      expect(apertadas.esquerda).toBeGreaterThanOrEqual(LARGURA_APERTADA)
      expect(apertadas.direita).toBeGreaterThanOrEqual(LARGURA_APERTADA)
    }
  })

  it('numa janela impossivel ficam os dois no minimo, sem esconder nenhum', () => {
    /*
     * Abaixo de certa largura nao ha arrumacao que salve. Esconder um painel
     * deixaria metade da ferramenta inalcancavel sem se perceber porque.
     */
    const apertadas = encolherPaineis(500, ESCOLHIDAS)
    expect(apertadas).toEqual({ esquerda: LARGURA_APERTADA, direita: LARGURA_APERTADA })
  })

  it('alargar a janela devolve a largura escolhida', () => {
    // O aperto e temporario: nao toca no que esta guardado.
    expect(encolherPaineis(900, ESCOLHIDAS)).not.toEqual(ESCOLHIDAS)
    expect(encolherPaineis(1600, ESCOLHIDAS)).toEqual(ESCOLHIDAS)
  })

  it('o aperto cresce a medida que a janela encolhe', () => {
    const larga = encolherPaineis(1100, ESCOLHIDAS)
    const estreita = encolherPaineis(900, ESCOLHIDAS)
    expect(estreita.esquerda).toBeLessThanOrEqual(larga.esquerda)
    expect(estreita.direita).toBeLessThanOrEqual(larga.direita)
  })

  it('paineis ja estreitos nao sao apertados sem necessidade', () => {
    const jaEstreitos = { esquerda: 170, direita: 180 }
    expect(encolherPaineis(1000, jaEstreitos)).toEqual(jaEstreitos)
  })

  it('devolve sempre numeros inteiros', () => {
    // Meia unidade numa coluna de grelha da uma linha de fundo a espreitar.
    const apertadas = encolherPaineis(937, { esquerda: 317, direita: 289 })
    expect(Number.isInteger(apertadas.esquerda)).toBe(true)
    expect(Number.isInteger(apertadas.direita)).toBe(true)
  })
})
