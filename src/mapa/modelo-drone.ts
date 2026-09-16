/**
 * Malha de um quadricoptero da familia Mini, desenhada por codigo.
 *
 * Nao e o modelo da DJI: e uma silhueta reconhecivel construida a partir de
 * caixas e discos. A razao e de peso - o modelo real que havia sao 194 mil
 * triangulos em 12,7 MB, e mesmo reduzido ao maximo nao desce dos 29 mil, o que
 * numa rota de 64 waypoints seriam quase dois milhoes de triangulos por
 * fotograma. Isto fica em poucas centenas, desenha-se instanciado numa unica
 * chamada, e a 40 pixeis de tamanho le-se igual.
 *
 * As proporcoes sao as do aparelho real: corpo de 145 por 90 mm, 247 mm de
 * diagonal entre motores, bracos da frente mais abertos do que os de tras, e a
 * camara pendurada a frente por baixo.
 *
 * Eixos locais: x para a direita, y para a frente (nariz), z para cima. Em
 * metros, a tamanho real. Quem desenha e que decide a escala.
 */

export type MalhaDrone = {
  /** Tres flutuantes por vertice. */
  posicoes: Float32Array
  /** Tres por vertice, para a luz. */
  normais: Float32Array
  /** Quatro por vertice. */
  cores: Float32Array
  indices: Uint16Array
}

type Cor = readonly [number, number, number, number]

const CINZENTO_CLARO: Cor = [0.82, 0.84, 0.86, 1]
const CINZENTO_ESCURO: Cor = [0.22, 0.24, 0.27, 1]
const PRETO: Cor = [0.11, 0.12, 0.14, 1]
const VIDRO: Cor = [0.35, 0.55, 0.75, 1]
/** As helices sao translucidas, como as de um aparelho a trabalhar. */
const HELICE: Cor = [0.6, 0.63, 0.68, 0.45]

/** Meia dimensao do corpo, em metros. */
const CORPO = { x: 0.045, y: 0.0725, z: 0.028 }
/** Distancia do centro a cada motor, em x e y. */
const MOTOR = { x: 0.087, frente: 0.087, tras: 0.093 }
const RAIO_HELICE = 0.0785

/** Amarelo da seta, o mesmo do poligono de enquadramento. */
const SETA: Cor = [0.94, 0.71, 0.16, 1]

class Construtor {
  readonly #posicoes: number[] = []
  readonly #normais: number[] = []
  readonly #cores: number[] = []
  readonly #indices: number[] = []

  /** Caixa alinhada com os eixos, com centro e meias-dimensoes dados. */
  caixa(
    centro: readonly [number, number, number],
    meia: readonly [number, number, number],
    cor: Cor,
  ): void {
    const [cx, cy, cz] = centro
    const [hx, hy, hz] = meia

    // Cada face leva os seus quatro vertices, para a normal ser plana.
    const faces: { normal: [number, number, number]; cantos: [number, number, number][] }[] = [
      { normal: [0, 0, 1], cantos: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { normal: [0, 0, -1], cantos: [[-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
      { normal: [0, 1, 0], cantos: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { normal: [0, -1, 0], cantos: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { normal: [1, 0, 0], cantos: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { normal: [-1, 0, 0], cantos: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    ]

    for (const face of faces) {
      const base = this.#posicoes.length / 3
      for (const [x, y, z] of face.cantos) {
        this.#posicoes.push(cx + x, cy + y, cz + z)
        this.#normais.push(...face.normal)
        this.#cores.push(...cor)
      }
      this.#indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  /** Disco horizontal, usado nas helices e no topo dos motores. */
  disco(
    centro: readonly [number, number, number],
    raio: number,
    lados: number,
    cor: Cor,
  ): void {
    const [cx, cy, cz] = centro
    const base = this.#posicoes.length / 3

    this.#posicoes.push(cx, cy, cz)
    this.#normais.push(0, 0, 1)
    this.#cores.push(...cor)

    for (let i = 0; i < lados; i++) {
      const angulo = (i / lados) * Math.PI * 2
      this.#posicoes.push(cx + Math.cos(angulo) * raio, cy + Math.sin(angulo) * raio, cz)
      this.#normais.push(0, 0, 1)
      this.#cores.push(...cor)
    }

    for (let i = 0; i < lados; i++) {
      this.#indices.push(base, base + 1 + i, base + 1 + ((i + 1) % lados))
    }
  }

  /** Cilindro vertical de paredes lisas, para os motores. */
  cilindro(
    centro: readonly [number, number, number],
    raio: number,
    altura: number,
    lados: number,
    cor: Cor,
  ): void {
    const [cx, cy, cz] = centro
    const base = this.#posicoes.length / 3

    for (let i = 0; i <= lados; i++) {
      const angulo = (i / lados) * Math.PI * 2
      const nx = Math.cos(angulo)
      const ny = Math.sin(angulo)

      this.#posicoes.push(cx + nx * raio, cy + ny * raio, cz - altura / 2)
      this.#normais.push(nx, ny, 0)
      this.#cores.push(...cor)

      this.#posicoes.push(cx + nx * raio, cy + ny * raio, cz + altura / 2)
      this.#normais.push(nx, ny, 0)
      this.#cores.push(...cor)
    }

    for (let i = 0; i < lados; i++) {
      const a = base + i * 2
      this.#indices.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }

    this.disco([cx, cy, cz + altura / 2], raio, lados, cor)
  }

  /**
   * Tronco de cone ao longo do eixo y, de `deY` a ateY.
   *
   * Serve a seta da camara: com raios iguais e uma haste, com o raio de chegada
   * a zero e uma ponta.
   */
  tuboEmY(
    deY: number,
    ateY: number,
    raioDe: number,
    raioAte: number,
    lados: number,
    cor: Cor,
  ): void {
    const base = this.#posicoes.length / 3

    for (let i = 0; i <= lados; i++) {
      const angulo = (i / lados) * Math.PI * 2
      const nx = Math.cos(angulo)
      const nz = Math.sin(angulo)

      this.#posicoes.push(nx * raioDe, deY, nz * raioDe)
      this.#normais.push(nx, 0, nz)
      this.#cores.push(...cor)

      this.#posicoes.push(nx * raioAte, ateY, nz * raioAte)
      this.#normais.push(nx, 0, nz)
      this.#cores.push(...cor)
    }

    for (let i = 0; i < lados; i++) {
      const a = base + i * 2
      this.#indices.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
  }

  terminar(): MalhaDrone {
    return {
      posicoes: new Float32Array(this.#posicoes),
      normais: new Float32Array(this.#normais),
      cores: new Float32Array(this.#cores),
      indices: new Uint16Array(this.#indices),
    }
  }
}

/**
 * Constroi a malha.
 *
 * Os bracos saem do corpo em diagonal, os da frente mais abertos e os de tras
 * mais recuados, que e o que da a silhueta em H desta familia quando vista de
 * cima.
 */
export function malhaDrone(): MalhaDrone {
  const c = new Construtor()

  // Corpo, em duas caixas: a de baixo mais estreita, a de cima a fazer a cobertura.
  c.caixa([0, 0, 0], [CORPO.x, CORPO.y, CORPO.z], CINZENTO_CLARO)
  c.caixa([0, -0.012, CORPO.z * 0.8], [CORPO.x * 0.78, CORPO.y * 0.72, CORPO.z * 0.5], CINZENTO_ESCURO)

  // Camara na frente, por baixo: bloco do gimbal e a lente.
  c.caixa([0, CORPO.y * 0.82, -CORPO.z * 0.55], [0.017, 0.017, 0.015], CINZENTO_ESCURO)
  c.caixa([0, CORPO.y * 0.95, -CORPO.z * 0.55], [0.011, 0.006, 0.011], PRETO)
  c.caixa([0, CORPO.y * 1.02, -CORPO.z * 0.55], [0.007, 0.002, 0.007], VIDRO)

  const motores: [number, number][] = [
    [-MOTOR.x, MOTOR.frente],
    [MOTOR.x, MOTOR.frente],
    [-MOTOR.x, -MOTOR.tras],
    [MOTOR.x, -MOTOR.tras],
  ]

  for (const [mx, my] of motores) {
    // Braco: caixa fina do corpo ate ao motor, rodada no plano horizontal.
    const meioX = mx / 2
    const meioY = my / 2
    const comprimento = Math.hypot(mx, my) / 2

    /*
     * A caixa e alinhada com os eixos, portanto o braco em diagonal faz-se com
     * duas caixas curtas em degrau. Fica mais grosseiro do que um braco rodado,
     * mas ao tamanho a que isto se ve nao se distingue, e evita carregar uma
     * rotacao por peca.
     */
    c.caixa([meioX, 0, 0], [Math.abs(meioX), 0.009, 0.007], CINZENTO_CLARO)
    c.caixa([mx, meioY, 0], [0.009, Math.abs(meioY), 0.007], CINZENTO_CLARO)
    void comprimento

    c.cilindro([mx, my, 0.009], 0.0125, 0.018, 10, CINZENTO_ESCURO)
    // Helice: disco translucido, como uma em rotacao.
    c.disco([mx, my, 0.021], RAIO_HELICE, 16, HELICE)
  }

  // Pes de tras, que neste aparelho sao o proprio braco a descair.
  c.caixa([-MOTOR.x, -MOTOR.tras, -0.012], [0.006, 0.006, 0.013], CINZENTO_ESCURO)
  c.caixa([MOTOR.x, -MOTOR.tras, -0.012], [0.006, 0.006, 0.013], CINZENTO_ESCURO)

  return c.terminar()
}

/** Comprimento do nariz a cauda, em metros. Serve para escalar. */
export function comprimentoDoDrone(): number {
  return CORPO.y * 2
}

/** Comprimento da seta, nas mesmas unidades da malha do drone. */
const SETA_COMPRIMENTO = 0.34
const SETA_RAIO = 0.006
/** Onde acaba a haste e comeca a ponta, em fraccao do comprimento. */
const SETA_OMBRO = 0.7
const SETA_RAIO_PONTA = 0.018

/**
 * Seta que diz para onde a camara esta a olhar.
 *
 * Sai da camara e aponta ao longo do eixo do gimbal. Nasce em `y` positivo,
 * como o nariz do drone: quem desenha e que lhe aplica a guinada da aeronave
 * mais a rotacao e a inclinacao do gimbal.
 *
 * E uma haste fina com uma ponta conica, e nao um cone so, porque o que
 * interessa ler de longe e a direccao; uma ponta gorda a apontar ao chao lia-se
 * mal e escondia o terreno por baixo.
 */
export function malhaSetaCamara(): MalhaDrone {
  const c = new Construtor()
  const lados = 8
  const ombro = SETA_COMPRIMENTO * SETA_OMBRO

  c.tuboEmY(CORPO.y * 0.9, ombro, SETA_RAIO, SETA_RAIO, lados, SETA)
  c.tuboEmY(ombro, SETA_COMPRIMENTO, SETA_RAIO_PONTA, 0, lados, SETA)

  return c.terminar()
}
