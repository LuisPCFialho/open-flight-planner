import { describe, it, expect } from 'vitest'
import { distancia, rumo as rumoEntre } from './geodesia.ts'
import {
  apontarGimbal,
  avancarVoo,
  FACTOR_FINO,
  ROTACAO,
  ROTACAO_GIMBAL,
  rodarAeronave,
  VELOCIDADE,
  type EstadoVoo,
} from './voo.ts'

const INICIAL: EstadoVoo = {
  posicao: { lat: 40.746552, lon: -8.41061 },
  altura: 60,
  guinada: 0,
  gimbalPitch: -30,
  gimbalYaw: 0,
}

const teclas = (...lista: string[]): ReadonlySet<string> => new Set(lista)

describe('comandos da camara', () => {
  it('as setas da esquerda e da direita rodam o gimbal, nao a aeronave', () => {
    // Rodavam a aeronave, o mesmo que Q e E, e o gimbal nao tinha comando
    // nenhum apesar de o `gimbalYaw` ir para dentro do ficheiro.
    const direita = avancarVoo(INICIAL, teclas('arrowright'), 1)
    expect(direita.gimbalYaw).toBeCloseTo(ROTACAO_GIMBAL, 6)
    expect(direita.guinada).toBeCloseTo(INICIAL.guinada, 6)

    const esquerda = avancarVoo(INICIAL, teclas('arrowleft'), 1)
    expect(esquerda.gimbalYaw).toBeCloseTo(-ROTACAO_GIMBAL, 6)
    expect(esquerda.guinada).toBeCloseTo(INICIAL.guinada, 6)
  })

  it('as setas de cima e de baixo inclinam o gimbal', () => {
    expect(avancarVoo(INICIAL, teclas('arrowup'), 1).gimbalPitch).toBeCloseTo(
      INICIAL.gimbalPitch + ROTACAO_GIMBAL,
      6,
    )
    expect(avancarVoo(INICIAL, teclas('arrowdown'), 0.5).gimbalPitch).toBeCloseTo(
      INICIAL.gimbalPitch - ROTACAO_GIMBAL / 2,
      6,
    )
  })

  it('Q e E rodam a aeronave e deixam o gimbal quieto', () => {
    const e = avancarVoo(INICIAL, teclas('e'), 1)
    expect(e.guinada).toBeCloseTo(ROTACAO, 6)
    expect(e.gimbalYaw).toBeCloseTo(0, 6)

    const q = avancarVoo(INICIAL, teclas('q'), 1)
    expect(q.guinada).toBeCloseTo(360 - ROTACAO, 6)
  })

  it('nao deixa o gimbal passar dos limites', () => {
    const paraBaixo = avancarVoo(INICIAL, teclas('arrowdown'), 100)
    expect(paraBaixo.gimbalPitch).toBe(-90)

    const paraCima = avancarVoo(INICIAL, teclas('arrowup'), 100)
    expect(paraCima.gimbalPitch).toBe(45)

    expect(avancarVoo(INICIAL, teclas('arrowright'), 100).gimbalYaw).toBe(90)
    expect(avancarVoo(INICIAL, teclas('arrowleft'), 100).gimbalYaw).toBe(-90)
  })

  it('o rumo da aeronave da a volta pelo zero', () => {
    const quase = avancarVoo({ ...INICIAL, guinada: 350 }, teclas('e'), 1)
    expect(quase.guinada).toBeCloseTo((350 + ROTACAO) % 360, 6)
    expect(quase.guinada).toBeLessThan(360)
  })
})

describe('ajuste fino com Alt', () => {
  it('abranda a rotacao do gimbal na mesma proporcao', () => {
    const normal = avancarVoo(INICIAL, teclas('arrowright'), 1)
    const fino = avancarVoo(INICIAL, teclas('arrowright', 'alt'), 1)
    expect(fino.gimbalYaw).toBeCloseTo(normal.gimbalYaw * FACTOR_FINO, 6)
  })

  it('abranda tambem a translacao e a subida', () => {
    const normal = avancarVoo(INICIAL, teclas('w'), 1)
    const fino = avancarVoo(INICIAL, teclas('w', 'alt'), 1)

    const andouNormal = distancia(INICIAL.posicao, normal.posicao)
    const andouFino = distancia(INICIAL.posicao, fino.posicao)
    expect(andouFino).toBeCloseTo(andouNormal * FACTOR_FINO, 3)

    const subiu = avancarVoo(INICIAL, teclas('c', 'alt'), 1).altura - INICIAL.altura
    expect(subiu).toBeCloseTo(10 * FACTOR_FINO, 6)
  })
})

describe('deslocacao', () => {
  it('W leva a aeronave para onde ela aponta', () => {
    const virada: EstadoVoo = { ...INICIAL, guinada: 90 }
    const depois = avancarVoo(virada, teclas('w'), 1)

    expect(distancia(virada.posicao, depois.posicao)).toBeCloseTo(VELOCIDADE, 2)
    expect(rumoEntre(virada.posicao, depois.posicao)).toBeCloseTo(90, 1)
  })

  it('D desloca para a direita do nariz', () => {
    const depois = avancarVoo(INICIAL, teclas('d'), 1)
    expect(rumoEntre(INICIAL.posicao, depois.posicao)).toBeCloseTo(90, 1)
  })

  it('a diagonal nao e mais rapida do que a direito', () => {
    // O comprimento do vector das teclas servia de factor, e em diagonal vale
    // raiz de dois: W e D juntos andavam 41% mais do que W sozinho.
    const aDireito = avancarVoo(INICIAL, teclas('w'), 1)
    const emDiagonal = avancarVoo(INICIAL, teclas('w', 'd'), 1)

    expect(distancia(INICIAL.posicao, emDiagonal.posicao)).toBeCloseTo(
      distancia(INICIAL.posicao, aDireito.posicao),
      2,
    )
    // E continua a ir mesmo na diagonal, a 45 graus do nariz.
    expect(rumoEntre(INICIAL.posicao, emDiagonal.posicao)).toBeCloseTo(45, 1)
  })

  it('teclas opostas anulam-se em vez de somarem', () => {
    const parado = avancarVoo(INICIAL, teclas('w', 's'), 1)
    expect(distancia(INICIAL.posicao, parado.posicao)).toBeCloseTo(0, 6)
  })
})

describe('apontar o gimbal por incrementos', () => {
  it('soma os deltas e respeita os mesmos limites', () => {
    const apontado = apontarGimbal(INICIAL, -15, 25)
    expect(apontado.gimbalPitch).toBeCloseTo(-45, 6)
    expect(apontado.gimbalYaw).toBeCloseTo(25, 6)

    expect(apontarGimbal(INICIAL, -1000, 1000)).toMatchObject({
      gimbalPitch: -90,
      gimbalYaw: 90,
    })
  })

  it('nao mexe na posicao nem no rumo da aeronave', () => {
    const apontado = apontarGimbal(INICIAL, -10, 10)
    expect(apontado.posicao).toEqual(INICIAL.posicao)
    expect(apontado.guinada).toBe(INICIAL.guinada)
    expect(apontado.altura).toBe(INICIAL.altura)
  })
})

describe('rodar a aeronave com o rato', () => {
  /*
   * Arrastar na vista de camara rodava o gimbal, e o gimbal esta limitado a um
   * quarto de volta para cada lado: a partir dai arrastar nao fazia nada e o
   * aparelho no mapa nunca se via virar. Quem pilotava concluia que o modelo
   * nao rodava - rodava, mas so com o Q e o E.
   */
  const parado: EstadoVoo = {
    posicao: { lat: 40.75, lon: -8.41 },
    altura: 60,
    guinada: 0,
    gimbalPitch: -30,
    gimbalYaw: 0,
  }

  it('soma o angulo ao rumo', () => {
    expect(rodarAeronave(parado, 35).guinada).toBeCloseTo(35, 6)
  })

  it('nao tem limite: a aeronave da voltas completas', () => {
    expect(rodarAeronave({ ...parado, guinada: 350 }, 20).guinada).toBeCloseTo(10, 6)
    expect(rodarAeronave({ ...parado, guinada: 10 }, -20).guinada).toBeCloseTo(350, 6)
  })

  it('nao toca no gimbal: a rotacao em relacao ao nariz e outra coisa', () => {
    const rodado = rodarAeronave({ ...parado, gimbalYaw: -80 }, 45)
    expect(rodado.gimbalYaw).toBe(-80)
    expect(rodado.gimbalPitch).toBe(-30)
  })

  it('nao mexe a aeronave de sitio', () => {
    expect(rodarAeronave(parado, 90).posicao).toEqual(parado.posicao)
    expect(rodarAeronave(parado, 90).altura).toBe(60)
  })
})
