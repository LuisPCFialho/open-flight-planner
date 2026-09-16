import { MercatorCoordinate, type CustomLayerInterface, type Map as MapaLibre } from 'maplibre-gl'
import { comprimentoDoDrone, malhaDrone, malhaSetaCamara, type MalhaDrone } from './modelo-drone.ts'
import { ligarPrograma, matrizComTranslacao } from './webgl.ts'

/**
 * Um drone em cada waypoint, com uma seta a dizer para onde a camara olha.
 *
 * Substitui a marca redonda que la estava. Uma marca diz onde o aparelho passa;
 * nao diz de que lado fica o nariz nem para onde a camara aponta, que e
 * exactamente o que se anda a decidir ao planear. Com o aparelho desenhado e a
 * seta a sair da camara, le-se de relance.
 *
 * Desenha-se instanciado: as duas malhas vao uma unica vez para a placa
 * grafica, e o que muda por waypoint - posicao, guinada, angulos do gimbal,
 * cor - vai num segundo conjunto de atributos. Sao duas chamadas de desenho
 * para a rota inteira, independentemente do numero de waypoints.
 */

export type DroneNoMapa = {
  lon: number
  lat: number
  /** Altura de voo, ortometrica em metros. */
  alturaVoo: number
  /** Rumo da aeronave em graus. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
  /** Rotacao do gimbal em graus, relativa ao nariz. */
  gimbalYaw: number
  seleccionado: boolean
  /** Fora do intervalo seguro acima do solo. */
  alerta: boolean
  /**
   * Quantas vezes maior do que os outros. Um em cada waypoint fica a um; a
   * aeronave do leitor vem maior, para se distinguir dos pontos por onde passa.
   */
  aumento?: number
  /** Cor a misturar, para a aeronave do leitor nao se confundir com a rota. */
  tinta?: readonly [number, number, number, number]
}

type OpcoesRender = {
  defaultProjectionData?: { mainMatrix: ArrayLike<number> }
}

/**
 * Tamanho a que o aparelho se quer ver, em pixeis de ecra.
 *
 * Medido contra uma rota de 131 waypoints num quadriculado apertado, que e o
 * caso mau: a 46 pixeis as helices de uns sobrepunham-se as dos outros e o que
 * se via era um tapete cinzento. A 34 ainda se reconhece o aparelho e ja se
 * distingue um do seguinte.
 */
const PIXEIS_ALVO = 34
/**
 * Limites do tamanho no mundo, em metros.
 *
 * Sem o limite de cima, afastar a vista deixava os aparelhos do mesmo tamanho
 * no ecra e a tapar o mapa todo. Sem o de baixo, aproximar muito fazia-os
 * desaparecer dentro de um pixel.
 */
const MINIMO_MUNDO = 3
const MAXIMO_MUNDO = 140

const TINTA_SELECCAO: readonly [number, number, number, number] = [0.35, 0.72, 1, 0.75]
const TINTA_ALERTA: readonly [number, number, number, number] = [0.95, 0.35, 0.3, 0.7]
const SEM_TINTA: readonly [number, number, number, number] = [0, 0, 0, 0]

/**
 * Disposicao de cada instancia, em flutuantes:
 *
 * ```
 *  0..2   centro, em Mercator relativo a origem
 *  3..4   orientacao do aparelho: guinada e inclinacao (que e sempre zero)
 *  5..6   orientacao da camara: azimute e inclinacao do gimbal
 *  7..10  tinta: rgb, e em alfa quanto dela se mistura
 * 11      aumento, relativo ao tamanho comum
 * ```
 *
 * As duas malhas partilham este buffer e cada uma le o seu par de angulos, o
 * que e o mesmo que dizer que o mesmo aparelho pode olhar para um lado e voar
 * para outro - que e o que um gimbal faz.
 */
const FLUTUANTES_POR_INSTANCIA = 12
const BYTES_POR_INSTANCIA = FLUTUANTES_POR_INSTANCIA * 4
export const DESVIO_ORIENTACAO_DRONE = 3 * 4
export const DESVIO_ORIENTACAO_CAMARA = 5 * 4
const DESVIO_TINTA = 7 * 4
const DESVIO_AUMENTO = 11 * 4

const VERTICE_FONTE = `#version 300 es
precision highp float;

in vec3 aPosicao;
in vec3 aNormal;
in vec4 aCor;

in vec3 aCentro;
/** x: azimute em radianos; y: inclinacao em radianos. */
in vec2 aOrientacao;
/** rgb da tinta, e em alfa quanto dela se mistura. */
in vec4 aTinta;
/** Quantas vezes maior do que o tamanho comum. */
in float aAumento;

uniform mat4 uMatriz;
/** x: quantas vezes aumentar a malha; y: unidades mercator por metro. */
uniform vec2 uEscala;

out vec4 vCor;

void main() {
  float ca = cos(aOrientacao.x);
  float sa = sin(aOrientacao.x);
  float ci = cos(aOrientacao.y);
  float si = sin(aOrientacao.y);

  // Inclinacao em torno do eixo transversal: o nariz sobe ou desce.
  vec3 p = vec3(aPosicao.x, aPosicao.y * ci - aPosicao.z * si, aPosicao.y * si + aPosicao.z * ci);
  vec3 n = vec3(aNormal.x, aNormal.y * ci - aNormal.z * si, aNormal.y * si + aNormal.z * ci);

  // Guinada em torno da vertical. A malha tem x para a direita e y para o
  // nariz; aqui passa a leste e norte.
  vec3 enu = vec3(p.x * ca + p.y * sa, -p.x * sa + p.y * ca, p.z);
  vec3 normalEnu = vec3(n.x * ca + n.y * sa, -n.x * sa + n.y * ca, n.z);

  // Em coordenadas Mercator o y cresce para sul.
  vec3 desvio = vec3(enu.x, -enu.y, enu.z) * (uEscala.x * aAumento * uEscala.y);

  float luz = 0.40 + 0.60 * max(dot(normalize(normalEnu), normalize(vec3(0.35, 0.25, 0.90))), 0.0);
  vCor = vec4(mix(aCor.rgb, aTinta.rgb, aTinta.a) * luz, aCor.a);

  gl_Position = uMatriz * vec4(aCentro + desvio, 1.0);
}`

const FRAGMENTO_FONTE = `#version 300 es
precision highp float;
in vec4 vCor;
out vec4 corSaida;
void main() {
  // O blend do MapLibre espera alfa pre-multiplicado.
  corSaida = vec4(vCor.rgb * vCor.a, vCor.a);
}`

/** Uma malha estatica ja carregada, com o seu descritor de vertices. */
type MalhaCarregada = {
  vao: WebGLVertexArrayObject
  vertices: WebGLBuffer
  indices: WebGLBuffer
  numIndices: number
}

export class CamadaDrones implements CustomLayerInterface {
  readonly id = 'drones-waypoints'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  #mapa: MapaLibre | null = null
  #programa: WebGLProgram | null = null
  #bufferInstancias: WebGLBuffer | null = null
  #drone: MalhaCarregada | null = null
  #seta: MalhaCarregada | null = null
  #localMatriz: WebGLUniformLocation | null = null
  #localEscala: WebGLUniformLocation | null = null

  #pontos: readonly DroneNoMapa[] = []
  #instancias = new Float32Array(0)
  #numInstancias = 0
  #origem: [number, number, number] = [0, 0, 0]
  /** Unidades Mercator por metro, a latitude da origem. */
  #metro = 0
  #precisaRecarregar = false
  #renders = 0

  onAdd(mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    this.#mapa = mapa

    const programa = ligarPrograma(gl, VERTICE_FONTE, FRAGMENTO_FONTE, 'drones')
    this.#programa = programa
    this.#localMatriz = gl.getUniformLocation(programa, 'uMatriz')
    this.#localEscala = gl.getUniformLocation(programa, 'uEscala')

    this.#bufferInstancias = gl.createBuffer()

    // O drone usa a guinada da aeronave; a seta usa a orientacao do gimbal. Sao
    // dois pares de flutuantes na mesma instancia, e cada malha le o seu.
    this.#drone = this.#carregarMalha(gl, programa, malhaDrone(), DESVIO_ORIENTACAO_DRONE)
    this.#seta = this.#carregarMalha(gl, programa, malhaSetaCamara(), DESVIO_ORIENTACAO_CAMARA)

    this.#precisaRecarregar = true
  }

  onRemove(_mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    for (const malha of [this.#drone, this.#seta]) {
      if (!malha) continue
      gl.deleteVertexArray(malha.vao)
      gl.deleteBuffer(malha.vertices)
      gl.deleteBuffer(malha.indices)
    }
    if (this.#bufferInstancias) gl.deleteBuffer(this.#bufferInstancias)
    if (this.#programa) gl.deleteProgram(this.#programa)
    this.#drone = null
    this.#seta = null
    this.#bufferInstancias = null
    this.#programa = null
  }

  get diagnostico(): {
    instancias: number
    trianguloDrone: number
    trianguloSeta: number
    renders: number
    metroEmMercator: number
  } {
    return {
      instancias: this.#numInstancias,
      trianguloDrone: (this.#drone?.numIndices ?? 0) / 3,
      trianguloSeta: (this.#seta?.numIndices ?? 0) / 3,
      renders: this.#renders,
      metroEmMercator: this.#metro,
    }
  }

  definirPontos(pontos: readonly DroneNoMapa[]): void {
    this.#pontos = pontos
    this.#construirInstancias()
    this.#precisaRecarregar = true
    this.#mapa?.triggerRepaint()
  }

  render(gl: WebGL2RenderingContext, opcoes: OpcoesRender): void {
    this.#renders++
    const programa = this.#programa
    const drone = this.#drone
    const seta = this.#seta
    if (!programa || !drone || !seta || this.#numInstancias === 0) return

    const principal = opcoes.defaultProjectionData?.mainMatrix
    if (!principal) return

    if (this.#precisaRecarregar) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#bufferInstancias)
      gl.bufferData(gl.ARRAY_BUFFER, this.#instancias, gl.DYNAMIC_DRAW)
      this.#precisaRecarregar = false
    }

    gl.useProgram(programa)
    gl.uniformMatrix4fv(this.#localMatriz, false, matrizComTranslacao(principal, this.#origem))
    gl.uniform2f(this.#localEscala, this.#aumento(), this.#metro)

    /*
     * A profundidade tem de estar ligada, senao as helices de um aparelho
     * atras aparecem por cima do corpo de outro a frente. As faces nao se
     * eliminam por orientacao: a malha e feita de caixas e discos montados a
     * mao, e nem todas ficaram com o mesmo sentido.
     */
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.disable(gl.CULL_FACE)

    for (const malha of [drone, seta]) {
      gl.bindVertexArray(malha.vao)
      gl.drawElementsInstanced(
        gl.TRIANGLES,
        malha.numIndices,
        gl.UNSIGNED_SHORT,
        0,
        this.#numInstancias,
      )
    }
    gl.bindVertexArray(null)
  }

  // --- interno ---------------------------------------------------------------

  /**
   * Quantas vezes aumentar a malha, que esta a tamanho real.
   *
   * Um Mini tem 15 cm de corpo: a escala do mapa seria um ponto invisivel. O
   * aparelho desenha-se com um tamanho constante no ecra, limitado em cima para
   * nao tapar o mapa quando se afasta a vista, e em baixo para nao desaparecer
   * quando se aproxima.
   */
  #aumento(): number {
    const mapa = this.#mapa
    if (!mapa) return 1

    const centro = mapa.getCenter()
    const circunferencia = 40075016.686 * Math.cos((centro.lat * Math.PI) / 180)
    const metrosPorPixel = circunferencia / (512 * Math.pow(2, mapa.getZoom()))
    const alvo = PIXEIS_ALVO * metrosPorPixel

    const tamanho = Math.max(MINIMO_MUNDO, Math.min(MAXIMO_MUNDO, alvo))
    return tamanho / comprimentoDoDrone()
  }

  #construirInstancias(): void {
    const { dados, origem, metro } = construirInstancias(this.#pontos)
    this.#instancias = dados
    this.#origem = origem
    this.#metro = metro
    this.#numInstancias = this.#pontos.length
  }

  /**
   * Poe uma malha na placa grafica e monta o descritor que a junta as
   * instancias. `desvioOrientacao` diz que par de angulos da instancia e que
   * esta malha usa.
   */
  #carregarMalha(
    gl: WebGL2RenderingContext,
    programa: WebGLProgram,
    malha: MalhaDrone,
    desvioOrientacao: number,
  ): MalhaCarregada {
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)

    // Vertices da malha, intercalados: posicao, normal, cor.
    const contagem = malha.posicoes.length / 3
    const intercalado = new Float32Array(contagem * 10)
    for (let i = 0; i < contagem; i++) {
      intercalado.set(malha.posicoes.subarray(i * 3, i * 3 + 3), i * 10)
      intercalado.set(malha.normais.subarray(i * 3, i * 3 + 3), i * 10 + 3)
      intercalado.set(malha.cores.subarray(i * 4, i * 4 + 4), i * 10 + 6)
    }

    const vertices = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices)
    gl.bufferData(gl.ARRAY_BUFFER, intercalado, gl.STATIC_DRAW)

    const porVertice = 10 * 4
    ligar(gl, programa, 'aPosicao', 3, porVertice, 0, 0)
    ligar(gl, programa, 'aNormal', 3, porVertice, 3 * 4, 0)
    ligar(gl, programa, 'aCor', 4, porVertice, 6 * 4, 0)

    // Atributos por instancia, do buffer partilhado.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#bufferInstancias)
    ligar(gl, programa, 'aCentro', 3, BYTES_POR_INSTANCIA, 0, 1)
    ligar(gl, programa, 'aOrientacao', 2, BYTES_POR_INSTANCIA, desvioOrientacao, 1)
    ligar(gl, programa, 'aTinta', 4, BYTES_POR_INSTANCIA, DESVIO_TINTA, 1)
    ligar(gl, programa, 'aAumento', 1, BYTES_POR_INSTANCIA, DESVIO_AUMENTO, 1)

    const indices = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, malha.indices, gl.STATIC_DRAW)

    gl.bindVertexArray(null)

    return { vao, vertices, indices, numIndices: malha.indices.length }
  }
}

function ligar(
  gl: WebGL2RenderingContext,
  programa: WebGLProgram,
  nome: string,
  tamanho: number,
  passo: number,
  desvio: number,
  divisor: number,
): void {
  const local = gl.getAttribLocation(programa, nome)
  if (local < 0) return
  gl.enableVertexAttribArray(local)
  gl.vertexAttribPointer(local, tamanho, gl.FLOAT, false, passo, desvio)
  gl.vertexAttribDivisor(local, divisor)
}

/**
 * Monta o buffer de instancias.
 *
 * Fica fora da classe porque e a unica parte que se pode verificar sem placa
 * grafica, e e onde os enganos custam caro: trocar um desvio ou uma unidade da
 * um erro que so se ve no ecra, e no ecra tudo se parece com tudo.
 */
export function construirInstancias(pontos: readonly DroneNoMapa[]): {
  dados: Float32Array<ArrayBuffer>
  origem: [number, number, number]
  metro: number
} {
  const primeiro = pontos[0]
  if (!primeiro) return { dados: new Float32Array(0), origem: [0, 0, 0], metro: 0 }

  const ancora = MercatorCoordinate.fromLngLat([primeiro.lon, primeiro.lat], primeiro.alturaVoo)
  const origem: [number, number, number] = [ancora.x, ancora.y, ancora.z]
  const metro = ancora.meterInMercatorCoordinateUnits()

  const dados = new Float32Array(pontos.length * FLUTUANTES_POR_INSTANCIA)
  const grau = Math.PI / 180

  for (const [i, ponto] of pontos.entries()) {
    const m = MercatorCoordinate.fromLngLat([ponto.lon, ponto.lat], ponto.alturaVoo)
    const tinta =
      ponto.tinta ??
      (ponto.alerta ? TINTA_ALERTA : ponto.seleccionado ? TINTA_SELECCAO : SEM_TINTA)
    const base = i * FLUTUANTES_POR_INSTANCIA

    dados[base] = m.x - origem[0]
    dados[base + 1] = m.y - origem[1]
    dados[base + 2] = m.z - origem[2]

    // A aeronave paira direita: so guinada, sem inclinacao.
    dados[base + 3] = ponto.guinada * grau
    dados[base + 4] = 0

    // A camara olha para a guinada mais a rotacao do gimbal, que e relativa ao
    // nariz, com a inclinacao do gimbal por cima. E a mesma conta que o
    // exportador faz para o `gimbalHeadingYawBase` da aeronave.
    dados[base + 5] = (ponto.guinada + ponto.gimbalYaw) * grau
    dados[base + 6] = ponto.gimbalPitch * grau

    dados[base + 7] = tinta[0]
    dados[base + 8] = tinta[1]
    dados[base + 9] = tinta[2]
    dados[base + 10] = tinta[3]

    dados[base + 11] = ponto.aumento ?? 1
  }

  return { dados, origem, metro }
}

/** Quantos flutuantes leva cada instancia. Serve os testes e quem le o buffer. */
export const PASSO_INSTANCIA = FLUTUANTES_POR_INSTANCIA
