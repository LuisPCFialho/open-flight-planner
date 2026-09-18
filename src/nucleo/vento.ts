import type { LatLon, Vento } from './tipos.ts'
import { rumo } from './geodesia.ts'

/**
 * O vento, e o que ele faz a uma rota ja planeada.
 *
 * ## Porque e que o vento nao muda a duracao quase nunca
 *
 * Uma missao de waypoints e voada a velocidade **no solo**: pede-se 10 m/s e a
 * aeronave faz 10 m/s sobre o terreno, contra o vento ou a favor dele. Quem
 * espera que uma rota demore mais com vento de frente esta a pensar num aviao,
 * nao num multirotor em missao. O que muda nao e o tempo - e a inclinacao, e a
 * corrente que ela pede.
 *
 * Ate deixar de mudar. Para manter 10 m/s no solo contra 8 m/s de vento, a
 * aeronave tem de voar a 18 m/s no ar, e ha um ponto em que nao consegue. A
 * partir dai a velocidade no solo cai, o troco demora mais, e a estimativa que
 * se levou para o campo deixa de valer.
 *
 * ## O que este modulo calcula, e o que nao calcula
 *
 * Calcula esse ponto, e nada mais. E geometria de vectores: velocidade no ar =
 * velocidade no solo menos vento. Nao ha nenhuma constante inventada aqui - o
 * unico numero do aparelho que entra e a velocidade maxima em missao, que ja
 * estava no catalogo e vem da ficha do fabricante.
 *
 * **Nao calcula autonomia.** Vento de frente gasta mais bateria do que vento
 * nenhum, e uma grelha de ida e volta perde mais a subir contra o vento do que
 * recupera a descer com ele. Quanto, depende da curva de potencia do aparelho,
 * que a DJI nao publica. Inventar uma percentagem era dar a quem planeia um
 * numero com ar de calculado que nao tem nada por tras, e isso e pior do que
 * nao dizer nada.
 *
 * **Nao vai buscar previsao nenhuma.** O vento escreve-se a mao, do boletim que
 * se consultou. Uma previsao a 24 horas para um sitio nao e coisa que esta
 * ferramenta possa garantir, e a ferramenta nao guarda segredos de servico
 * nenhum.
 *
 * ## A convencao
 *
 * `rumo` e a direccao **de onde** o vento sopra, como em meteorologia e como em
 * qualquer boletim: 0 e vento de norte, 90 e vento de leste. A aeronave e que
 * anda para onde aponta o seu rumo. Trocar as duas e o engano classico, e por
 * isso o vector do vento e construido uma vez so, aqui.
 */

export type { Vento }

export const SEM_VENTO: Vento = { velocidade: 0, rumo: 0 }

const GRAUS = Math.PI / 180

/**
 * O vento como vector, em (leste, norte), a apontar para onde o ar se desloca.
 *
 * Vento de 270 - de oeste - move o ar para leste, e sai daqui (+v, 0).
 */
function vectorDoVento(vento: Vento): { leste: number; norte: number } {
  const para = (vento.rumo + 180) * GRAUS
  return { leste: vento.velocidade * Math.sin(para), norte: vento.velocidade * Math.cos(para) }
}

/**
 * Componentes do vento ao longo de um rumo, em m/s.
 *
 * `cauda` positiva e vento que empurra; negativa e vento de frente. `travessia`
 * e sempre positiva, porque o lado de onde vem nao muda nada do que se segue: a
 * aeronave tem de se inclinar contra ele de qualquer maneira.
 */
export function componentes(rumoDoTroco: number, vento: Vento): { cauda: number; travessia: number } {
  const v = vectorDoVento(vento)
  const a = rumoDoTroco * GRAUS
  const frente = { leste: Math.sin(a), norte: Math.cos(a) }
  const cauda = v.leste * frente.leste + v.norte * frente.norte
  /* O que sobra do vento depois de tirada a parte que vai ao longo do troco. */
  const travessia = Math.hypot(
    v.leste - cauda * frente.leste,
    v.norte - cauda * frente.norte,
  )
  return { cauda, travessia }
}

/**
 * Velocidade no ar que a aeronave precisa para manter uma velocidade no solo.
 *
 * E o modulo de (velocidade no solo menos vento). Com vento nulo da a propria
 * velocidade pedida, que e o caso normal.
 */
export function velocidadeNoArNecessaria(
  noSolo: number,
  rumoDoTroco: number,
  vento: Vento,
): number {
  const { cauda, travessia } = componentes(rumoDoTroco, vento)
  return Math.hypot(noSolo - cauda, travessia)
}

/**
 * Velocidade maxima no solo que a aeronave consegue manter num rumo.
 *
 * Resolve `|v·frente - vento| = maximoNoAr` em `v`. Com `t` a componente de
 * cauda e `c` a de travessia, sai `v = t + sqrt(maximo^2 - c^2)`.
 *
 * Devolve `null` quando nao ha solucao nenhuma: a travessia passa do que a
 * aeronave faz no ar, e nesse caso ela nao segue o troco - vai a deriva. Nao e
 * uma velocidade baixa, e um rumo que nao se mantem, e vale a pena distinguir.
 */
export function velocidadeMaximaNoSolo(
  rumoDoTroco: number,
  vento: Vento,
  maximoNoAr: number,
): number | null {
  const { cauda, travessia } = componentes(rumoDoTroco, vento)
  const dentro = maximoNoAr * maximoNoAr - travessia * travessia
  if (dentro <= 0) return null
  const v = cauda + Math.sqrt(dentro)
  return v > 0 ? v : null
}

export type TrocoComVento = {
  /** Indice do waypoint de chegada, que e o que leva a velocidade do troco. */
  indice: number
  rumo: number
  /** A que se pediu, em m/s. */
  pedida: number
  /** A que se consegue mesmo, em m/s. `null` quando o rumo nao se mantem. */
  conseguida: number | null
  /** Velocidade no ar precisa para a pedida, em m/s. */
  noAr: number
  /** Positiva contra o nariz, em m/s. */
  frente: number
  travessia: number
}

/**
 * Quanto e que o vento limita cada troco de um percurso.
 *
 * Recebe os pontos e a velocidade pedida em cada um em vez da rota inteira, para
 * poder servir tanto a rota como um troco solto - a ida ate ao primeiro ponto,
 * por exemplo, que nao e waypoint nenhum e conta para a bateria na mesma.
 */
export function trocosComVento(
  pontos: readonly LatLon[],
  velocidadePedida: (indice: number) => number,
  vento: Vento,
  maximoNoAr: number,
): TrocoComVento[] {
  const trocos: TrocoComVento[] = []
  for (let i = 1; i < pontos.length; i += 1) {
    const de = pontos[i - 1]
    const para = pontos[i]
    if (!de || !para) continue
    const r = rumo(de, para)
    const pedida = velocidadePedida(i)
    const { cauda, travessia } = componentes(r, vento)
    const limite = velocidadeMaximaNoSolo(r, vento, maximoNoAr)
    trocos.push({
      indice: i,
      rumo: r,
      pedida,
      conseguida: limite === null ? null : Math.min(pedida, limite),
      noAr: velocidadeNoArNecessaria(pedida, r, vento),
      frente: -cauda,
      travessia,
    })
  }
  return trocos
}

/** Se ha vento que valha a pena contar. Abaixo disto nao muda nada. */
export function temVento(vento: Vento | undefined): vento is Vento {
  return vento !== undefined && vento.velocidade > 0
}

/** Nome do quadrante, para escrever o vento como um boletim o escreve. */
export function quadrante(rumoGraus: number): string {
  const nomes = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  const normalizado = ((rumoGraus % 360) + 360) % 360
  return nomes[Math.round(normalizado / 45) % 8] ?? 'N'
}
