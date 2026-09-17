import type { LatLon } from '../nucleo/tipos.ts'
import { amostrarPercurso } from '../nucleo/geodesia.ts'
import type { FonteTerreno, OrigemCota } from './fonte.ts'
import type { PontoCotado, Topografia } from './dxf.ts'
import { wgs84ParaPtTm06, type PontoPTTM06 } from './projeccao.ts'

/**
 * Cotas a partir da topografia de um DXF.
 *
 * Dentro de um triangulo de superficie a cota sai por interpolacao baricentrica,
 * que e exacta. Fora deles, e quando so ha curvas de nivel, usa-se a media
 * ponderada pelo inverso do quadrado da distancia sobre os vizinhos mais
 * proximos, procurados numa grelha.
 *
 * Trabalha em PT-TM06 e nao em graus: a topografia vem nesse sistema e as
 * distancias em metros sao directas, sem correcoes de latitude.
 */

/** Lado da celula da grelha de procura, em metros. */
const LADO_CELULA = 25

/** Vizinhos a considerar na media ponderada. */
const VIZINHOS = 8

export class FonteTerrenoDXF implements FonteTerreno {
  readonly origem: OrigemCota = 'dxf'
  readonly topografia: Topografia

  /** Pontos em PT-TM06, indexados por celula. */
  readonly #grelha = new Map<string, { x: number; y: number; cota: number }[]>()
  readonly #triangulos: { vertices: [Plano, Plano, Plano] }[] = []
  readonly #limites: { xMin: number; xMax: number; yMin: number; yMax: number } | null

  constructor(topografia: Topografia) {
    this.topografia = topografia

    let xMin = Infinity
    let xMax = -Infinity
    let yMin = Infinity
    let yMax = -Infinity

    const registar = (ponto: PontoCotado): Plano => {
      const { x, y } = wgs84ParaPtTm06(ponto.posicao)
      const chave = chaveDaCelula(x, y)
      const celula = this.#grelha.get(chave)
      const entrada = { x, y, cota: ponto.cota }
      if (celula) celula.push(entrada)
      else this.#grelha.set(chave, [entrada])

      xMin = Math.min(xMin, x)
      xMax = Math.max(xMax, x)
      yMin = Math.min(yMin, y)
      yMax = Math.max(yMax, y)
      return entrada
    }

    for (const ponto of topografia.pontos) registar(ponto)
    for (const triangulo of topografia.triangulos) {
      const [a, b, c] = triangulo.vertices
      this.#triangulos.push({ vertices: [registar(a), registar(b), registar(c)] })
    }

    this.#limites = Number.isFinite(xMin) ? { xMin, xMax, yMin, yMax } : null
  }

  /** Dentro da envolvente da topografia, com uma folga de meia celula. */
  cobre(lat: number, lon: number): boolean {
    if (!this.#limites) return false
    const { x, y } = wgs84ParaPtTm06({ lat, lon })
    const folga = LADO_CELULA / 2
    return (
      x >= this.#limites.xMin - folga &&
      x <= this.#limites.xMax + folga &&
      y >= this.#limites.yMin - folga &&
      y <= this.#limites.yMax + folga
    )
  }

  async cota(lat: number, lon: number): Promise<number> {
    const valor = this.cotaSincrona(lat, lon)
    if (valor === null) throw new Error('o ponto está fora da área do levantamento topográfico')
    return valor
  }

  async perfil(pontos: readonly LatLon[], passo: number): Promise<number[]> {
    return amostrarPercurso(pontos, passo).map((ponto) => {
      const valor = this.cotaSincrona(ponto.lat, ponto.lon)
      if (valor === null) throw new Error('o percurso sai da área do levantamento topográfico')
      return valor
    })
  }

  /** Cota no ponto, ou `null` se estiver fora da area coberta. */
  cotaSincrona(lat: number, lon: number): number | null {
    const alvo = wgs84ParaPtTm06({ lat, lon })

    const noTriangulo = this.#cotaPorTriangulo(alvo)
    if (noTriangulo !== null) return noTriangulo

    if (!this.cobre(lat, lon)) return null
    return this.#cotaPorVizinhos(alvo)
  }

  // --- interno ---------------------------------------------------------------

  /**
   * Interpolacao baricentrica dentro do primeiro triangulo que contenha o ponto.
   *
   * Numa superficie de levantamento isto e a cota exacta, nao uma estimativa,
   * porque o triangulo e um plano definido pelos tres pontos medidos.
   */
  #cotaPorTriangulo(alvo: PontoPTTM06): number | null {
    for (const { vertices } of this.#triangulos) {
      const [a, b, c] = vertices
      const denominador = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
      if (Math.abs(denominador) < 1e-9) continue

      const u = ((b.y - c.y) * (alvo.x - c.x) + (c.x - b.x) * (alvo.y - c.y)) / denominador
      const v = ((c.y - a.y) * (alvo.x - c.x) + (a.x - c.x) * (alvo.y - c.y)) / denominador
      const w = 1 - u - v

      const tolerancia = -1e-9
      if (u >= tolerancia && v >= tolerancia && w >= tolerancia) {
        return u * a.cota + v * b.cota + w * c.cota
      }
    }
    return null
  }

  #cotaPorVizinhos(alvo: PontoPTTM06): number | null {
    const candidatos: { distanciaQuadrada: number; cota: number }[] = []

    // Alarga o anel de celulas ate ter vizinhos que cheguem.
    for (let anel = 1; anel <= 6 && candidatos.length < VIZINHOS; anel++) {
      candidatos.length = 0
      const cx = Math.floor(alvo.x / LADO_CELULA)
      const cy = Math.floor(alvo.y / LADO_CELULA)

      for (let dx = -anel; dx <= anel; dx++) {
        for (let dy = -anel; dy <= anel; dy++) {
          const celula = this.#grelha.get(`${cx + dx},${cy + dy}`)
          if (!celula) continue
          for (const ponto of celula) {
            const distanciaQuadrada = (ponto.x - alvo.x) ** 2 + (ponto.y - alvo.y) ** 2
            candidatos.push({ distanciaQuadrada, cota: ponto.cota })
          }
        }
      }
    }

    if (candidatos.length === 0) return null

    candidatos.sort((a, b) => a.distanciaQuadrada - b.distanciaQuadrada)
    const proximos = candidatos.slice(0, VIZINHOS)

    // Em cima de um ponto medido vale a cota medida, sem media com nada.
    const primeiro = proximos[0]
    if (primeiro && primeiro.distanciaQuadrada < 1e-6) return primeiro.cota

    let numerador = 0
    let denominador = 0
    for (const candidato of proximos) {
      const peso = 1 / candidato.distanciaQuadrada
      numerador += peso * candidato.cota
      denominador += peso
    }
    return denominador === 0 ? null : numerador / denominador
  }
}

type Plano = { x: number; y: number; cota: number }

function chaveDaCelula(x: number, y: number): string {
  return `${Math.floor(x / LADO_CELULA)},${Math.floor(y / LADO_CELULA)}`
}

/**
 * Fonte que prefere a topografia e recorre aos mosaicos publicos fora dela.
 *
 * Cada cota sabe de onde veio, e isso chega a interface: descobrir tarde que
 * metade da rota foi planeada com dados de dezenas de metros de resolucao nao e
 * aceitavel.
 */
export class FonteComposta implements FonteTerreno {
  readonly origem: OrigemCota = 'dxf'

  constructor(
    private readonly topografia: FonteTerrenoDXF,
    private readonly publica: FonteTerreno,
  ) {}

  cobre(lat: number, lon: number): boolean {
    return this.topografia.cobre(lat, lon) || this.publica.cobre(lat, lon)
  }

  origemEm(lat: number, lon: number): OrigemCota {
    return this.topografia.cotaSincrona(lat, lon) !== null ? 'dxf' : 'terrarium'
  }

  async cota(lat: number, lon: number): Promise<number> {
    const doLevantamento = this.topografia.cotaSincrona(lat, lon)
    return doLevantamento ?? this.publica.cota(lat, lon)
  }

  async perfil(pontos: readonly LatLon[], passo: number): Promise<number[]> {
    const amostras = amostrarPercurso(pontos, passo)
    const doLevantamento = amostras.map((p) => this.topografia.cotaSincrona(p.lat, p.lon))

    const emFalta = amostras.filter((_, i) => doLevantamento[i] === null)

    /*
     * `cotas` e opcional na interface, e aqui estava a ser chamado com `?.`: uma
     * fonte que so implementasse `cota` ponto a ponto devolvia `undefined`, e
     * cada ponto fora do levantamento acabava com cota zero. Zero e uma cota
     * perfeitamente plausivel para quem le, e uma rota em AGL sobre terreno dado
     * como estando ao nivel do mar voa para dentro da encosta. Fora do
     * levantamento pergunta-se a fonte publica, com o metodo em lote se ela o
     * tiver e ponto a ponto se nao tiver, e nunca se inventa um valor.
     */
    const publicas =
      emFalta.length === 0
        ? []
        : this.publica.cotas
          ? await this.publica.cotas(emFalta)
          : await Promise.all(emFalta.map((p) => this.publica.cota(p.lat, p.lon)))

    if (publicas.length !== emFalta.length) {
      throw new Error(
        `a fonte ${this.publica.origem} devolveu ${publicas.length} cotas para ${emFalta.length} pontos`,
      )
    }

    let proxima = 0
    return doLevantamento.map((cota) => {
      if (cota !== null) return cota
      const publica = publicas[proxima++]
      if (publica === undefined) throw new Error('cota em falta fora do levantamento topografico')
      return publica
    })
  }
}
