import type { LatLon, POI, Rota, Waypoint } from './tipos.ts'
import { deslocar } from './geodesia.ts'
import { novoId } from './ids.ts'
import { renumerar, waypointNovo } from './operacoes-rota.ts'
import { PITCH_MAXIMO, PITCH_MINIMO } from './voo.ts'

/**
 * Voltar a um ponto, a olhar sempre para ele.
 *
 * A cobertura serve o que esta deitado: o terreno, a parcela, o campo de
 * paineis. Para o que esta de pe - um posto de transformacao, um mastro de
 * medicao, um poste, uma torre de inversor - uma grelha por cima nao vale nada:
 * ve-se o telhado e mais nada. O que se faz e andar a volta a distancia fixa,
 * com a camara sempre apontada ao meio.
 *
 * ## O angulo da camara nao se escolhe, calcula-se
 *
 * Com a aeronave a `raio` metros do eixo e `altura` acima do que ha para ver, o
 * angulo que aponta ao alvo e `-atan(altura / raio)` e nao ha nada a decidir
 * nisso. Deixa-lo a mao dava uma volta inteira com o alvo a sair do
 * enquadramento a meio, que e o unico erro que uma orbita pode mesmo dar.
 *
 * ## O rumo tambem nao
 *
 * Cada waypoint fica em `towardPOI`, preso ao proprio ponto. Podia sair escrito
 * em graus - a conta e a mesma - mas preso ao POI a rota continua certa depois
 * de alguem arrastar o ponto no mapa, e e isso que se faz a seguir a olhar para
 * uma orbita: acertar o centro.
 */

/** Passo angular minimo, em graus. Abaixo disto sao waypoints a mais por nada. */
export const PASSO_MINIMO = 5

export type OpcoesOrbita = {
  /** O ponto no meio. A orbita aponta-lhe e a altura conta-se a partir dele. */
  centro: POI
  /** Distancia horizontal ao eixo, em metros. */
  raio: number
  /**
   * Quanto acima do ponto voa a aeronave, em metros.
   *
   * Contado a partir da altura do POI e nao do solo: o que se quer enquadrar e o
   * proprio ponto, e e dele que o angulo da camara sai.
   */
  acimaDoPonto: number
  /** Graus entre waypoints consecutivos. */
  passoGraus: number
  /** Onde a volta comeca, em graus a contar do norte. */
  rumoInicial: number
  /** `true` para andar no sentido dos ponteiros do relogio. */
  horario: boolean
  /** Uma foto em cada ponto. */
  comFoto: boolean
}

export type Orbita = {
  /** Os pontos da volta, ja na ordem de voo. */
  pontos: LatLon[]
  /** Graus, negativo para baixo. E o que aponta ao centro. */
  gimbalPitch: number
  /** Altura de voo no mesmo sistema da rota. */
  altura: number
  /** Metros percorridos na volta completa. */
  distancia: number
}

/**
 * Inclinacao que aponta ao centro, em graus.
 *
 * Negativa para baixo, que e a convencao do resto do projecto.
 *
 * Fica presa aos mesmos limites que o resto da aplicacao usa para o
 * estabilizador - de 90 para baixo a 45 para cima - e nao por arrumacao: uma
 * rota que peca 80 graus para cima nao e uma rota que enquadra mal, e uma rota
 * que o aparelho nao aceita. Quando o limite aperta, quem o diz e
 * `apontaMesmoAoCentro`, porque nesse caso a promessa deste modulo - a camara
 * sempre no alvo - deixa de se cumprir e isso tem de se ver.
 */
export function inclinacaoParaOCentro(raio: number, acimaDoPonto: number): number {
  const exacta = !(raio > 0)
    ? acimaDoPonto >= 0
      ? -90
      : 90
    : (-Math.atan2(acimaDoPonto, raio) * 180) / Math.PI
  return Math.min(PITCH_MAXIMO, Math.max(PITCH_MINIMO, exacta))
}

/**
 * Se a inclinacao escolhida aponta mesmo ao centro, ou se bateu no limite.
 *
 * Bate quando se voa muito abaixo do alvo e perto dele - o caso de olhar para o
 * cimo de uma torre de baixo. O estabilizador nao sobe dos 45 graus, e a partir
 * dai o alvo sai por cima do enquadramento.
 */
export function apontaMesmoAoCentro(raio: number, acimaDoPonto: number): boolean {
  if (!(raio > 0)) return false
  const exacta = (-Math.atan2(acimaDoPonto, raio) * 180) / Math.PI
  return exacta >= PITCH_MINIMO && exacta <= PITCH_MAXIMO
}

export function gerarOrbita(opcoes: OpcoesOrbita): Orbita {
  const passo = Math.max(PASSO_MINIMO, opcoes.passoGraus)
  const gimbalPitch = inclinacaoParaOCentro(opcoes.raio, opcoes.acimaDoPonto)
  const altura = opcoes.centro.altura + opcoes.acimaDoPonto

  if (!(opcoes.raio > 0)) {
    return { pontos: [], gimbalPitch, altura, distancia: 0 }
  }

  /*
   * Quantos pontos cabem na volta, sem repetir o primeiro no fim.
   *
   * O passo pedido raramente divide 360 certo - 50 graus, por exemplo - e nesse
   * caso usa-se o passo que divide, ligeiramente menor. Fechar a volta com um
   * troco mais curto do que os outros dava um salto visivel no ultimo waypoint.
   */
  const quantos = Math.max(3, Math.round(360 / passo))
  const passoReal = 360 / quantos
  const sentido = opcoes.horario ? 1 : -1

  const pontos: LatLon[] = []
  for (let i = 0; i < quantos; i += 1) {
    const rumo = opcoes.rumoInicial + sentido * i * passoReal
    pontos.push(deslocar(opcoes.centro, rumo, opcoes.raio))
  }

  /*
   * O perimetro sai da circunferencia e nao da soma dos trocos.
   *
   * Sao coisas diferentes: os trocos sao cordas e ficam sempre por dentro do
   * circulo. Com poucos pontos a diferenca chega aos cinco por cento, e o que a
   * aeronave percorre e a corda - e por isso e a corda que se soma.
   */
  const corda = 2 * opcoes.raio * Math.sin(Math.PI / quantos)

  return { pontos, gimbalPitch, altura, distancia: corda * quantos }
}

/**
 * Acrescenta a orbita a rota, como waypoints.
 *
 * Vao para o fim e nao substituem o que la esta, como a cobertura: quem gera uma
 * orbita por cima de trabalho feito nao devia perde-lo por engano.
 */
export function acrescentarOrbita(rota: Rota, orbita: Orbita, opcoes: OpcoesOrbita): Rota {
  if (orbita.pontos.length === 0) return rota

  const novos: Waypoint[] = orbita.pontos.map((ponto) => ({
    ...waypointNovo({ lat: ponto.lat, lon: ponto.lon, altura: orbita.altura, index: 0 }),
    id: novoId(),
    /*
     * Preso ao POI, e nao com o rumo escrito em graus.
     *
     * A conta e a mesma nas duas, mas assim a rota continua certa depois de
     * alguem arrastar o ponto no mapa - que e o que se faz a seguir a olhar
     * para uma orbita.
     */
    modoGuinada: 'towardPOI' as const,
    poiId: opcoes.centro.id,
    gimbalPitch: orbita.gimbalPitch,
    gimbalYaw: 0,
    // Parar em cada ponto: uma foto tirada em movimento numa curva sai arrastada.
    tipoCurva: opcoes.comFoto ? ('pararNoPonto' as const) : ('passarSuave' as const),
    acoes: opcoes.comFoto ? [{ tipo: 'tirarFoto' as const }] : [],
  }))

  return { ...rota, waypoints: renumerar([...rota.waypoints, ...novos]) }
}
