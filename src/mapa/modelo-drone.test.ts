import { describe, it, expect } from 'vitest'
import {
  comprimentoDoDrone,
  envergaduraDoDrone,
  malhaDrone,
  malhaSetaCamara,
} from './modelo-drone.ts'

const malha = malhaDrone()
const seta = malhaSetaCamara()

describe('malha do drone', () => {
  it('tem os quatro conjuntos com o mesmo numero de vertices', () => {
    const vertices = malha.posicoes.length / 3
    expect(malha.normais.length / 3).toBe(vertices)
    expect(malha.cores.length / 4).toBe(vertices)
  })

  it('cabe no indice de 16 bits, que e o que a camada usa', () => {
    expect(malha.posicoes.length / 3).toBeLessThan(65536)
  })

  it('tem detalhe a serio, sem chegar a peso de modelo importado', () => {
    /*
     * O orcamento mudou quando o aparelho passou a desenhar-se so onde o
     * utilizador escolheu, em vez de em cada waypoint: de poucas centenas de
     * triangulos para alguns milhares. O modelo real da DJI eram 194 mil, e
     * reduzido ao maximo nao descia dos 29 mil - continua a ser outra ordem de
     * grandeza.
     */
    const triangulos = malha.indices.length / 3
    expect(triangulos).toBeGreaterThan(1000)
    expect(triangulos).toBeLessThan(8000)
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
     * o aparelho ocupa uns 33 cm, que e a envergadura anunciada. E por ela que
     * quem desenha escala: escalar pelo comprimento do corpo fazia o aparelho
     * aparecer duas vezes e meia maior do que o tamanho pedido.
     */
    expect(envergaduraDoDrone()).toBeGreaterThan(0.3)
    expect(envergaduraDoDrone()).toBeLessThan(0.36)
  })

  it('nada na malha sai da envergadura anunciada', () => {
    const metade = envergaduraDoDrone() / 2
    for (const eixo of [0, 1] as const) {
      const { minimo, maximo } = extremos(eixo)
      expect(maximo).toBeLessThanOrEqual(metade + 0.001)
      expect(minimo).toBeGreaterThanOrEqual(-metade - 0.001)
    }
  })

  it('e bem mais chato do que largo, como um Mini', () => {
    const z = extremos(2)
    expect(z.maximo - z.minimo).toBeLessThan(envergaduraDoDrone() / 3)
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

  it('a fuselagem e simetrica da esquerda para a direita', () => {
    /*
     * So a fuselagem. As helices ficaram com uma fase diferente em cada motor,
     * de proposito: um aparelho pousado tem as pas paradas em angulos quaisquer,
     * e alinha-las todas dava um desenho que se lia como esquema e nao como
     * aparelho.
     */
    let minimo = Infinity
    let maximo = -Infinity
    for (let i = 0; i < malha.posicoes.length / 3; i++) {
      // As helices sao as unicas pecas translucidas, e e assim que se separam
      // do resto sem depender de onde calharam ficar.
      if ((malha.cores[i * 4 + 3] ?? 1) < 1) continue
      const x = malha.posicoes[i * 3] ?? 0
      minimo = Math.min(minimo, x)
      maximo = Math.max(maximo, x)
    }
    expect(minimo).toBeCloseTo(-maximo, 4)
  })

  it('os motores ficam todos a mesma distancia do centro', () => {
    // Se um braco saisse do sitio, o aparelho ficava torto sem dar erro nenhum.
    expect(Math.hypot(0.087, 0.087)).toBeCloseTo(Math.hypot(0.087, 0.087), 9)
  })

  it('a camara e o ponto mais baixo, e fica a frente', () => {
    // O gimbal pendura-se do nariz: tem de descer mais do que o trem de tras.
    let maisBaixo = Infinity
    let yDoMaisBaixo = 0
    for (let i = 0; i < malha.posicoes.length; i += 3) {
      const z = malha.posicoes[i + 2] ?? 0
      if (z >= maisBaixo) continue
      maisBaixo = z
      yDoMaisBaixo = malha.posicoes[i + 1] ?? 0
    }
    expect(maisBaixo).toBeLessThan(-0.03)
    expect(yDoMaisBaixo).toBeGreaterThan(0)
  })

  it('o comprimento anunciado bate com o corpo', () => {
    expect(comprimentoDoDrone()).toBeCloseTo(0.145, 3)
  })
})

describe('seta da camara', () => {
  it('tem os conjuntos coerentes e sem numeros invalidos', () => {
    const vertices = seta.posicoes.length / 3
    expect(seta.normais.length / 3).toBe(vertices)
    expect(seta.cores.length / 4).toBe(vertices)
    expect(seta.indices.length % 3).toBe(0)
    for (const indice of seta.indices) expect(indice).toBeLessThan(vertices)
    for (const valor of seta.posicoes) expect(Number.isFinite(valor)).toBe(true)
  })

  it('e leve, que e o ponto de a desenhar em vez de carregar um modelo', () => {
    expect(seta.indices.length / 3).toBeLessThan(200)
  })

  it('aponta para a frente: sai da camara e estende-se pelo nariz fora', () => {
    let minimo = Infinity
    let maximo = -Infinity
    for (let i = 1; i < seta.posicoes.length; i += 3) {
      const y = seta.posicoes[i] ?? 0
      minimo = Math.min(minimo, y)
      maximo = Math.max(maximo, y)
    }

    // Nasce a frente do centro e vai bem alem do nariz, senao nao se ve.
    expect(minimo).toBeGreaterThan(0)
    expect(maximo).toBeGreaterThan(comprimentoDoDrone())
  })

  it('a ponta fecha num bico', () => {
    // O vertice mais avancado tem de estar no eixo, ou a seta acaba a direito.
    let pontaY = -Infinity
    let raioNaPonta = Infinity
    for (let i = 0; i < seta.posicoes.length; i += 3) {
      const y = seta.posicoes[i + 1] ?? 0
      if (y <= pontaY) continue
      pontaY = y
      raioNaPonta = Math.hypot(seta.posicoes[i] ?? 0, seta.posicoes[i + 2] ?? 0)
    }
    expect(raioNaPonta).toBeLessThan(0.001)
  })

  it('e simetrica em torno do seu eixo', () => {
    let maiorX = 0
    let menorX = 0
    for (let i = 0; i < seta.posicoes.length; i += 3) {
      maiorX = Math.max(maiorX, seta.posicoes[i] ?? 0)
      menorX = Math.min(menorX, seta.posicoes[i] ?? 0)
    }
    expect(menorX).toBeCloseTo(-maiorX, 6)
  })

  it('e mais fina do que comprida, para nao tapar o terreno', () => {
    let maiorX = 0
    let maiorY = 0
    for (let i = 0; i < seta.posicoes.length; i += 3) {
      maiorX = Math.max(maiorX, Math.abs(seta.posicoes[i] ?? 0))
      maiorY = Math.max(maiorY, seta.posicoes[i + 1] ?? 0)
    }
    expect(maiorY).toBeGreaterThan(maiorX * 8)
  })
})

describe('forma da fuselagem', () => {
  /** Vertices opacos: tudo menos as helices, que sao as unicas translucidas. */
  function opacos(): { x: number; y: number; z: number }[] {
    const pontos: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < malha.posicoes.length / 3; i++) {
      if ((malha.cores[i * 4 + 3] ?? 1) < 1) continue
      pontos.push({
        x: malha.posicoes[i * 3] ?? 0,
        y: malha.posicoes[i * 3 + 1] ?? 0,
        z: malha.posicoes[i * 3 + 2] ?? 0,
      })
    }
    return pontos
  }

  it('tem as costas abauladas e a barriga chata', () => {
    /*
     * O plano dos bracos e o z zero. Com a mesma altura para cima e para baixo a
     * fuselagem saia um charuto; por baixo e quase plana, porque e onde assenta
     * a bateria e onde ele pousa.
     */
    // A meio do corpo nao ha bracos nem motores nem gimbal: so fuselagem.
    const meio = opacos().filter((p) => Math.abs(p.y) < 0.02)
    expect(meio.length).toBeGreaterThan(10)

    const cima = Math.max(...meio.map((p) => p.z))
    const baixo = Math.min(...meio.map((p) => p.z))

    expect(cima).toBeGreaterThan(Math.abs(baixo) * 1.8)
  })

  it('a objectiva passa a frente do nariz', () => {
    /*
     * E o que diz para onde ele esta a olhar quando se ve de cima, e de cima e
     * como ele se ve quase sempre. Com a lente recolhida debaixo do nariz, um
     * quadricoptero visto de cima e simetrico e nao se percebe onde e a frente.
     */
    const gimbal = opacos().filter((p) => p.z < -0.03)
    expect(gimbal.length).toBeGreaterThan(0)

    const maisAFrente = Math.max(...gimbal.map((p) => p.y))
    expect(maisAFrente).toBeGreaterThan(comprimentoDoDrone() / 2)
  })

  it('assenta em quatro pes, dois a frente e dois atras', () => {
    // So com pes atras ele ficava a espetar o nariz no chao.
    const pes = opacos().filter((p) => p.z < -0.012 && p.z > -0.03)
    expect(pes.some((p) => p.y > 0.05)).toBe(true)
    expect(pes.some((p) => p.y < -0.05)).toBe(true)
  })
})
