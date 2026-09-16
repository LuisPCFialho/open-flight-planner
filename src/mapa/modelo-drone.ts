/**
 * Malha de um quadricoptero da familia Mini, desenhada por codigo.
 *
 * Nao e o modelo da DJI - esse nao se pode redistribuir - mas ja nao e uma
 * silhueta: e um aparelho com fuselagem torneada, bracos conicos, motores,
 * quatro helices de duas pas cada, gimbal com lente e trem de pouso.
 *
 * Deixou de ser uma questao de orcamento. Enquanto ia um aparelho em cada
 * waypoint, cada triangulo contava e o modelo tinha de caber em poucas centenas;
 * agora so se desenha onde o utilizador escolheu e na aeronave do leitor, ou
 * seja um ou dois de cada vez, e cabe o detalhe todo.
 *
 * As proporcoes sao as do aparelho real: corpo de 145 por 90 mm, 247 mm de
 * diagonal entre motores, helices de 157 mm, bracos da frente mais abertos do
 * que os de tras, e a camara pendurada a frente por baixo.
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
type Vec3 = readonly [number, number, number]

const CINZENTO_CLARO: Cor = [0.8, 0.82, 0.86, 1]
const CINZENTO_MEDIO: Cor = [0.62, 0.65, 0.69, 1]
const CINZENTO_ESCURO: Cor = [0.24, 0.26, 0.3, 1]
const PRETO: Cor = [0.1, 0.11, 0.13, 1]
const VIDRO: Cor = [0.16, 0.26, 0.4, 1]
const HELICE: Cor = [0.7, 0.73, 0.78, 0.9]
/** Amarelo da seta, o mesmo do poligono de enquadramento. */
const SETA: Cor = [0.94, 0.71, 0.16, 1]

/** Meia dimensao do corpo, em metros. */
const CORPO = { x: 0.045, y: 0.0725, z: 0.028 }
/** Distancia do centro a cada motor, em x e y. */
const MOTOR = { x: 0.087, frente: 0.087, tras: 0.093 }
const RAIO_HELICE = 0.0785

// --- algebra minima ----------------------------------------------------------

function subtrair(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function normalizar(v: Vec3): Vec3 {
  const comprimento = Math.hypot(v[0], v[1], v[2])
  if (comprimento < 1e-9) return [0, 0, 1]
  return [v[0] / comprimento, v[1] / comprimento, v[2] / comprimento]
}

function produtoExterno(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Dois eixos perpendiculares a `eixo`, para construir seccoes em torno dele. */
function baseTransversal(eixo: Vec3): { u: Vec3; v: Vec3 } {
  // O auxiliar tem de nao ser paralelo ao eixo, senao o produto externo anula-se.
  const auxiliar: Vec3 = Math.abs(eixo[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]
  const u = normalizar(produtoExterno(eixo, auxiliar))
  const v = normalizar(produtoExterno(eixo, u))
  return { u, v }
}

/**
 * Contorno de uma seccao em forma de rectangulo arredondado.
 *
 * E uma superelipse: com expoente dois da uma elipse, com expoente alto da um
 * rectangulo. Quatro e o meio-termo que da a fuselagem desta familia, chata por
 * baixo e abaulada em cima, sem precisar de cantos explicitos na malha.
 */
function superelipse(lados: number, meiaLargura: number, meiaAltura: number): Vec3[] {
  const expoente = 2 / 4
  const pontos: Vec3[] = []
  for (let i = 0; i < lados; i++) {
    const t = (i / lados) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    pontos.push([
      Math.sign(c) * Math.pow(Math.abs(c), expoente) * meiaLargura,
      0,
      Math.sign(s) * Math.pow(Math.abs(s), expoente) * meiaAltura,
    ])
  }
  return pontos
}

// --- construtor --------------------------------------------------------------

class Construtor {
  readonly #posicoes: number[] = []
  readonly #normais: number[] = []
  readonly #cores: number[] = []
  readonly #indices: number[] = []

  #vertice(posicao: Vec3, normal: Vec3, cor: Cor): number {
    const indice = this.#posicoes.length / 3
    this.#posicoes.push(posicao[0], posicao[1], posicao[2])
    const n = normalizar(normal)
    this.#normais.push(n[0], n[1], n[2])
    this.#cores.push(...cor)
    return indice
  }

  #quadrilatero(a: number, b: number, c: number, d: number): void {
    this.#indices.push(a, b, c, a, c, d)
  }

  /**
   * Costura uma sucessao de aneis do mesmo numero de pontos numa superficie.
   *
   * As normais saem da propria malha - da grelha de vizinhos de cada vertice - e
   * nao de uma formula por peca. E o que faz a fuselagem parecer torneada em vez
   * de facetada, e serve tanto o corpo como as pas e os bracos.
   */
  superficie(aneis: readonly Vec3[][], cor: (posicao: Vec3, anel: number) => Cor): void {
    if (aneis.length < 2) return
    const primeiro = aneis[0]
    if (!primeiro) return
    const lados = primeiro.length

    const normais = calcularNormaisDeAneis(aneis)
    const indices: number[][] = []

    for (const [a, anel] of aneis.entries()) {
      const linha: number[] = []
      for (const [i, ponto] of anel.entries()) {
        linha.push(this.#vertice(ponto, normais[a]?.[i] ?? [0, 0, 1], cor(ponto, a)))
      }
      indices.push(linha)
    }

    for (let a = 0; a + 1 < aneis.length; a++) {
      const baixo = indices[a]
      const cima = indices[a + 1]
      if (!baixo || !cima) continue
      for (let i = 0; i < lados; i++) {
        const j = (i + 1) % lados
        const p0 = baixo[i]
        const p1 = baixo[j]
        const p2 = cima[j]
        const p3 = cima[i]
        if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue
        this.#quadrilatero(p0, p1, p2, p3)
      }
    }
  }

  /** Tampa um anel com um leque de triangulos a partir do seu centro. */
  tampa(anel: readonly Vec3[], normal: Vec3, cor: Cor): void {
    if (anel.length < 3) return
    const centro: Vec3 = [
      anel.reduce((s, p) => s + p[0], 0) / anel.length,
      anel.reduce((s, p) => s + p[1], 0) / anel.length,
      anel.reduce((s, p) => s + p[2], 0) / anel.length,
    ]
    const meio = this.#vertice(centro, normal, cor)
    const bordo = anel.map((p) => this.#vertice(p, normal, cor))

    for (let i = 0; i < bordo.length; i++) {
      const a = bordo[i]
      const b = bordo[(i + 1) % bordo.length]
      if (a === undefined || b === undefined) continue
      this.#indices.push(meio, a, b)
    }
  }

  /** Tubo conico entre dois pontos quaisquer. Serve os bracos, os motores e a lente. */
  tuboEntre(
    de: Vec3,
    para: Vec3,
    raioDe: number,
    raioPara: number,
    lados: number,
    cor: Cor,
  ): void {
    const eixo = normalizar(subtrair(para, de))
    const { u, v } = baseTransversal(eixo)

    const anel = (centro: Vec3, raio: number): Vec3[] => {
      const pontos: Vec3[] = []
      for (let i = 0; i < lados; i++) {
        const t = (i / lados) * Math.PI * 2
        const c = Math.cos(t) * raio
        const s = Math.sin(t) * raio
        pontos.push([
          centro[0] + u[0] * c + v[0] * s,
          centro[1] + u[1] * c + v[1] * s,
          centro[2] + u[2] * c + v[2] * s,
        ])
      }
      return pontos
    }

    const inicio = anel(de, raioDe)
    const fim = anel(para, raioPara)
    this.superficie([inicio, fim], () => cor)

    this.tampa(inicio, [-eixo[0], -eixo[1], -eixo[2]], cor)
    this.tampa(fim, eixo, cor)
  }

  /** Caixa alinhada com os eixos, com centro e meias-dimensoes dados. */
  caixa(centro: Vec3, meia: Vec3, cor: Cor): void {
    const [cx, cy, cz] = centro
    const [hx, hy, hz] = meia

    const faces: { normal: Vec3; cantos: Vec3[] }[] = [
      { normal: [0, 0, 1], cantos: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { normal: [0, 0, -1], cantos: [[-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
      { normal: [0, 1, 0], cantos: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { normal: [0, -1, 0], cantos: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { normal: [1, 0, 0], cantos: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { normal: [-1, 0, 0], cantos: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    ]

    for (const face of faces) {
      const cantos = face.cantos.map((c) => [cx + c[0], cy + c[1], cz + c[2]] as Vec3)
      const a = this.#vertice(cantos[0] ?? [0, 0, 0], face.normal, cor)
      const b = this.#vertice(cantos[1] ?? [0, 0, 0], face.normal, cor)
      const c = this.#vertice(cantos[2] ?? [0, 0, 0], face.normal, cor)
      const d = this.#vertice(cantos[3] ?? [0, 0, 0], face.normal, cor)
      this.#quadrilatero(a, b, c, d)
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

/** Normal de cada vertice, pela grelha de vizinhos em vez de face a face. */
function calcularNormaisDeAneis(aneis: readonly Vec3[][]): Vec3[][] {
  return aneis.map((anel, a) => {
    const anterior = aneis[a - 1] ?? anel
    const seguinte = aneis[a + 1] ?? anel

    return anel.map((ponto, i) => {
      const esquerda = anel[(i - 1 + anel.length) % anel.length] ?? ponto
      const direita = anel[(i + 1) % anel.length] ?? ponto
      const atras = anterior[i] ?? ponto
      const frente = seguinte[i] ?? ponto

      const aoLongo = subtrair(frente, atras)
      const emVolta = subtrair(direita, esquerda)
      return normalizar(produtoExterno(aoLongo, emVolta))
    })
  })
}

// --- pecas -------------------------------------------------------------------

const LADOS_CORPO = 18

/**
 * Seccoes da fuselagem, do rabo ao nariz.
 *
 * Sao estas que dao a forma: estreita atras, cheia ao meio, e a afinar para um
 * nariz rombo. Os valores sao meias-dimensoes em metros.
 */
const SECCOES_CORPO: readonly { y: number; x: number; z: number }[] = [
  { y: -0.076, x: 0.012, z: 0.008 },
  { y: -0.07, x: 0.028, z: 0.017 },
  { y: -0.056, x: 0.039, z: 0.024 },
  { y: -0.03, x: 0.044, z: 0.027 },
  { y: 0.0, x: 0.045, z: 0.028 },
  { y: 0.03, x: 0.044, z: 0.027 },
  { y: 0.052, x: 0.04, z: 0.025 },
  { y: 0.066, x: 0.031, z: 0.02 },
  { y: 0.074, x: 0.018, z: 0.013 },
  { y: 0.078, x: 0.006, z: 0.005 },
]

function corpo(c: Construtor): void {
  const aneis = SECCOES_CORPO.map((s) =>
    superelipse(LADOS_CORPO, s.x, s.z).map((p) => [p[0], s.y, p[2] + 0.004] as Vec3),
  )

  /*
   * A bateria e uma faixa escura em cima e atras, feita com cor e nao com
   * geometria: ao tamanho a que isto se ve, uma peca separada so acrescentava
   * triangulos e uma junta que ficaria a descoberto.
   */
  c.superficie(aneis, (posicao) =>
    posicao[2] > 0.019 && posicao[1] < -0.005 ? CINZENTO_ESCURO : CINZENTO_CLARO,
  )

  const rabo = aneis[0]
  const nariz = aneis[aneis.length - 1]
  if (rabo) c.tampa(rabo, [0, -1, 0], CINZENTO_ESCURO)
  if (nariz) c.tampa(nariz, [0, 1, 0], CINZENTO_CLARO)

  // Os dois sensores de visao da frente, que sao o que se reconhece de longe.
  for (const lado of [-1, 1]) {
    c.tuboEntre([lado * 0.016, 0.068, 0.006], [lado * 0.016, 0.0745, 0.006], 0.005, 0.004, 8, PRETO)
  }
}

/** Uma pa de helice: afina e torce da raiz para a ponta. */
function pa(c: Construtor, centro: Vec3, anguloBase: number, sentido: number): void {
  const passos = 9
  const aneis: Vec3[][] = []

  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const raio = 0.01 + (RAIO_HELICE - 0.01) * t
    // Corda maxima a um terco da envergadura, e a afinar ate a ponta.
    const corda = 0.013 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.75)) + 0.003
    const espessura = 0.0013 * (1 - t * 0.6)
    // A torcao e o que faz uma pa parecer uma pa e nao uma tira.
    const torcao = sentido * (0.38 - 0.3 * t)

    const angulo = anguloBase + t * sentido * 0.22
    const cx = centro[0] + Math.cos(angulo) * raio
    const cy = centro[1] + Math.sin(angulo) * raio

    // Direccao da corda: perpendicular ao raio, no plano horizontal.
    const tx = -Math.sin(angulo)
    const ty = Math.cos(angulo)

    const anel: Vec3[] = []
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const aoLongoDaCorda = Math.cos(a) * corda
      const emEspessura = Math.sin(a) * espessura
      // Roda o perfil em torno do eixo da corda para dar a torcao.
      const desvioZ = emEspessura * Math.cos(torcao) + aoLongoDaCorda * Math.sin(torcao)
      const desvioCorda = aoLongoDaCorda * Math.cos(torcao) - emEspessura * Math.sin(torcao)
      anel.push([cx + tx * desvioCorda, cy + ty * desvioCorda, centro[2] + desvioZ])
    }
    aneis.push(anel)
  }

  c.superficie(aneis, () => HELICE)
  const raiz = aneis[0]
  const ponta = aneis[aneis.length - 1]
  if (raiz) c.tampa(raiz, [0, 0, 1], HELICE)
  if (ponta) c.tampa(ponta, [0, 0, 1], HELICE)
}

function bracoEMotor(c: Construtor, mx: number, my: number, fase: number): void {
  // O braco sai da anca do corpo e afina ate ao motor.
  const anca: Vec3 = [Math.sign(mx) * 0.03, my > 0 ? 0.038 : -0.042, 0.004]
  c.tuboEntre(anca, [mx, my, 0.006], 0.0105, 0.0078, 10, CINZENTO_CLARO)

  /*
   * Motor: corpo cilindrico, campanula escura e veio.
   *
   * A pilha sobe ate as pas ficarem acima da cobertura. Mais baixas, as pas
   * atravessavam o corpo - via-se de lado e de frente, e nenhum aparelho e
   * assim.
   */
  c.tuboEntre([mx, my, 0.0], [mx, my, 0.018], 0.0125, 0.0125, 14, CINZENTO_MEDIO)
  c.tuboEntre([mx, my, 0.018], [mx, my, 0.027], 0.0122, 0.0098, 14, CINZENTO_ESCURO)
  c.tuboEntre([mx, my, 0.027], [mx, my, 0.0325], 0.0035, 0.003, 8, PRETO)

  // Duas pas opostas. A fase de cada motor e diferente para nao ficarem alinhadas.
  const sentido = mx * my > 0 ? 1 : -1
  for (const volta of [0, Math.PI]) pa(c, [mx, my, 0.0305], fase + volta, sentido)
}

function gimbalECamara(c: Construtor): void {
  // Suporte que desce do nariz.
  c.tuboEntre([0, 0.054, -0.018], [0, 0.06, -0.030], 0.007, 0.006, 8, CINZENTO_MEDIO)
  // Bracos do berco, um de cada lado.
  for (const lado of [-1, 1]) {
    c.tuboEntre(
      [lado * 0.016, 0.062, -0.026],
      [lado * 0.016, 0.062, -0.042],
      0.0035,
      0.0035,
      8,
      CINZENTO_ESCURO,
    )
  }

  c.caixa([0, 0.064, -0.040], [0.016, 0.015, 0.014], CINZENTO_ESCURO)
  // Barrilete da lente, virado para a frente.
  c.tuboEntre([0, 0.076, -0.040], [0, 0.086, -0.040], 0.0115, 0.0108, 16, PRETO)
  c.tuboEntre([0, 0.086, -0.040], [0, 0.0868, -0.040], 0.0098, 0.0098, 16, VIDRO)
}

function trem(c: Construtor): void {
  // Os pes de tras sao o proprio braco a descair, como neste aparelho.
  for (const lado of [-1, 1]) {
    c.tuboEntre(
      [lado * MOTOR.x, -MOTOR.tras, -0.002],
      [lado * (MOTOR.x + 0.004), -MOTOR.tras - 0.004, -0.024],
      0.0055,
      0.007,
      8,
      CINZENTO_ESCURO,
    )
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

  corpo(c)
  gimbalECamara(c)
  trem(c)

  const motores: [number, number, number][] = [
    [-MOTOR.x, MOTOR.frente, 0.0],
    [MOTOR.x, MOTOR.frente, 0.8],
    [-MOTOR.x, -MOTOR.tras, 1.7],
    [MOTOR.x, -MOTOR.tras, 2.4],
  ]
  for (const [mx, my, fase] of motores) bracoEMotor(c, mx, my, fase)

  return c.terminar()
}

/** Comprimento do nariz a cauda, em metros. */
export function comprimentoDoDrone(): number {
  return CORPO.y * 2
}

/**
 * Quanto o aparelho ocupa de ponta a ponta, helices incluidas.
 *
 * E esta a medida que interessa a quem o desenha no ecra. Escalar pelo
 * comprimento do corpo fazia-o aparecer duas vezes e meia maior do que o tamanho
 * pedido, porque as helices ficam muito para la do nariz e da cauda: era essa a
 * razao de os aparelhos aparecerem enormes no mapa.
 */
export function envergaduraDoDrone(): number {
  // Os bracos de tras sao mais compridos do que a meia-largura, portanto e deles
  // que sai a maior dimensao: medir so pela largura deixava as helices de tras
  // de fora da envolvente anunciada.
  const maiorBraco = Math.max(MOTOR.x, MOTOR.frente, MOTOR.tras)
  return (maiorBraco + RAIO_HELICE) * 2
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
  const ombro = SETA_COMPRIMENTO * SETA_OMBRO

  c.tuboEntre([0, CORPO.y * 0.9, 0], [0, ombro, 0], SETA_RAIO, SETA_RAIO, 8, SETA)
  c.tuboEntre([0, ombro, 0], [0, SETA_COMPRIMENTO, 0], SETA_RAIO_PONTA, 0.0001, 10, SETA)

  return c.terminar()
}
