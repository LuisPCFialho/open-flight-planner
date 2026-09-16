/**
 * Malha de um quadricoptero da familia Mini, desenhada por codigo.
 *
 * Geometria propria, escrita aqui. Nao e o modelo do fabricante nem uma copia
 * dele: esses nao se podem redistribuir, e um ficheiro binario de terceiros a
 * ir parar a GPU tambem nao e coisa que se meta num projecto sem o ler. Nao
 * leva marcas nem simbolos de ninguem.
 *
 * O que se usa de facto sao as medidas publicadas, que sao numeros e nao
 * desenho: corpo de 145 por 90 mm, 247 mm de diagonal entre motores, helices de
 * 157 mm, bracos da frente mais abertos do que os de tras, e a camara pendurada
 * a frente por baixo. O resto e a forma que qualquer quadricoptero dobravel
 * desta classe tem, que e ditada pelo que ele faz.
 *
 * ## Orcamento
 *
 * Mil e quinhentos triangulos, e a conta e deliberada. O aparelho desenha-se a
 * 46 pixeis: a essa medida uma fuselagem de doze lados e uma de dezoito sao o
 * mesmo desenho, e o que se ve e o contorno - que vem das seccoes, e nao do
 * numero de lados. As pas chegaram a valer metade do modelo todo sozinhas.
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

/*
 * Cores.
 *
 * O aparelho e cinzento medio e nao branco, e foi o engano mais visivel da
 * versao anterior: ao lado de uma ortofoto, um aparelho claro le-se como um
 * reflexo e um cinzento le-se como um objecto.
 *
 * As pas sao quase pretas com as pontas cor de laranja. Nao e enfeite: e a
 * convencao de visibilidade que os fabricantes todos usam, e aqui faz o mesmo
 * trabalho que faz no ar - a esta escala sao dois riscos escuros e quatro
 * pontos vivos, e sao eles que dizem de relance que aquilo e um aparelho.
 */
const CORPO_CLARO: Cor = [0.72, 0.74, 0.76, 1]
const CORPO_ESCURO: Cor = [0.42, 0.44, 0.47, 1]
const BRACO: Cor = [0.66, 0.68, 0.7, 1]
const CINZENTO_ESCURO: Cor = [0.22, 0.24, 0.27, 1]
const PRETO: Cor = [0.09, 0.1, 0.12, 1]
const VIDRO: Cor = [0.14, 0.22, 0.34, 1]
const HELICE: Cor = [0.17, 0.18, 0.2, 0.92]
/** Ponta da pa. Alfa abaixo de um, como o resto da pa: e assim que os testes as separam. */
const PONTA_HELICE: Cor = [1, 0.62, 0.12, 0.92]
/** Amarelo da seta, o mesmo do poligono de enquadramento. */
const SETA: Cor = [0.94, 0.71, 0.16, 1]

/** Meia dimensao do corpo, em metros. */
const CORPO = { x: 0.04, y: 0.0725, z: 0.028 }
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

/**
 * Resolucao de cada peca.
 *
 * O orcamento gasta-se onde ele se ve, que e a silhueta. Aos 46 pixeis a que
 * isto se desenha, uma fuselagem de doze lados e uma de dezoito sao o mesmo
 * desenho; o que se nota e a forma do contorno, e essa vem das seccoes e nao do
 * numero de lados.
 *
 * As pas eram metade do orcamento todo - oito pas a doze aneis de dez lados
 * cada uma. Com quatro lados a seccao fica um losango, que e um perfil pobre
 * visto de perto e exactamente o mesmo visto de longe, que e como isto se ve.
 */
const LADOS_CORPO = 12
const LADOS_PA = 4
const LADOS_MOTOR = 8
const LADOS_BRACO = 6
const LADOS_LENTE = 10
const LADOS_PERNA = 6

/**
 * Seccoes da fuselagem, do rabo ao nariz.
 *
 * Sao estas que dao a forma: estreita atras, cheia ao meio, e a afinar para um
 * nariz rombo. Os valores sao meias-dimensoes em metros.
 */
const SECCOES_CORPO: readonly {
  y: number
  x: number
  cima: number
  baixo: number
  /** Onde passa o eixo da seccao. E o que faz o nariz descair para o gimbal. */
  eixo: number
}[] = [
  { y: -0.0725, x: 0.013, cima: 0.011, baixo: 0.008, eixo: 0.009 },
  { y: -0.066, x: 0.031, cima: 0.021, baixo: 0.013, eixo: 0.008 },
  { y: -0.05, x: 0.042, cima: 0.028, baixo: 0.016, eixo: 0.007 },
  { y: -0.026, x: 0.045, cima: 0.031, baixo: 0.017, eixo: 0.006 },
  { y: 0.002, x: 0.045, cima: 0.03, baixo: 0.017, eixo: 0.006 },
  { y: 0.028, x: 0.042, cima: 0.027, baixo: 0.016, eixo: 0.005 },
  { y: 0.048, x: 0.036, cima: 0.023, baixo: 0.014, eixo: 0.003 },
  { y: 0.062, x: 0.027, cima: 0.018, baixo: 0.011, eixo: 0.0 },
  { y: 0.07, x: 0.017, cima: 0.012, baixo: 0.007, eixo: -0.004 },
  { y: 0.0725, x: 0.006, cima: 0.005, baixo: 0.003, eixo: -0.007 },
]

function corpo(c: Construtor): void {
  /*
   * Barriga chata, costas abauladas.
   *
   * Cada seccao tem duas alturas em vez de uma, e a diferenca e o que mais se ve
   * de lado e de frente: com a mesma altura em cima e em baixo, a fuselagem
   * saia um charuto, e nenhum aparelho desta familia e um charuto. Por baixo e
   * quase plano, porque e onde assenta a bateria e onde ele pousa.
   */
  const aneis = SECCOES_CORPO.map((s) =>
    superelipse(LADOS_CORPO, s.x, 1).map(
      (p) => [p[0], s.y, (p[2] >= 0 ? p[2] * s.cima : p[2] * s.baixo) + s.eixo] as Vec3,
    ),
  )

  /*
   * A bateria e uma faixa escura em cima e atras, feita com cor e nao com
   * geometria: ao tamanho a que isto se ve, uma peca separada so acrescentava
   * triangulos e uma junta que ficaria a descoberto.
   */
  c.superficie(aneis, (posicao) => {
    // A tampa da bateria: em cima e atras, e mais escura do que a cobertura.
    if (posicao[2] > 0.019 && posicao[1] < -0.004) return CINZENTO_ESCURO
    // A barriga e escura como a bateria, que e o que se ve quando ele passa por cima.
    if (posicao[2] < -0.004) return CORPO_ESCURO
    return CORPO_CLARO
  })

  const rabo = aneis[0]
  const nariz = aneis[aneis.length - 1]
  if (rabo) c.tampa(rabo, [0, -1, 0], CINZENTO_ESCURO)
  if (nariz) c.tampa(nariz, [0, 1, 0], CORPO_CLARO)

  // Os dois sensores de visao da frente, que sao o que se reconhece de longe.
  for (const lado of [-1, 1]) {
    c.tuboEntre([lado * 0.015, 0.058, 0.004], [lado * 0.015, 0.0665, 0.004], 0.005, 0.0042, 6, PRETO)
  }

  /*
   * O respiro de arrefecimento, em cima e ao meio.
   *
   * E uma faixa fina e escura, e ao tamanho a que isto se ve vale por duas
   * coisas: quebra a cobertura clara, que de outro modo e uma mancha so, e diz
   * de que lado esta a frente sem se ter de ver o gimbal.
   */
  c.caixa([0, -0.012, 0.0355], [0.014, 0.012, 0.0015], CINZENTO_ESCURO)
}

/**
 * Largura da pa ao longo da envergadura, de 0 na raiz a 1 na ponta.
 *
 * Alarga depressa nos primeiros 30%, tem a corda maxima a pouco mais de meio, e
 * afina ate um bico arredondado. E este perfil, e nao a torcao nem a cor, que
 * faz a diferenca entre ler-se uma helice e ler-se uma pa de remo: a versao
 * anterior tinha a corda maxima a meio e as duas pontas rombas, o que de cima
 * dava quatro folhas em vez de quatro helices.
 */
function larguraDaPa(t: number): number {
  const subida = Math.min(1, (t / 0.3) ** 0.75)
  const descida = 1 - 0.88 * Math.max(0, (t - 0.55) / 0.45) ** 1.7
  return Math.max(0.12, Math.min(subida, descida))
}

/**
 * Uma pa de helice: afina, torce e recurva da raiz para a ponta.
 *
 * A raiz nasce dentro da campanula do motor, de proposito. Comecando ao raio da
 * campanula ficava um risco de fundo entre as duas, e a helice parecia colada e
 * nao encaixada.
 */
function pa(c: Construtor, centro: Vec3, anguloBase: number, sentido: number): void {
  const passos = 6
  const raizRaio = 0.006
  const cordaMaxima = 0.0118
  const aneis: Vec3[][] = []

  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const raio = raizRaio + (RAIO_HELICE - raizRaio) * t
    const corda = cordaMaxima * larguraDaPa(t)
    const espessura = 0.0017 * (1 - 0.68 * t)
    // A torcao e o que faz uma pa parecer uma pa e nao uma tira.
    const torcao = sentido * (0.46 - 0.36 * t)

    // Recurva: a ponta foge para tras do sentido de rotacao, como num cimitarra.
    const angulo = anguloBase + sentido * 0.5 * t ** 1.7
    const cx = centro[0] + Math.cos(angulo) * raio
    const cy = centro[1] + Math.sin(angulo) * raio
    // Diedro: a ponta sobe um pouco, que e como uma pa parada assenta.
    const cz = centro[2] + 0.005 * t ** 1.6

    // Direccao da corda: perpendicular ao raio, no plano horizontal.
    const tx = -Math.sin(angulo)
    const ty = Math.cos(angulo)

    const anel: Vec3[] = []
    for (let k = 0; k < LADOS_PA; k++) {
      const a = (k / LADOS_PA) * Math.PI * 2
      const aoLongoDaCorda = Math.cos(a) * corda
      /*
       * Perfil plano-convexo: cheio por cima, quase plano por baixo. E o que uma
       * pa e, e o que faz a luz cair de maneira diferente nas duas faces - com
       * uma seccao simetrica as duas ficavam iguais e a pa parecia uma fita.
       */
      const bruto = Math.sin(a)
      const emEspessura = (bruto >= 0 ? bruto : bruto * 0.3) * espessura
      // Roda o perfil em torno do eixo da corda para dar a torcao.
      const desvioZ = emEspessura * Math.cos(torcao) + aoLongoDaCorda * Math.sin(torcao)
      const desvioCorda = aoLongoDaCorda * Math.cos(torcao) - emEspessura * Math.sin(torcao)
      anel.push([cx + tx * desvioCorda, cy + ty * desvioCorda, cz + desvioZ])
    }
    aneis.push(anel)
  }

  /*
   * A ponta cor de laranja e o ultimo troco da pa.
   *
   * A cor vai por vertice, portanto a passagem de escuro para laranja faz-se ao
   * longo do troco e nao num corte seco - que e como a tinta acaba numa pa a
   * serio, e o que evita um degrau visivel num modelo com tao poucos aneis.
   */
  c.superficie(aneis, (_, anel) => (anel >= passos - 1 ? PONTA_HELICE : HELICE))
  const raiz = aneis[0]
  const ponta = aneis[aneis.length - 1]
  if (raiz) c.tampa(raiz, [0, 0, 1], HELICE)
  if (ponta) c.tampa(ponta, [0, 0, 1], PONTA_HELICE)
}

/**
 * Braco achatado: mais largo do que alto, com a seccao a afinar ate ao motor.
 *
 * Os bracos eram tubos redondos, e de cima quase nao se viam - ficavam a
 * espreitar por baixo das pas e o aparelho lia-se como um corpo com quatro
 * helices a pairar ao lado. Um braco real e uma lamina: quase tao largo como o
 * motor e metade da altura, e e isso que o desenha de cima.
 */
function bracoAchatado(
  c: Construtor,
  de: Vec3,
  para: Vec3,
  larguraDe: number,
  larguraPara: number,
  alturaDe: number,
  alturaPara: number,
  cor: Cor,
): void {
  const eixo = normalizar(subtrair(para, de))
  // A largura mede-se na horizontal e a altura na vertical, e nao numa base
  // qualquer perpendicular ao eixo: o braco e chato em relacao ao mundo.
  const lateral = normalizar([eixo[1], -eixo[0], 0])
  const passos = 2
  const aneis: Vec3[][] = []

  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const centro: Vec3 = [
      de[0] + (para[0] - de[0]) * t,
      de[1] + (para[1] - de[1]) * t,
      de[2] + (para[2] - de[2]) * t,
    ]
    const largura = larguraDe + (larguraPara - larguraDe) * t
    const altura = alturaDe + (alturaPara - alturaDe) * t

    const anel: Vec3[] = []
    for (let k = 0; k < LADOS_BRACO; k++) {
      const a = (k / LADOS_BRACO) * Math.PI * 2
      const l = Math.cos(a) * largura
      const h = Math.sin(a) * altura
      anel.push([centro[0] + lateral[0] * l, centro[1] + lateral[1] * l, centro[2] + h])
    }
    aneis.push(anel)
  }

  c.superficie(aneis, () => cor)
  const inicio = aneis[0]
  const fim = aneis[aneis.length - 1]
  if (inicio) c.tampa(inicio, [-eixo[0], -eixo[1], -eixo[2]], cor)
  if (fim) c.tampa(fim, eixo, cor)
}

function bracoEMotor(c: Construtor, mx: number, my: number, fase: number): void {
  const anca: Vec3 = [Math.sign(mx) * 0.031, my > 0 ? 0.035 : -0.04, 0.004]
  bracoAchatado(c, anca, [mx, my, 0.005], 0.0078, 0.007, 0.0045, 0.004, BRACO)

  /*
   * Motor: base, campanula escura e veio.
   *
   * A pilha sobe ate as pas ficarem acima da cobertura. Mais baixas, as pas
   * atravessavam o corpo - via-se de lado e de frente, e nenhum aparelho e
   * assim.
   */
  c.tuboEntre([mx, my, -0.001], [mx, my, 0.014], 0.0105, 0.0112, LADOS_MOTOR, CINZENTO_ESCURO)
  c.tuboEntre([mx, my, 0.014], [mx, my, 0.028], 0.011, 0.0082, LADOS_MOTOR, PRETO)

  // Duas pas opostas. A fase de cada motor e diferente para nao ficarem alinhadas.
  const sentido = mx * my > 0 ? 1 : -1
  for (const volta of [0, Math.PI]) pa(c, [mx, my, 0.0298], fase + volta, sentido)
}

/**
 * Gimbal e camara, pendurados do nariz.
 *
 * E a peca que diz para onde o aparelho esta a olhar, e por isso e a que mais
 * vale detalhar apesar de ser a mais pequena: sem ela, de cima, um quadricoptero
 * e simetrico e nao se percebe onde e a frente.
 */
function gimbalECamara(c: Construtor): void {
  // Braco que desce do nariz e recua, como o encaixe real.
  c.tuboEntre([0, 0.05, -0.012], [0, 0.058, -0.026], 0.008, 0.0068, LADOS_BRACO, CORPO_ESCURO)

  // Berco em U: dois bracos verticais e a travessa que os une por tras.
  for (const lado of [-1, 1]) {
    c.tuboEntre(
      [lado * 0.017, 0.058, -0.024],
      [lado * 0.017, 0.06, -0.041],
      0.0036,
      0.0034,
      LADOS_BRACO,
      CINZENTO_ESCURO,
    )
  }
  c.caixa([0, 0.0555, -0.039], [0.017, 0.004, 0.005], CINZENTO_ESCURO)

  // Corpo da camara, mais alto do que largo, como o modulo real.
  c.caixa([0, 0.0645, -0.0405], [0.0135, 0.014, 0.0135], PRETO)
  /*
   * Aro da objectiva em cinzento sobre o barrilete preto.
   *
   * E o unico contraste claro nesta zona toda, e e ele que marca onde a camara
   * aponta quando o aparelho sai com dez pixeis no ecra.
   */
  c.tuboEntre([0, 0.0755, -0.0425], [0, 0.0815, -0.0425], 0.0135, 0.013, LADOS_LENTE, CINZENTO_ESCURO)
  c.tuboEntre([0, 0.0765, -0.0405], [0, 0.082, -0.0405], 0.0105, 0.0098, LADOS_LENTE, PRETO)
  c.tuboEntre([0, 0.082, -0.0405], [0, 0.0826, -0.0405], 0.0086, 0.0086, LADOS_LENTE, VIDRO)
}

/**
 * Trem de pouso: quatro pernas em L, presas aos bracos.
 *
 * Eram tacos curtos e nao se liam. Sao pernas: descem do braco, viram para fora
 * e acabam num pe chato. De lado sao o que da altura ao aparelho, e de frente
 * sao o que lhe da assento - com tacos, ele parecia pousado na barriga.
 *
 * As de tras sao mais longas do que as da frente, porque a camara vai a frente
 * por baixo e precisa de folga para nao raspar.
 */
function trem(c: Construtor): void {
  const perna = (x: number, y: number, descida: number, abertura: number): void => {
    const cimo: Vec3 = [x, y, -0.002]
    const joelho: Vec3 = [x + abertura * 0.35, y, -descida]
    const pe: Vec3 = [x + abertura, y, -descida - 0.004]

    c.tuboEntre(cimo, joelho, 0.0042, 0.0038, LADOS_PERNA, CINZENTO_ESCURO)
    c.tuboEntre(joelho, pe, 0.0038, 0.0046, LADOS_PERNA, CINZENTO_ESCURO)
  }

  for (const lado of [-1, 1]) {
    perna(lado * (MOTOR.x - 0.012), -MOTOR.tras + 0.012, 0.03, lado * 0.008)
    perna(lado * (MOTOR.x - 0.016), MOTOR.frente - 0.014, 0.022, lado * 0.007)
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
