import { MercatorCoordinate, type CustomLayerInterface, type Map as MapaLibre } from 'maplibre-gl'
import { ligarPrograma, matrizComTranslacao } from './webgl.ts'
import { corDoTroco, corPorAlturaAcimaDoSolo, type Cor } from './cores-rota.ts'

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
  /** Rumo da aeronave em graus, ja resolvido pelo modo de camara da rota. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
  /** Rotacao do gimbal em graus, relativa ao nariz. */
  gimbalYaw: number
  seleccionado: boolean
  /** Assinalado a vermelho quando esta fora do intervalo seguro acima do solo. */
  alerta: boolean
  /** Desenhar o aparelho, e nao so a seta da camara. Ver `camada-drones`. */
  comAparelho?: boolean
}

/**
 * Subconjunto do que o MapLibre entrega ao render de uma camada personalizada.
 * So interessa a matriz de projeccao principal.
 */
type OpcoesRender = {
  defaultProjectionData?: { mainMatrix: ArrayLike<number> }
}

/**
 * Uma aresta solta no espaco, em coordenadas do mundo.
 *
 * Serve a piramide do enquadramento, e por isso as duas pontas trazem altura
 * propria: uma fica no aparelho e a outra no terreno.
 */
export type Segmento3D = {
  de: { lat: number; lon: number; alt: number }
  para: { lat: number; lon: number; alt: number }
}

/** O ambar do poligono do enquadramento: as duas leituras sao da mesma coisa. */
const COR_ENQUADRAMENTO: Cor = [0.94, 0.71, 0.16, 0.75]

const COR_VERTICAL: Cor = [0.85, 0.88, 0.92, 0.55]
/** A vertical leva a cor do ponto, mas mais apagada: e a linha, nao o aviso. */
const OPACIDADE_VERTICAL = 0.6

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
  /** Intervalo aceite acima do solo, que decide a cor de cada troço. */
  #intervalo = { minimo: 30, maximo: 120 }
  /**
   * O mesmo esticao vertical que o MapLibre aplica ao terreno.
   *
   * Tem de ser aplicado aqui tambem. O `exaggeration` multiplica a cota do
   * terreno, mas nao toca em nada que o mapa nao desenhe: com o exagero a 1,4,
   * um cabeco a 400 m aparece a 560 e a rota, que ficava nos seus 460 reais,
   * passava a ir por dentro da montanha. Multiplicando as duas pelo mesmo
   * factor, a relacao entre elas mantem-se, que e o que se esta a ler.
   */
  #exagero = 1
  /**
   * Arestas soltas, desenhadas a altura que lhes for dada.
   *
   * Servem a piramide do enquadramento: quatro arestas do aparelho ate aos
   * cantos que a camara apanha, mais a base que os une. Em GeoJSON isto saia
   * rente ao chao - os raios partiam do sitio do aparelho mas nao da altura
   * dele, e o que se via era uma estrela no terreno em vez de um cone a descer.
   */
  #arestas: readonly Segmento3D[] = []
  #vertices = new Float32Array(0)
  #numLinhas = 0
  #numPontos = 0
  #precisaRecarregar = false
  #renders = 0
  #reconstrucoes = 0

  onAdd(mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    this.#mapa = mapa


    const programa = ligarPrograma(gl, VERTICE_FONTE, FRAGMENTO_FONTE, 'rota 3D')
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

  /** Substitui as arestas soltas - a piramide do enquadramento. */
  definirArestas(arestas: readonly Segmento3D[]): void {
    this.#arestas = arestas
    this.#construirVertices()
    this.#precisaRecarregar = true
    this.#mapa?.triggerRepaint()
  }

  /** Substitui a rota desenhada. O trabalho pesado fica aqui, nao no render. */
  definirPontos(
    pontos: readonly PontoRota3D[],
    intervalo: { minimo: number; maximo: number } = this.#intervalo,
    exagero: number = this.#exagero,
  ): void {
    this.#reconstrucoes++
    this.#pontos = pontos
    this.#intervalo = intervalo
    this.#exagero = exagero > 0 ? exagero : 1
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

    const esticar = (cota: number): number => cota * this.#exagero
    const voo = pontos.map((p) =>
      MercatorCoordinate.fromLngLat([p.lon, p.lat], esticar(p.alturaVoo)),
    )
    const solo = pontos.map((p) =>
      MercatorCoordinate.fromLngLat([p.lon, p.lat], esticar(p.cotaTerreno)),
    )

    const primeiro = voo[0]
    if (!primeiro) return
    this.#origem = [primeiro.x, primeiro.y, primeiro.z]

    const linhas: number[] = []
    const marcas: number[] = []

    const empurrar = (destino: number[], m: MercatorCoordinate, cor: Cor): void => {
      destino.push(m.x - this.#origem[0], m.y - this.#origem[1], m.z - this.#origem[2], ...cor)
    }

    const acimaDoSolo = (ponto: PontoRota3D): number => ponto.alturaVoo - ponto.cotaTerreno

    /*
     * Verticais do waypoint ate ao solo, cada uma com a cor do seu ponto.
     *
     * E a leitura que mostra logo um ponto baixo demais: a linha e curta onde a
     * folga e pouca, e a cor diz de que lado do limite se esta.
     */
    for (const [i, ponto] of pontos.entries()) {
      const cima = voo[i]
      const baixo = solo[i]
      if (!cima || !baixo) continue
      const base = corPorAlturaAcimaDoSolo(acimaDoSolo(ponto), this.#intervalo)
      const cor: Cor = [base[0], base[1], base[2], OPACIDADE_VERTICAL]
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
      const cor = corDoTroco(acimaDoSolo(pontoDe), acimaDoSolo(pontoPara), this.#intervalo)
      empurrar(linhas, de, cor)
      empurrar(linhas, para, cor)
    }

    /*
     * Marca so no solo, ao pe da vertical.
     *
     * No waypoint ja nao ha marca: e onde fica o aparelho desenhado, e as duas
     * coisas sobrepostas nao se liam. A do solo fica, porque e o que diz onde a
     * vertical assenta quando o terreno esta inclinado.
     */
    for (const [i] of pontos.entries()) {
      const baixo = solo[i]
      if (!baixo) continue
      empurrar(marcas, baixo, COR_VERTICAL)
    }

    /*
     * A piramide vai em ambar, a mesma cor do poligono que ela projecta no
     * terreno: as duas leituras sao da mesma coisa e tem de se ler como uma.
     */
    for (const aresta of this.#arestas) {
      for (const ponta of [aresta.de, aresta.para]) {
        empurrar(
          linhas,
          MercatorCoordinate.fromLngLat([ponta.lon, ponta.lat], esticar(ponta.alt)),
          COR_ENQUADRAMENTO,
        )
      }
    }

    this.#numLinhas = linhas.length / 7
    this.#numPontos = marcas.length / 7
    this.#vertices = new Float32Array([...linhas, ...marcas])
  }
}
