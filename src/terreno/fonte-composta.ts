import type { LatLon } from '../nucleo/tipos.ts'
import { amostrarPercurso } from '../nucleo/geodesia.ts'
import type { FonteTerreno, OrigemCota } from './fonte.ts'

/**
 * Fonte que prefere a topografia e recorre aos mosaicos publicos fora dela.
 *
 * Cada cota sabe de onde veio, e isso chega a interface: descobrir tarde que
 * metade da rota foi planeada com dados de dezenas de metros de resolucao nao e
 * aceitavel.
 *
 * ## Porque e que isto vive num ficheiro so seu
 *
 * Estava ao lado do `FonteTerrenoDXF`, e o `App` importava os dois. So que o
 * `FonteTerrenoDXF` trabalha em PT-TM06 e traz o `proj4` atras dele - quarenta e
 * tal kilobytes que iam para toda a gente, incluindo quem nunca importa um DXF,
 * que e a maioria.
 *
 * Esta classe nao precisa de projeccao nenhuma: recebe a topografia ja
 * construida e so lhe faz perguntas. Separada, o `proj4` fica do lado de la e so
 * chega quando alguem importa mesmo um levantamento.
 */

/**
 * O que esta classe precisa de saber sobre uma topografia.
 *
 * Declarado pela forma e nao pelo nome da classe, de proposito: e isto que
 * permite que este ficheiro nao saiba que o `FonteTerrenoDXF` existe.
 */
export type Topografica = {
  cobre: (lat: number, lon: number) => boolean
  /** Cota no ponto, ou `null` se estiver fora da area coberta. */
  cotaSincrona: (lat: number, lon: number) => number | null
}

export class FonteComposta implements FonteTerreno {
  readonly origem: OrigemCota = 'dxf'

  constructor(
    private readonly topografia: Topografica,
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
