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
  /** Ausente, vai o ambar do enquadramento. A seta de rumo traz a sua. */
  cor?: Cor
}

/** O ambar do poligono do enquadramento: as duas leituras sao da mesma coisa. */
const COR_ENQUADRAMENTO: Cor = [0.94, 0.71, 0.16, 0.75]

/**
 * Um ponto em coordenadas Mercator. So o que a geometria precisa.
 *
 * `MercatorCoordinate` serve aqui sem conversao nenhuma - tem os mesmos tres
 * campos - mas o tipo e proprio para as contas se poderem verificar sem mapa.
 */
export type PontoMercator = { x: number; y: number; z: number }

/**
 * Tamanho da seta de sentido, em metros e em fraccao do troco.
 *
 * Proporcional ao troco, para uma rota densa nao ficar com as setas maiores do
 * que os proprios trocos, e limitada nos dois extremos: abaixo do minimo nao se
 * distingue de um risco, acima do maximo passa a ser o que se ve em vez da rota.
 */
const SETA_FRACCAO = 0.22
const SETA_MINIMA = 3
const SETA_MAXIMA = 20
/** Abaixo disto a seta tapava o troco inteiro e nao se lia nada. */
const TROCO_MINIMO_COM_SETA = 6
/** Quanto a seta abre para os lados, em fraccao do seu comprimento. */
const ABERTURA_SETA = 0.42

/**
 * A seta que diz para que lado se voa o troco, a meio dele.
 *
 * Sem ela o plano nao tinha sentido de marcha: numa rota de cobertura com
 * dezenas de pernas paralelas, a ordem lia-se ponto a ponto pelos numeros dos
 * marcadores e mais nada. A seta assenta no plano que contem a direccao de voo
 * e a horizontal, portanto num troco a subir inclina-se com ele.
 *
 * Devolve `null` quando nao ha seta que faca sentido: troco curto de mais, ou
 * troco so de subida, que nao tem direccao no plano.
 */
export function setaDoTroco(
  de: PontoMercator,
  para: PontoMercator,
  metro: number,
): { ponta: PontoMercator; esquerda: PontoMercator; direita: PontoMercator } | null {
  if (!(metro > 0)) return null

  const vx = para.x - de.x
  const vy = para.y - de.y
  const vz = para.z - de.z
  const comprimento = Math.hypot(vx, vy, vz)
  const horizontal = Math.hypot(vx, vy)
  if (comprimento === 0 || horizontal === 0) return null
  if (comprimento < TROCO_MINIMO_COM_SETA * metro) return null

  const lado = Math.min(
    SETA_MAXIMA * metro,
    Math.max(SETA_MINIMA * metro, comprimento * SETA_FRACCAO),
  )

  // Direccao de marcha, e a perpendicular horizontal a ela.
  const ux = vx / comprimento
  const uy = vy / comprimento
  const uz = vz / comprimento
  const nx = uy / (horizontal / comprimento)
  const ny = -ux / (horizontal / comprimento)

  const meio = { x: (de.x + para.x) / 2, y: (de.y + para.y) / 2, z: (de.z + para.z) / 2 }
  const avanco = lado / 2
  const abertura = lado * ABERTURA_SETA

  return {
    ponta: { x: meio.x + ux * avanco, y: meio.y + uy * avanco, z: meio.z + uz * avanco },
    esquerda: {
      x: meio.x - ux * avanco + nx * abertura,
      y: meio.y - uy * avanco + ny * abertura,
      z: meio.z - uz * avanco,
    },
    direita: {
      x: meio.x - ux * avanco - nx * abertura,
      y: meio.y - uy * avanco - ny * abertura,
      z: meio.z - uz * avanco,
    },
  }
}

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

  /*
   * As arestas vivem em buffer proprio, e nao no da rota.
   *
   * Partilhavam-no, e por isso mexer a aeronave reconstruia a rota inteira:
   * verticais, trocos, setas de sentido e marcas no solo, sessenta vezes por
   * segundo, com uma conversao para Mercator por waypoint de cada vez. Numa
   * rota de cobertura isso e o que faz o voo virtual arrastar-se.
   *
   * Separados, mexer a aeronave toca em onze segmentos e mais nada.
   */
  #bufferArestas: WebGLBuffer | null = null
  #vaoArestas: WebGLVertexArrayObject | null = null
  #verticesArestas = new Float32Array(0)
  #numLinhasArestas = 0
  #precisaRecarregarArestas = false
  #renders = 0
  #reconstrucoes = 0

  onAdd(mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    this.#mapa = mapa


    const programa = ligarPrograma(gl, VERTICE_FONTE, FRAGMENTO_FONTE, 'rota 3D')
    this.#programa = programa
    this.#localMatriz = gl.getUniformLocation(programa, 'uMatriz')

    const montar = (): [WebGLBuffer, WebGLVertexArrayObject] => {
      const buffer = gl.createBuffer()
      const vao = gl.createVertexArray()
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

      const posicao = gl.getAttribLocation(programa, 'aPosicao')
      const cor = gl.getAttribLocation(programa, 'aCor')
      const bytesPorVertice = 7 * 4
      gl.enableVertexAttribArray(posicao)
      gl.vertexAttribPointer(posicao, 3, gl.FLOAT, false, bytesPorVertice, 0)
      gl.enableVertexAttribArray(cor)
      gl.vertexAttribPointer(cor, 4, gl.FLOAT, false, bytesPorVertice, 3 * 4)
      gl.bindVertexArray(null)
      return [buffer, vao]
    }

    ;[this.#buffer, this.#vao] = montar()
    ;[this.#bufferArestas, this.#vaoArestas] = montar()

    this.#precisaRecarregar = true
    this.#precisaRecarregarArestas = true
  }

  onRemove(_mapa: MapaLibre, gl: WebGL2RenderingContext): void {
    if (this.#programa) gl.deleteProgram(this.#programa)
    if (this.#buffer) gl.deleteBuffer(this.#buffer)
    if (this.#vao) gl.deleteVertexArray(this.#vao)
    if (this.#bufferArestas) gl.deleteBuffer(this.#bufferArestas)
    if (this.#vaoArestas) gl.deleteVertexArray(this.#vaoArestas)
    this.#programa = null
    this.#buffer = null
    this.#vao = null
    this.#bufferArestas = null
    this.#vaoArestas = null

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
    this.#construirArestas()
    this.#precisaRecarregarArestas = true
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
    // A origem pode ter mudado com a rota, e as arestas sao relativas a ela.
    this.#construirArestas()
    this.#precisaRecarregar = true
    this.#precisaRecarregarArestas = true
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
    if (!this.#programa) return
    if (this.#vertices.length === 0 && this.#verticesArestas.length === 0) return

    if (this.#precisaRecarregar) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer)
      gl.bufferData(gl.ARRAY_BUFFER, this.#vertices, gl.DYNAMIC_DRAW)
      this.#precisaRecarregar = false
    }
    if (this.#precisaRecarregarArestas) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#bufferArestas)
      gl.bufferData(gl.ARRAY_BUFFER, this.#verticesArestas, gl.DYNAMIC_DRAW)
      this.#precisaRecarregarArestas = false
    }

    const principal = opcoes.defaultProjectionData?.mainMatrix
    if (!principal) return
    const matriz = matrizComTranslacao(principal, this.#origem)

    gl.useProgram(this.#programa)
    gl.uniformMatrix4fv(this.#localMatriz, false, matriz)

    if (this.#vao && this.#numLinhas + this.#numPontos > 0) {
      gl.bindVertexArray(this.#vao)
      gl.drawArrays(gl.LINES, 0, this.#numLinhas)
      gl.drawArrays(gl.POINTS, this.#numLinhas, this.#numPontos)
    }
    if (this.#vaoArestas && this.#numLinhasArestas > 0) {
      gl.bindVertexArray(this.#vaoArestas)
      gl.drawArrays(gl.LINES, 0, this.#numLinhasArestas)
    }
    gl.bindVertexArray(null)
  }

  // --- interno ---------------------------------------------------------------

  /**
   * As arestas soltas: a piramide da camara e a seta de rumo.
   *
   * A piramide vai em ambar, a mesma cor do poligono que ela projecta no
   * terreno - as duas leituras sao da mesma coisa e tem de se ler como uma. A
   * seta de rumo traz cor propria, porque diz outra coisa.
   *
   * Com a rota vazia, a origem sai da primeira aresta: em voo virtual sobre uma
   * rota sem waypoints era so isto que havia para desenhar, e sem origem nao se
   * desenhava nada.
   */
  #construirArestas(): void {
    if (this.#arestas.length === 0) {
      this.#verticesArestas = new Float32Array(0)
      this.#numLinhasArestas = 0
      return
    }

    if (this.#pontos.length === 0) {
      const primeira = this.#arestas[0]
      if (!primeira) return
      const ancora = MercatorCoordinate.fromLngLat(
        [primeira.de.lon, primeira.de.lat],
        primeira.de.alt * this.#exagero,
      )
      this.#origem = [ancora.x, ancora.y, ancora.z]
    }

    const linhas: number[] = []
    for (const aresta of this.#arestas) {
      const cor = aresta.cor ?? COR_ENQUADRAMENTO
      for (const ponta of [aresta.de, aresta.para]) {
        const m = MercatorCoordinate.fromLngLat(
          [ponta.lon, ponta.lat],
          ponta.alt * this.#exagero,
        )
        linhas.push(
          m.x - this.#origem[0],
          m.y - this.#origem[1],
          m.z - this.#origem[2],
          ...cor,
        )
      }
    }

    this.#numLinhasArestas = linhas.length / 7
    this.#verticesArestas = new Float32Array(linhas)
  }

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
    // Unidades Mercator por metro, a latitude da rota: e o que dimensiona as setas.
    const metro = primeiro.meterInMercatorCoordinateUnits()

    const linhas: number[] = []
    const marcas: number[] = []

    const empurrar = (destino: number[], m: PontoMercator, cor: Cor): void => {
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

      // A seta vai da cor do troco: o sentido e a folga acima do solo leem-se juntos.
      const seta = setaDoTroco(de, para, metro)
      if (!seta) continue
      empurrar(linhas, seta.esquerda, cor)
      empurrar(linhas, seta.ponta, cor)
      empurrar(linhas, seta.direita, cor)
      empurrar(linhas, seta.ponta, cor)
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

    this.#numLinhas = linhas.length / 7
    this.#numPontos = marcas.length / 7
    this.#vertices = new Float32Array([...linhas, ...marcas])
  }
}
