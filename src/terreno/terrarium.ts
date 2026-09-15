import type { LatLon } from '../nucleo/tipos.ts'
import { amostrarPercurso } from '../nucleo/geodesia.ts'
import type { DescodificadorPNG, FonteTerreno, ImagemRGBA, OrigemCota } from './fonte.ts'

/**
 * Cotas a partir dos mosaicos Terrarium da AWS.
 *
 * Nao usa `map.queryTerrainElevation` do MapLibre de proposito. Essa funcao so
 * responde sobre mosaicos ja carregados na viewport e no zoom corrente, e
 * devolve `null` fora disso. O perfil de terreno, o nivelamento acima do solo e
 * as validacoes precisam de cotas em pontos que nao estao no ecra, que e
 * precisamente onde essa via falha. Este amostrador vai buscar os mosaicos que
 * precisa, seja o que for que esteja a ser mostrado.
 *
 * Codificacao Terrarium: `metros = R * 256 + G + B / 256 - 32768`.
 */

const URL_BASE_PREDEFINIDA = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const LADO_MOSAICO = 256

/**
 * Zoom 14. A 40 graus de latitude da cerca de 7,3 m por pixel, ja acima da
 * resolucao real dos dados de origem, que em Portugal sao SRTM de 30 m.
 * Subir o zoom aumenta o numero de mosaicos sem acrescentar informacao.
 */
const ZOOM_PREDEFINIDO = 14

/** Limite da projecao Web Mercator. */
const LAT_MAXIMA = 85.0511287798

export type OpcoesTerrarium = {
  descodificador: DescodificadorPNG
  zoom?: number
  urlBase?: string
  /** Mosaicos a manter em memoria. Cada um ocupa cerca de 256 kB em RGBA. */
  maxMosaicos?: number
  /** Injectavel para testar sem rede. */
  buscar?: typeof fetch
}

type Mosaico = { pixels: Uint8ClampedArray; largura: number; altura: number }

export class FonteTerrariumAWS implements FonteTerreno {
  readonly origem: OrigemCota = 'terrarium'

  readonly #descodificador: DescodificadorPNG
  readonly #zoom: number
  readonly #urlBase: string
  readonly #maxMosaicos: number
  readonly #buscar: typeof fetch
  /** Chave `z/x/y`. Guarda a promessa para nao pedir o mesmo mosaico duas vezes. */
  readonly #cache = new Map<string, Promise<Mosaico>>()
  /**
   * Os mesmos mosaicos ja resolvidos, para leitura sincrona.
   *
   * A projeccao do enquadramento da camara marcha centenas de raios contra o
   * terreno e precisa da cota a cada passo. Esperar por uma promessa por passo
   * tornava isso inutilizavel, por isso ha `precarregar` para trazer a area toda
   * de uma vez e `cotaSincrona` para a ler depois.
   */
  readonly #resolvidos = new Map<string, Mosaico>()

  constructor(opcoes: OpcoesTerrarium) {
    this.#descodificador = opcoes.descodificador
    this.#zoom = opcoes.zoom ?? ZOOM_PREDEFINIDO
    this.#urlBase = opcoes.urlBase ?? URL_BASE_PREDEFINIDA
    this.#maxMosaicos = opcoes.maxMosaicos ?? 200
    this.#buscar = opcoes.buscar ?? globalThis.fetch.bind(globalThis)
  }

  /** Global, excepto nas calotes fora do alcance da projecao. */
  cobre(lat: number, _lon: number): boolean {
    return Math.abs(lat) <= LAT_MAXIMA
  }

  async cota(lat: number, lon: number): Promise<number> {
    const [cota] = await this.cotas([{ lat, lon }])
    if (cota === undefined) throw new Error('amostragem de terreno sem resultado')
    return cota
  }

  /**
   * Cotas de varios pontos de uma vez. Os mosaicos sao pedidos em paralelo e
   * cada um so e descarregado uma vez, o que faz diferenca num perfil com
   * centenas de amostras sobre a mesma zona.
   */
  async cotas(pontos: readonly LatLon[]): Promise<number[]> {
    const necessarios = new Set<string>()
    for (const p of pontos) {
      for (const chave of this.#mosaicosParaBilinear(p.lat, p.lon)) necessarios.add(chave)
    }
    await Promise.all([...necessarios].map((chave) => this.#mosaico(chave)))
    return Promise.all(pontos.map((p) => this.#cotaBilinear(p.lat, p.lon)))
  }

  async perfil(pontos: readonly LatLon[], passo: number): Promise<number[]> {
    return this.cotas(amostrarPercurso(pontos, passo))
  }

  /**
   * Traz para memoria todos os mosaicos que cobrem o rectangulo dado, para
   * `cotaSincrona` poder responder sem esperar.
   */
  async precarregar(centro: LatLon, raioEmMetros: number): Promise<void> {
    const grausLat = raioEmMetros / 111320
    const grausLon = grausLat / Math.max(0.05, Math.cos((centro.lat * Math.PI) / 180))

    const cantos: LatLon[] = []
    for (const dLat of [-grausLat, 0, grausLat]) {
      for (const dLon of [-grausLon, 0, grausLon]) {
        cantos.push({ lat: centro.lat + dLat, lon: centro.lon + dLon })
      }
    }

    const chaves = new Set<string>()
    for (const canto of cantos) {
      for (const chave of this.#mosaicosParaBilinear(canto.lat, canto.lon)) chaves.add(chave)
    }
    await Promise.all([...chaves].map((chave) => this.#mosaico(chave)))
  }

  /**
   * Cota lida directamente da memoria, ou `null` se o mosaico ainda nao chegou.
   * Usar depois de `precarregar`.
   */
  cotaSincrona(lat: number, lon: number): number | null {
    const { px, py } = this.#pixelGlobal(lat, lon)
    const fx = px - 0.5
    const fy = py - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0

    const q00 = this.#cotaDoPixelSincrona(x0, y0)
    const q10 = this.#cotaDoPixelSincrona(x0 + 1, y0)
    const q01 = this.#cotaDoPixelSincrona(x0, y0 + 1)
    const q11 = this.#cotaDoPixelSincrona(x0 + 1, y0 + 1)
    if (q00 === null || q10 === null || q01 === null || q11 === null) return null

    const cima = q00 + (q10 - q00) * tx
    const baixo = q01 + (q11 - q01) * tx
    return cima + (baixo - cima) * ty
  }

  #cotaDoPixelSincrona(pxGlobal: number, pyGlobal: number): number | null {
    const mosaico = this.#resolvidos.get(this.#chaveDoPixel(pxGlobal, pyGlobal))
    if (!mosaico) return null
    return this.#lerPixel(mosaico, pxGlobal, pyGlobal)
  }

  // --- interno ---------------------------------------------------------------

  /** Coordenadas de pixel globais, em pixeis fraccionarios, no zoom em uso. */
  #pixelGlobal(lat: number, lon: number): { px: number; py: number } {
    const limitada = Math.max(-LAT_MAXIMA, Math.min(LAT_MAXIMA, lat))
    const escala = 2 ** this.#zoom * LADO_MOSAICO
    const latR = (limitada * Math.PI) / 180
    return {
      px: ((lon + 180) / 360) * escala,
      py: ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * escala,
    }
  }

  /** Os quatro vizinhos da interpolacao podem cair em mosaicos diferentes. */
  #mosaicosParaBilinear(lat: number, lon: number): string[] {
    const { px, py } = this.#pixelGlobal(lat, lon)
    const x0 = Math.floor(px - 0.5)
    const y0 = Math.floor(py - 0.5)
    const chaves = new Set<string>()
    for (const y of [y0, y0 + 1]) {
      for (const x of [x0, x0 + 1]) {
        chaves.add(this.#chaveDoPixel(x, y))
      }
    }
    return [...chaves]
  }

  #chaveDoPixel(pxGlobal: number, pyGlobal: number): string {
    const n = 2 ** this.#zoom
    const tx = ((Math.floor(pxGlobal / LADO_MOSAICO) % n) + n) % n
    const ty = Math.max(0, Math.min(n - 1, Math.floor(pyGlobal / LADO_MOSAICO)))
    return `${this.#zoom}/${tx}/${ty}`
  }

  /**
   * Interpolacao bilinear sobre os centros dos pixeis. Sem ela o perfil sai aos
   * degraus de 7 m, o que na pratica esconde declives e faz falsos alarmes na
   * validacao de altura acima do solo.
   */
  async #cotaBilinear(lat: number, lon: number): Promise<number> {
    const { px, py } = this.#pixelGlobal(lat, lon)
    const fx = px - 0.5
    const fy = py - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0

    const [q00, q10, q01, q11] = await Promise.all([
      this.#cotaDoPixel(x0, y0),
      this.#cotaDoPixel(x0 + 1, y0),
      this.#cotaDoPixel(x0, y0 + 1),
      this.#cotaDoPixel(x0 + 1, y0 + 1),
    ])

    const cima = q00 + (q10 - q00) * tx
    const baixo = q01 + (q11 - q01) * tx
    return cima + (baixo - cima) * ty
  }

  async #cotaDoPixel(pxGlobal: number, pyGlobal: number): Promise<number> {
    const mosaico = await this.#mosaico(this.#chaveDoPixel(pxGlobal, pyGlobal))
    return this.#lerPixel(mosaico, pxGlobal, pyGlobal)
  }

  #lerPixel(mosaico: Mosaico, pxGlobal: number, pyGlobal: number): number {
    const larguraGlobal = 2 ** this.#zoom * LADO_MOSAICO
    const x = ((Math.floor(pxGlobal) % larguraGlobal) + larguraGlobal) % larguraGlobal
    const y = Math.max(0, Math.min(larguraGlobal - 1, Math.floor(pyGlobal)))

    const i = ((y % LADO_MOSAICO) * mosaico.largura + (x % LADO_MOSAICO)) * 4
    const r = mosaico.pixels[i] ?? 0
    const g = mosaico.pixels[i + 1] ?? 0
    const b = mosaico.pixels[i + 2] ?? 0
    return r * 256 + g + b / 256 - 32768
  }

  #mosaico(chave: string): Promise<Mosaico> {
    const emCache = this.#cache.get(chave)
    if (emCache) {
      // Reinsere para o Map ficar ordenado do menos ao mais recente.
      this.#cache.delete(chave)
      this.#cache.set(chave, emCache)
      return emCache
    }

    const promessa = this.#descarregar(chave)
      .then((mosaico) => {
        this.#resolvidos.set(chave, mosaico)
        return mosaico
      })
      .catch((erro: unknown) => {
        // Um mosaico que falhou nao fica em cache, para a tentativa seguinte poder repetir.
        this.#cache.delete(chave)
        throw erro
      })
    this.#cache.set(chave, promessa)

    while (this.#cache.size > this.#maxMosaicos) {
      const maisAntigo = this.#cache.keys().next().value
      if (maisAntigo === undefined) break
      this.#cache.delete(maisAntigo)
      this.#resolvidos.delete(maisAntigo)
    }
    return promessa
  }

  async #descarregar(chave: string): Promise<Mosaico> {
    const url = `${this.#urlBase}/${chave}.png`
    const resposta = await this.#buscar(url)
    if (!resposta.ok) {
      throw new Error(`mosaico de terreno ${chave} indisponivel (HTTP ${resposta.status})`)
    }
    const imagem: ImagemRGBA = await this.#descodificador(await resposta.arrayBuffer())
    return { pixels: imagem.pixels, largura: imagem.largura, altura: imagem.altura }
  }
}
