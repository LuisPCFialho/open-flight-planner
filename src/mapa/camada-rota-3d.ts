import { MercatorCoordinate, type CustomLayerInterface, type Map as MapaLibre } from 'maplibre-gl'

/**
 * Camada WebGL que desenha a rota a altitude verdadeira sobre o terreno.
 *
 * O MapLibre nao tem forma nativa de o fazer: as camadas `line` ignoram o Z das
 * coordenadas, os `Marker` nao aceitam altitude, e `fill-extrusion` mede sempre
 * a partir do terreno, nao do nivel do mar. Como ver a rota a altura real com a
 * linha ate ao solo e o ponto central da vista 3D, desenha-se aqui.
 *
 * Precisao: as coordenadas Mercator sao da ordem de 0,5 e um float32 so tem
 * cerca de sete digitos significativos, o que daria erros de metros. Por isso os
 * vertices vao para a placa grafica relativos a uma origem local, e a translacao
 * para essa origem e composta na matriz ainda em dupla precisao.
 */

export type PontoRota3D = {
  lon: number
  lat: number
  /** Altura de voo, ortometrica em metros. */
  alturaVoo: number
  /** Cota do terreno na vertical do ponto, ortometrica em metros. */
  cotaTerreno: number
  seleccionado: boolean
  /** Assinalado a vermelho quando esta fora do intervalo seguro acima do solo. */
  alerta: boolean
}

type Cor = readonly [number, number, number, number]

/**
 * Subconjunto do que o MapLibre entrega ao render de uma camada personalizada.
 * So interessa a matriz de projeccao principal.
 */
type OpcoesRender = {
  defaultProjectionData?: { mainMatrix: ArrayLike<number> }
}

const COR_ROTA: Cor = [0.31, 0.85, 0.45, 1]
const COR_ROTA_ALERTA: Cor = [0.95, 0.35, 0.3, 1]
const COR_VERTICAL: Cor = [0.85, 0.88, 0.92, 0.55]
const COR_VERTICAL_ALERTA: Cor = [0.95, 0.35, 0.3, 0.7]
const COR_SELECCAO: Cor = [0.35, 0.72, 1, 1]

const VERTICE_FONTE = `#version 300 es
precision highp float;
in vec3 aPosicao;
in vec4 aCor;
uniform mat4 uMatriz;
out vec4 vCor;
void main() {
  vCor = aCor;
  gl_Position = uMatriz * vec4(aPosicao, 1.0);
  gl_PointSize = 7.0;
}`

const FRAGMENTO_FONTE = `#version 300 es
precision highp float;
in vec4 vCor;
out vec4 corSaida;
void main() {
  // O blend do MapLibre espera alfa pre-multiplicado.
  corSaida = vec4(vCor.rgb * vCor.a, vCor.a);
}`

export class CamadaRota3D implements CustomLayerInterface {
  readonly id = 'rota-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  #programa: WebGLProgram | null = null
  #vao: WebGLVertexArrayObject | null = null
  #buffer: WebGLBuffer | null = null
  #localMatriz: WebGLUniformLocation | null = null
  #mapa: MapaLibre | null = null

  #pontos: readonly PontoRota3D[] = []
  /** Origem local em coordenadas Mercator, para os vertices irem em valores pequenos. */
  #origem: [number, number, number] = [0, 0, 0]
  #vertices = new Float32Array(0)
  #numLinhas = 0
  #numPontos = 0
  #precisaRecarregar = false
  #renders = 0
  #reconstrucoes = 0

  onAdd(mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    this.#mapa = mapa


    const programa = ligarPrograma(gl, VERTICE_FONTE, FRAGMENTO_FONTE)
    this.#programa = programa
    this.#localMatriz = gl.getUniformLocation(programa, 'uMatriz')

    this.#buffer = gl.createBuffer()
    this.#vao = gl.createVertexArray()
    gl.bindVertexArray(this.#vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer)

    const posicao = gl.getAttribLocation(programa, 'aPosicao')
    const cor = gl.getAttribLocation(programa, 'aCor')
    const bytesPorVertice = 7 * 4
    gl.enableVertexAttribArray(posicao)
    gl.vertexAttribPointer(posicao, 3, gl.FLOAT, false, bytesPorVertice, 0)
    gl.enableVertexAttribArray(cor)
    gl.vertexAttribPointer(cor, 4, gl.FLOAT, false, bytesPorVertice, 3 * 4)
    gl.bindVertexArray(null)

    this.#precisaRecarregar = true
  }

  onRemove(_mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    if (this.#programa) gl.deleteProgram(this.#programa)
    if (this.#buffer) gl.deleteBuffer(this.#buffer)
    if (this.#vao) gl.deleteVertexArray(this.#vao)
    this.#programa = null
    this.#buffer = null
    this.#vao = null

  }

  /** Contadores de diagnostico, para se perceber do lado de fora o que foi desenhado. */
  get diagnostico(): {
    pontos: number
    verticesLinha: number
    verticesPonto: number
    renders: number
    reconstrucoes: number
    origem: readonly number[]
  } {
    return {
      pontos: this.#pontos.length,
      verticesLinha: this.#numLinhas,
      verticesPonto: this.#numPontos,
      renders: this.#renders,
      reconstrucoes: this.#reconstrucoes,
      origem: this.#origem,
    }
  }

  /** Substitui a rota desenhada. O trabalho pesado fica aqui, nao no render. */
  definirPontos(pontos: readonly PontoRota3D[]): void {
    this.#reconstrucoes++
    this.#pontos = pontos
    this.#construirVertices()
    this.#precisaRecarregar = true
    this.#mapa?.triggerRepaint()
  }

  /**
   * A matriz a usar e `defaultProjectionData.mainMatrix`, nao a
   * `modelViewProjectionMatrix` que vem no mesmo objecto.
   *
   * Desde que o MapLibre passou a suportar varias projeccoes, a `mainMatrix` e a
   * unica que aceita coordenadas Mercator normalizadas, as mesmas que
   * `MercatorCoordinate.fromLngLat` devolve. Confirmado contra `map.project`:
   * um waypoint em Sever do Vouga cai no pixel 40,362 com a `mainMatrix` e o
   * `map.project` da o mesmo; com a `modelViewProjectionMatrix` sai em 549,-216
   * e com w negativo, ou seja atras da camara. O sintoma e uma camada que
   * renderiza sem erros e nao desenha nada.
   */
  render(gl: WebGL2RenderingContext, opcoes: OpcoesRender): void {
    this.#renders++
    if (!this.#programa || !this.#vao || this.#vertices.length === 0) return

    if (this.#precisaRecarregar) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.#vertices, gl.DYNAMIC_DRAW)
      this.#precisaRecarregar = false
    }

    const principal = opcoes.defaultProjectionData?.mainMatrix
    if (!principal) return
    const matriz = matrizComTranslacao(principal, this.#origem)

    gl.useProgram(this.#programa)
    gl.uniformMatrix4fv(this.#localMatriz, false, matriz)
    gl.bindVertexArray(this.#vao)
    gl.drawArrays(gl.LINES, 0, this.#numLinhas)
    gl.drawArrays(gl.POINTS, this.#numLinhas, this.#numPontos)
    gl.bindVertexArray(null)
  }

  // --- interno ---------------------------------------------------------------

  #construirVertices(): void {
    const pontos = this.#pontos
    if (pontos.length === 0) {
      this.#vertices = new Float32Array(0)
      this.#numLinhas = 0
      this.#numPontos = 0
      return
    }

    const voo = pontos.map((p) => MercatorCoordinate.fromLngLat([p.lon, p.lat], p.alturaVoo))
    const solo = pontos.map((p) => MercatorCoordinate.fromLngLat([p.lon, p.lat], p.cotaTerreno))

    const primeiro = voo[0]
    if (!primeiro) return
    this.#origem = [primeiro.x, primeiro.y, primeiro.z]

    const linhas: number[] = []
    const marcas: number[] = []

    const empurrar = (destino: number[], m: MercatorCoordinate, cor: Cor): void => {
      destino.push(m.x - this.#origem[0], m.y - this.#origem[1], m.z - this.#origem[2], ...cor)
    }

    // Verticais do waypoint ate ao solo. E a leitura que mostra logo um ponto baixo demais.
    for (const [i, ponto] of pontos.entries()) {
      const cima = voo[i]
      const baixo = solo[i]
      if (!cima || !baixo) continue
      const cor = ponto.alerta ? COR_VERTICAL_ALERTA : COR_VERTICAL
      empurrar(linhas, cima, cor)
      empurrar(linhas, baixo, cor)
    }

    // Percurso entre waypoints consecutivos, a altura de voo.
    for (let i = 1; i < pontos.length; i++) {
      const de = voo[i - 1]
      const para = voo[i]
      const pontoDe = pontos[i - 1]
      const pontoPara = pontos[i]
      if (!de || !para || !pontoDe || !pontoPara) continue
      const cor = pontoDe.alerta || pontoPara.alerta ? COR_ROTA_ALERTA : COR_ROTA
      empurrar(linhas, de, cor)
      empurrar(linhas, para, cor)
    }

    // Marca no waypoint e no solo.
    for (const [i, ponto] of pontos.entries()) {
      const cima = voo[i]
      const baixo = solo[i]
      if (!cima || !baixo) continue
      const cor = ponto.seleccionado ? COR_SELECCAO : ponto.alerta ? COR_ROTA_ALERTA : COR_ROTA
      empurrar(marcas, cima, cor)
      empurrar(marcas, baixo, COR_VERTICAL)
    }

    this.#numLinhas = linhas.length / 7
    this.#numPontos = marcas.length / 7
    this.#vertices = new Float32Array([...linhas, ...marcas])
  }
}

/**
 * Compoe `mvp` com uma translacao para a origem local, ainda em dupla precisao,
 * e so depois converte para float32. Fazer a conta ao contrario devolveria
 * vertices com erro de metros.
 */
function matrizComTranslacao(
  mvp: ArrayLike<number>,
  origem: readonly [number, number, number],
): Float32Array {
  const m = new Float32Array(16)
  const [ox, oy, oz] = origem

  for (let coluna = 0; coluna < 3; coluna++) {
    for (let linha = 0; linha < 4; linha++) {
      m[coluna * 4 + linha] = mvp[coluna * 4 + linha] ?? 0
    }
  }
  for (let linha = 0; linha < 4; linha++) {
    m[12 + linha] =
      (mvp[linha] ?? 0) * ox +
      (mvp[4 + linha] ?? 0) * oy +
      (mvp[8 + linha] ?? 0) * oz +
      (mvp[12 + linha] ?? 0)
  }
  return m
}

function ligarPrograma(
  gl: WebGL2RenderingContext,
  fonteVertice: string,
  fonteFragmento: string,
): WebGLProgram {
  const programa = gl.createProgram()
  const vertice = compilar(gl, gl.VERTEX_SHADER, fonteVertice)
  const fragmento = compilar(gl, gl.FRAGMENT_SHADER, fonteFragmento)

  gl.attachShader(programa, vertice)
  gl.attachShader(programa, fragmento)
  gl.linkProgram(programa)
  gl.deleteShader(vertice)
  gl.deleteShader(fragmento)

  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    const registo = gl.getProgramInfoLog(programa)
    gl.deleteProgram(programa)
    throw new Error(`nao foi possivel ligar o programa da rota 3D: ${registo ?? 'sem detalhe'}`)
  }
  return programa
}

function compilar(gl: WebGL2RenderingContext, tipo: number, fonte: string): WebGLShader {
  const shader = gl.createShader(tipo)
  if (!shader) throw new Error('nao foi possivel criar o shader da rota 3D')
  gl.shaderSource(shader, fonte)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const registo = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader da rota 3D nao compila: ${registo ?? 'sem detalhe'}`)
  }
  return shader
}
