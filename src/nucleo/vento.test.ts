import { describe, expect, it } from 'vitest'
import {
  componentes,
  quadrante,
  SEM_VENTO,
  temVento,
  trocosComVento,
  velocidadeMaximaNoSolo,
  velocidadeNoArNecessaria,
  type Vento,
} from './vento.ts'
import type { LatLon } from './tipos.ts'

/*
 * Os casos aqui sao todos verificaveis de cabeca.
 *
 * Vento de norte a 10 contra quem voa para norte da 10 de frente, e contra quem
 * voa para leste da 10 de travessia. Nao ha aqui nenhum numero que tenha saido
 * do proprio codigo, que e a unica maneira de um teste destes servir para
 * alguma coisa.
 */

const NORTE_10: Vento = { velocidade: 10, rumo: 0 }

describe('componentes', () => {
  it('vento de norte contra quem voa para norte e todo de frente', () => {
    const { cauda, travessia } = componentes(0, NORTE_10)
    expect(cauda).toBeCloseTo(-10, 6)
    expect(travessia).toBeCloseTo(0, 6)
  })

  it('vento de norte a favor de quem voa para sul', () => {
    const { cauda, travessia } = componentes(180, NORTE_10)
    expect(cauda).toBeCloseTo(10, 6)
    expect(travessia).toBeCloseTo(0, 6)
  })

  it('vento de norte e todo de travessia para quem voa para leste', () => {
    const { cauda, travessia } = componentes(90, NORTE_10)
    expect(cauda).toBeCloseTo(0, 6)
    expect(travessia).toBeCloseTo(10, 6)
  })

  it('a 45 graus reparte-se em partes iguais', () => {
    const { cauda, travessia } = componentes(45, NORTE_10)
    const metade = 10 / Math.SQRT2
    expect(cauda).toBeCloseTo(-metade, 6)
    expect(travessia).toBeCloseTo(metade, 6)
  })

  it('o lado de onde vem a travessia nao muda o seu valor', () => {
    const deOeste = componentes(0, { velocidade: 6, rumo: 270 })
    const deLeste = componentes(0, { velocidade: 6, rumo: 90 })
    expect(deOeste.travessia).toBeCloseTo(deLeste.travessia, 6)
    expect(deOeste.travessia).toBeCloseTo(6, 6)
  })

  it('sem vento nao ha componente nenhuma, seja qual for o rumo', () => {
    for (const r of [0, 37, 90, 211, 359]) {
      const { cauda, travessia } = componentes(r, SEM_VENTO)
      expect(cauda).toBeCloseTo(0, 9)
      expect(travessia).toBeCloseTo(0, 9)
    }
  })
})

describe('velocidadeNoArNecessaria', () => {
  it('sem vento e a propria velocidade pedida', () => {
    expect(velocidadeNoArNecessaria(10, 123, SEM_VENTO)).toBeCloseTo(10, 9)
  })

  it('manter 10 no solo contra 8 de frente pede 18 no ar', () => {
    expect(velocidadeNoArNecessaria(10, 0, { velocidade: 8, rumo: 0 })).toBeCloseTo(18, 6)
  })

  it('com o vento pela cauda pede menos', () => {
    expect(velocidadeNoArNecessaria(10, 180, { velocidade: 8, rumo: 0 })).toBeCloseTo(2, 6)
  })

  it('so de travessia sai pelo triangulo rectangulo', () => {
    expect(velocidadeNoArNecessaria(4, 90, { velocidade: 3, rumo: 0 })).toBeCloseTo(5, 6)
  })
})

describe('velocidadeMaximaNoSolo', () => {
  it('sem vento e o proprio maximo no ar', () => {
    expect(velocidadeMaximaNoSolo(90, SEM_VENTO, 15)).toBeCloseTo(15, 9)
  })

  it('contra o vento perde-se exactamente o vento', () => {
    expect(velocidadeMaximaNoSolo(0, { velocidade: 6, rumo: 0 }, 15)).toBeCloseTo(9, 6)
  })

  it('com o vento ganha-se exactamente o vento', () => {
    expect(velocidadeMaximaNoSolo(180, { velocidade: 6, rumo: 0 }, 15)).toBeCloseTo(21, 6)
  })

  it('so de travessia sai pelo triangulo rectangulo', () => {
    expect(velocidadeMaximaNoSolo(90, { velocidade: 3, rumo: 0 }, 5)).toBeCloseTo(4, 6)
  })

  it('travessia maior do que o maximo no ar nao tem solucao', () => {
    expect(velocidadeMaximaNoSolo(90, { velocidade: 16, rumo: 0 }, 15)).toBeNull()
  })

  it('vento de frente maior do que o maximo no ar nao tem solucao', () => {
    expect(velocidadeMaximaNoSolo(0, { velocidade: 16, rumo: 0 }, 15)).toBeNull()
  })

  /*
   * O que a rota realmente faz: ida e volta pela mesma linha. O que se ganha a
   * favor nao paga o que se perde contra, mas o tempo de cada troco continua a
   * sair da velocidade que se conseguiu, e nao de uma media.
   */
  it('ida e volta no mesmo eixo sao simetricas em torno do maximo', () => {
    const contra = velocidadeMaximaNoSolo(0, { velocidade: 4, rumo: 0 }, 15)
    const aFavor = velocidadeMaximaNoSolo(180, { velocidade: 4, rumo: 0 }, 15)
    expect(contra).not.toBeNull()
    expect(aFavor).not.toBeNull()
    expect((contra! + aFavor!) / 2).toBeCloseTo(15, 6)
  })
})

describe('trocosComVento', () => {
  /* Um quadrado de cem metros de lado, a comecar para norte. */
  const quadrado: LatLon[] = [
    { lat: 40, lon: -8 },
    { lat: 40.0009, lon: -8 },
    { lat: 40.0009, lon: -7.99883 },
    { lat: 40, lon: -7.99883 },
  ]

  it('sem vento nenhum troco fica abaixo da velocidade pedida', () => {
    const trocos = trocosComVento(quadrado, () => 10, SEM_VENTO, 15)
    expect(trocos).toHaveLength(3)
    for (const t of trocos) {
      expect(t.conseguida).toBeCloseTo(10, 6)
      expect(t.noAr).toBeCloseTo(10, 6)
    }
  })

  /*
   * Com folga de sobra, o vento nao tira velocidade nenhuma a rota - que e o
   * ponto de todo este modulo. Pede-se 8 no solo com 15 de maximo, e nem o
   * troco que vai contra 5 m/s de vento fica mais lento.
   */
  it('com folga no ar, o vento nao atrasa troco nenhum', () => {
    const trocos = trocosComVento(quadrado, () => 8, { velocidade: 5, rumo: 0 }, 15)
    for (const t of trocos) expect(t.conseguida).toBeCloseTo(8, 6)
  })

  it('sem folga, so o troco contra o vento e que perde', () => {
    const trocos = trocosComVento(quadrado, () => 14, { velocidade: 5, rumo: 0 }, 15)
    const paraNorte = trocos[0]!
    expect(paraNorte.frente).toBeCloseTo(5, 6)
    expect(paraNorte.conseguida).toBeCloseTo(10, 6)
    /* O troco para leste so apanha travessia, e ainda lhe sobra velocidade. */
    const paraLeste = trocos[1]!
    expect(paraLeste.conseguida).toBeCloseTo(14, 6)
  })

  it('o rumo que nao se mantem sai a null e nao a zero', () => {
    const trocos = trocosComVento(quadrado, () => 10, { velocidade: 20, rumo: 0 }, 15)
    expect(trocos[0]!.conseguida).toBeNull()
  })

  it('um percurso de um ponto so nao tem trocos', () => {
    expect(trocosComVento([{ lat: 40, lon: -8 }], () => 10, NORTE_10, 15)).toEqual([])
  })
})

describe('temVento', () => {
  it('vento parado nao e vento', () => {
    expect(temVento(SEM_VENTO)).toBe(false)
    expect(temVento(undefined)).toBe(false)
    expect(temVento(NORTE_10)).toBe(true)
  })
})

describe('quadrante', () => {
  it('escreve o rumo como um boletim o escreve', () => {
    expect(quadrante(0)).toBe('N')
    expect(quadrante(90)).toBe('E')
    expect(quadrante(180)).toBe('S')
    expect(quadrante(270)).toBe('O')
    expect(quadrante(45)).toBe('NE')
    expect(quadrante(315)).toBe('NO')
  })

  it('arredonda ao quadrante mais proximo e da a volta em 360', () => {
    expect(quadrante(20)).toBe('N')
    expect(quadrante(25)).toBe('NE')
    expect(quadrante(359)).toBe('N')
    expect(quadrante(360)).toBe('N')
    expect(quadrante(-45)).toBe('NO')
  })
})
