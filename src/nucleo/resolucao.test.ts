import { describe, it, expect } from 'vitest'
import type { Camara } from './tipos.ts'
import { larguraCoberta } from './cobertura.ts'
import { alturaParaResolucao, pixeisNaLargura, resolucaoNoTerreno } from './resolucao.ts'

/**
 * Centimetros de terreno por pixel.
 *
 * E este o numero que um caderno de encargos escreve, e nao a altura de voo. Os
 * ensaios fecham o circulo: a altura que sai para uma resolucao pedida tem de
 * dar de volta essa resolucao.
 */

/** Mini 5 Pro: 50 MP em 4:3, campo de visao de 84 graus. */
const MINI: Camara = { temZoom: false, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 50 }

describe('pixeis na largura do sensor', () => {
  it('cinquenta megapixeis em 4:3 dao 8165 de largura', () => {
    expect(pixeisNaLargura(MINI)).toBe(8165)
  })

  it('a largura vezes a altura volta a dar os megapixeis', () => {
    const largura = pixeisNaLargura(MINI) as number
    const altura = largura / (4 / 3)
    expect((largura * altura) / 1e6).toBeCloseTo(50, 0)
  })

  /*
   * A maior parte dos aparelhos desta lista nao traz megapixeis. Vale mais nao
   * dizer nada do que dizer um numero inventado - e a mesma regra do resto do
   * projecto.
   */
  it('sem megapixeis nao se inventa resolucao nenhuma', () => {
    expect(pixeisNaLargura({ temZoom: false, proporcao: 4 / 3 })).toBeNull()
    expect(pixeisNaLargura({ temZoom: false, megapixeis: 50 })).toBeNull()
    expect(pixeisNaLargura({ temZoom: false, megapixeis: 0, proporcao: 4 / 3 })).toBeNull()
  })
})

describe('resolucao no terreno', () => {
  it('a oitenta metros, o Mini 5 Pro da cerca de 1,8 cm por pixel', () => {
    const faixa = larguraCoberta(80, 84)
    expect(resolucaoNoTerreno(MINI, faixa)).toBeCloseTo(1.8, 1)
  })

  it('metade da altura da metade dos centimetros por pixel', () => {
    const alta = resolucaoNoTerreno(MINI, larguraCoberta(80, 84)) as number
    const baixa = resolucaoNoTerreno(MINI, larguraCoberta(40, 84)) as number
    expect(baixa).toBeCloseTo(alta / 2, 6)
  })

  it('sem faixa nao ha resolucao', () => {
    expect(resolucaoNoTerreno(MINI, 0)).toBeNull()
  })
})

describe('altura para a resolucao pedida', () => {
  it('fecha o circulo: a altura que sai devolve a resolucao que se pediu', () => {
    for (const pedida of [1, 1.5, 2, 3.5]) {
      const altura = alturaParaResolucao(MINI, pedida, 84) as number
      expect(resolucaoNoTerreno(MINI, larguraCoberta(altura, 84))).toBeCloseTo(pedida, 6)
    }
  })

  it('pedir o dobro da resolucao manda voar a metade da altura', () => {
    const fina = alturaParaResolucao(MINI, 1, 84) as number
    const grosseira = alturaParaResolucao(MINI, 2, 84) as number
    expect(grosseira).toBeCloseTo(fina * 2, 6)
  })

  it('sem megapixeis, ou com pedidos sem sentido, nao devolve nada', () => {
    expect(alturaParaResolucao({ temZoom: false }, 2, 84)).toBeNull()
    expect(alturaParaResolucao(MINI, 0, 84)).toBeNull()
    expect(alturaParaResolucao(MINI, 2, 0)).toBeNull()
    expect(alturaParaResolucao(MINI, 2, 180)).toBeNull()
  })
})
