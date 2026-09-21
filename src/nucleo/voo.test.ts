import { describe, it, expect } from 'vitest'
import { distancia, rumo as rumoEntre } from './geodesia.ts'
import {
  ACELERACAO,
  apontarGimbal,
  atitudeDaAceleracao,
  avancarVoo,
  FACTOR_FINO,
  GRAVIDADE,
  PARADO,
  ROTACAO,
  ROTACAO_GIMBAL,
  rodarAeronave,
  VELOCIDADE,
  type EstadoVoo,
  type Movimento,
} from './voo.ts'

const INICIAL: EstadoVoo = {
  posicao: { lat: 40.746552, lon: -8.41061 },
  altura: 60,
  guinada: 0,
  gimbalPitch: -30,
  gimbalYaw: 0,
}

const teclas = (...lista: string[]): ReadonlySet<string> => new Set(lista)

/** Um passo a partir do repouso, que e o que a maioria destes casos quer. */
function passo(
  estado: EstadoVoo,
  lista: string[],
  delta: number,
  opcoes: { velocidade?: number } = {},
) {
  return avancarVoo(estado, PARADO, teclas(...lista), delta, opcoes)
}

/**
 * Voa `segundos` a sessenta fotogramas por segundo.
 *
 * Preciso porque a aeronave ja nao anda a velocidade de cruzeiro no primeiro
 * fotograma: acelera ate la. Quem quer ver o regime permanente tem de deixar
 * passar tempo, como na realidade.
 */
function voar(
  estado: EstadoVoo,
  lista: string[],
  segundos: number,
  inicio: Movimento = PARADO,
): { estado: EstadoVoo; movimento: Movimento } {
  const dt = 1 / 60
  let e = estado
  let m = inicio
  for (let t = 0; t < segundos - 1e-9; t += dt) {
    const r = avancarVoo(e, m, teclas(...lista), dt)
    e = r.estado
    m = r.movimento
  }
  return { estado: e, movimento: m }
}

const rapidez = (m: Movimento): number => Math.hypot(m.leste, m.norte)

describe('comandos da camara', () => {
  it('as setas da esquerda e da direita rodam o gimbal, nao a aeronave', () => {
    // Rodavam a aeronave, o mesmo que Q e E, e o gimbal nao tinha comando
    // nenhum apesar de o `gimbalYaw` ir para dentro do ficheiro.
    const direita = passo(INICIAL, ['arrowright'], 1).estado
    expect(direita.gimbalYaw).toBeCloseTo(ROTACAO_GIMBAL, 6)
    expect(direita.guinada).toBeCloseTo(INICIAL.guinada, 6)

    const esquerda = passo(INICIAL, ['arrowleft'], 1).estado
    expect(esquerda.gimbalYaw).toBeCloseTo(-ROTACAO_GIMBAL, 6)
    expect(esquerda.guinada).toBeCloseTo(INICIAL.guinada, 6)
  })

  it('as setas de cima e de baixo inclinam o gimbal', () => {
    expect(passo(INICIAL, ['arrowup'], 1).estado.gimbalPitch).toBeCloseTo(
      INICIAL.gimbalPitch + ROTACAO_GIMBAL,
      6,
    )
    expect(passo(INICIAL, ['arrowdown'], 0.5).estado.gimbalPitch).toBeCloseTo(
      INICIAL.gimbalPitch - ROTACAO_GIMBAL / 2,
      6,
    )
  })

  it('Q e E rodam a aeronave e deixam o gimbal quieto', () => {
    const e = passo(INICIAL, ['e'], 1).estado
    expect(e.guinada).toBeCloseTo(ROTACAO, 6)
    expect(e.gimbalYaw).toBeCloseTo(0, 6)

    const q = passo(INICIAL, ['q'], 1).estado
    expect(q.guinada).toBeCloseTo(360 - ROTACAO, 6)
  })

  it('nao deixa o gimbal passar dos limites', () => {
    expect(passo(INICIAL, ['arrowdown'], 100).estado.gimbalPitch).toBe(-90)
    expect(passo(INICIAL, ['arrowup'], 100).estado.gimbalPitch).toBe(45)
    expect(passo(INICIAL, ['arrowright'], 100).estado.gimbalYaw).toBe(90)
    expect(passo(INICIAL, ['arrowleft'], 100).estado.gimbalYaw).toBe(-90)
  })

  it('o rumo da aeronave da a volta pelo zero', () => {
    const quase = passo({ ...INICIAL, guinada: 350 }, ['e'], 1).estado
    expect(quase.guinada).toBeCloseTo((350 + ROTACAO) % 360, 6)
    expect(quase.guinada).toBeLessThan(360)
  })
})

describe('ajuste fino com Alt', () => {
  it('abranda a rotacao do gimbal na mesma proporcao', () => {
    const normal = passo(INICIAL, ['arrowright'], 1).estado
    const fino = passo(INICIAL, ['arrowright', 'alt'], 1).estado
    expect(fino.gimbalYaw).toBeCloseTo(normal.gimbalYaw * FACTOR_FINO, 6)
  })

  it('abranda a velocidade de cruzeiro na mesma proporcao', () => {
    const normal = voar(INICIAL, ['w'], 6).movimento
    const fino = voar(INICIAL, ['w', 'alt'], 6).movimento
    expect(rapidez(fino)).toBeCloseTo(rapidez(normal) * FACTOR_FINO, 3)
  })

  it('abranda a subida', () => {
    const subiu = passo(INICIAL, ['c', 'alt'], 1).estado.altura - INICIAL.altura
    expect(subiu).toBeCloseTo(10 * FACTOR_FINO, 6)
  })
})

describe('deslocacao', () => {
  it('W leva a aeronave para onde ela aponta', () => {
    const virada: EstadoVoo = { ...INICIAL, guinada: 90 }
    const depois = voar(virada, ['w'], 4)

    expect(rumoEntre(virada.posicao, depois.estado.posicao)).toBeCloseTo(90, 1)
    expect(rapidez(depois.movimento)).toBeCloseTo(VELOCIDADE, 3)
  })

  it('D desloca para a direita do nariz', () => {
    const depois = voar(INICIAL, ['d'], 4)
    expect(rumoEntre(INICIAL.posicao, depois.estado.posicao)).toBeCloseTo(90, 1)
  })

  it('a diagonal nao e mais rapida do que a direito', () => {
    // O comprimento do vector das teclas servia de factor, e em diagonal vale
    // raiz de dois: W e D juntos andavam 41% mais do que W sozinho.
    const aDireito = voar(INICIAL, ['w'], 4)
    const emDiagonal = voar(INICIAL, ['w', 'd'], 4)

    expect(rapidez(emDiagonal.movimento)).toBeCloseTo(rapidez(aDireito.movimento), 3)
    expect(rumoEntre(INICIAL.posicao, emDiagonal.estado.posicao)).toBeCloseTo(45, 1)
  })

  it('teclas opostas anulam-se em vez de somarem', () => {
    const parado = voar(INICIAL, ['w', 's'], 2)
    expect(distancia(INICIAL.posicao, parado.estado.posicao)).toBeCloseTo(0, 6)
    expect(rapidez(parado.movimento)).toBeCloseTo(0, 9)
  })
})

describe('inercia', () => {
  /*
   * Sem inercia nao ha aceleracao de onde tirar a inclinacao - havia so
   * velocidade a ligar e a desligar. E e a inercia que faz o voo parecer voo.
   */
  it('no primeiro fotograma a aeronave ainda nao vai a velocidade de cruzeiro', () => {
    const um = avancarVoo(INICIAL, PARADO, teclas('w'), 1 / 60)
    expect(rapidez(um.movimento)).toBeCloseTo(ACELERACAO / 60, 9)
    expect(rapidez(um.movimento)).toBeLessThan(VELOCIDADE)
  })

  it('chega a velocidade de cruzeiro no tempo que a aceleracao diz', () => {
    const esperado = VELOCIDADE / ACELERACAO
    const antes = voar(INICIAL, ['w'], esperado * 0.7)
    const depois = voar(INICIAL, ['w'], esperado * 1.5)

    expect(rapidez(antes.movimento)).toBeLessThan(VELOCIDADE - 1)
    expect(rapidez(depois.movimento)).toBeCloseTo(VELOCIDADE, 6)
  })

  it('nunca passa da velocidade pedida, por muito que se insista', () => {
    expect(rapidez(voar(INICIAL, ['w'], 30).movimento)).toBeCloseTo(VELOCIDADE, 6)
  })

  it('largar o comando trava em vez de parar a seco', () => {
    const aVoar = voar(INICIAL, ['w'], 4)
    const aTravar = voar(aVoar.estado, [], 0.5, aVoar.movimento)

    expect(rapidez(aTravar.movimento)).toBeLessThan(rapidez(aVoar.movimento))
    expect(rapidez(aTravar.movimento)).toBeGreaterThan(0)
  })

  it('acaba mesmo por parar, e fica direita', () => {
    const aVoar = voar(INICIAL, ['w'], 4)
    const parada = voar(aVoar.estado, [], 5, aVoar.movimento)

    expect(rapidez(parada.movimento)).toBeCloseTo(0, 6)
    expect(parada.movimento.inclinacao).toBeCloseTo(0, 6)
    expect(parada.movimento.rolamento).toBeCloseTo(0, 6)
  })

  /*
   * A velocidade esta no referencial do terreno, e por isso rodar a meio de uma
   * deslocacao nao muda para onde ela vai. A aeronave passa a andar de lado
   * enquanto a velocidade nao acompanha o novo rumo - que e o que um multirotor
   * faz mesmo, e o que faz o voo virtual deixar de parecer um cursor.
   */
  it('rodar a meio do caminho nao vira a velocidade de repente', () => {
    const aVoar = voar(INICIAL, ['w'], 4)
    const rodada = rodarAeronave(aVoar.estado, 90)
    const logoASeguir = avancarVoo(rodada, aVoar.movimento, teclas('w'), 1 / 60)

    // Ia para norte; um sexagesimo de segundo depois ainda vai quase para norte.
    const direccao = (Math.atan2(logoASeguir.movimento.leste, logoASeguir.movimento.norte) * 180) / Math.PI
    expect(Math.abs(direccao)).toBeLessThan(5)
  })
})

describe('a atitude sai da aceleracao', () => {
  /*
   * `tan(θ) = a/g`, e nada mais. Uma aceleracao igual a gravidade da quarenta e
   * cinco graus - e esse caso verifica-se de cabeca.
   */
  it('acelerar tanto como a gravidade inclina quarenta e cinco graus', () => {
    const { inclinacao } = atitudeDaAceleracao(0, GRAVIDADE, 0)
    expect(inclinacao).toBeCloseTo(-45, 6)
  })

  it('acelerar em frente baixa o nariz', () => {
    // Guinada zero e norte; acelerar para norte e acelerar em frente.
    expect(atitudeDaAceleracao(0, 5, 0).inclinacao).toBeLessThan(0)
    expect(atitudeDaAceleracao(0, 5, 0).rolamento).toBeCloseTo(0, 9)
  })

  it('travar levanta o nariz', () => {
    expect(atitudeDaAceleracao(0, -5, 0).inclinacao).toBeGreaterThan(0)
  })

  it('acelerar para a direita inclina para a direita', () => {
    // A voar para norte, a direita e leste.
    expect(atitudeDaAceleracao(5, 0, 0).rolamento).toBeGreaterThan(0)
    expect(atitudeDaAceleracao(5, 0, 0).inclinacao).toBeCloseTo(0, 9)
  })

  it('acompanha o rumo da aeronave', () => {
    // A apontar a leste, acelerar para leste e acelerar em frente.
    const paraLeste = atitudeDaAceleracao(5, 0, 90)
    expect(paraLeste.inclinacao).toBeLessThan(0)
    expect(paraLeste.rolamento).toBeCloseTo(0, 6)
  })

  it('sem aceleracao nenhuma a aeronave esta direita', () => {
    expect(atitudeDaAceleracao(0, 0, 37)).toEqual({ inclinacao: -0, rolamento: 0 })
  })

  /*
   * A velocidade constante um multirotor mantem o nariz um pouco em baixo para
   * vencer a resistencia do ar. Isso nao se modela aqui: exigiria uma curva de
   * arrasto que a DJI nao publica, e um valor inventado tem ar de calculado.
   * Este teste fixa a escolha, para nao parecer um esquecimento.
   */
  it('em cruzeiro a aeronave fica direita, e isso e uma escolha', () => {
    const cruzeiro = voar(INICIAL, ['w'], 6)
    expect(rapidez(cruzeiro.movimento)).toBeCloseTo(VELOCIDADE, 6)
    expect(cruzeiro.movimento.inclinacao).toBeCloseTo(0, 6)
  })

  it('a arrancar, o nariz vai mesmo abaixo do horizonte', () => {
    const aArrancar = voar(INICIAL, ['w'], 0.5)
    expect(aArrancar.movimento.inclinacao).toBeCloseTo(
      (-Math.atan2(ACELERACAO, GRAVIDADE) * 180) / Math.PI,
      6,
    )
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
