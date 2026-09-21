/**
 * Onde esta o sol, visto da obra.
 *
 * Serve para responder a pergunta que se faz na vespera: a que horas e que vale
 * a pena ir. Numa termografia de modulos o criterio a serio e a irradiancia no
 * plano, e essa nao se sabe de vespera - o que se sabe e a altura do sol, que e
 * o que a limita. Num levantamento fotogrametrico e o mesmo numero que decide o
 * comprimento das sombras entre filas.
 *
 * As contas sao as do algoritmo do NOAA, em tempo universal. Nao dependem de
 * servico nenhum: a posicao do sol e astronomia, nao e meteorologia.
 *
 * O que isto **nao** diz: se ha nuvens, se ha vento, ou qual a irradiancia. Diz
 * onde esta o sol num ceu limpo, e mais nada. Confirmar com a previsao do dia
 * continua a ser trabalho de quem vai.
 */

const GRAUS = Math.PI / 180

export type PosicaoDoSol = {
  /** Altura acima do horizonte, em graus. Negativa com o sol posto. */
  elevacao: number
  /** Azimute em graus, zero a norte e a crescer para leste. */
  azimute: number
}

/** Dias julianos desde a epoca J2000, a partir de um instante em milesimos. */
function seculoJuliano(instante: number): number {
  const diaJuliano = instante / 86400000 + 2440587.5
  return (diaJuliano - 2451545) / 36525
}

/**
 * Posicao do sol num instante, vista de um ponto.
 *
 * `instante` em milesimos desde a epoca, como `Date.now()`. A elevacao nao leva
 * correccao de refraccao: para escolher a hora de um voo a diferenca e de
 * minutos, e a refraccao so conta perto do horizonte, que e justamente quando
 * nao se voa.
 */
export function posicaoDoSol(lat: number, lon: number, instante: number): PosicaoDoSol {
  const t = seculoJuliano(instante)

  // Longitude e anomalia medias do sol.
  const longitudeMedia = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const anomaliaMedia = 357.52911 + t * (35999.05029 - 0.0001537 * t)

  // Equacao do centro: a orbita e uma elipse, nao um circulo.
  const centro =
    Math.sin(anomaliaMedia * GRAUS) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * anomaliaMedia * GRAUS) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * anomaliaMedia * GRAUS) * 0.000289

  const longitudeVerdadeira = longitudeMedia + centro
  const longitudeAparente =
    longitudeVerdadeira - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * GRAUS)

  // Obliquidade da ecliptica: a inclinacao do eixo da Terra.
  const obliquidadeMedia =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquidade = obliquidadeMedia + 0.00256 * Math.cos((125.04 - 1934.136 * t) * GRAUS)

  const declinacao =
    Math.asin(Math.sin(obliquidade * GRAUS) * Math.sin(longitudeAparente * GRAUS)) / GRAUS

  // Equacao do tempo: o sol verdadeiro adianta-se e atrasa-se ao longo do ano.
  const y = Math.tan((obliquidade / 2) * GRAUS) ** 2
  const excentricidade = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const equacaoDoTempo =
    (4 *
      (y * Math.sin(2 * longitudeMedia * GRAUS) -
        2 * excentricidade * Math.sin(anomaliaMedia * GRAUS) +
        4 * excentricidade * y * Math.sin(anomaliaMedia * GRAUS) * Math.cos(2 * longitudeMedia * GRAUS) -
        0.5 * y * y * Math.sin(4 * longitudeMedia * GRAUS) -
        1.25 * excentricidade * excentricidade * Math.sin(2 * anomaliaMedia * GRAUS))) /
    GRAUS

  // Minutos desde a meia-noite universal.
  const minutosUTC = ((instante % 86400000) + 86400000) % 86400000 / 60000
  /*
   * Angulo horario: quanto falta para o sol passar pelo meridiano do sitio.
   *
   * Zero ao meio-dia solar, negativo de manha, positivo de tarde. Os quatro
   * minutos por grau sao os 1440 minutos do dia a dividir pelos 360 graus.
   */
  const anguloHorario = (minutosUTC + equacaoDoTempo + 4 * lon) / 4 - 180

  const senoElevacao =
    Math.sin(lat * GRAUS) * Math.sin(declinacao * GRAUS) +
    Math.cos(lat * GRAUS) * Math.cos(declinacao * GRAUS) * Math.cos(anguloHorario * GRAUS)
  const elevacao = Math.asin(Math.max(-1, Math.min(1, senoElevacao))) / GRAUS

  const cosAzimute =
    (Math.sin(declinacao * GRAUS) - Math.sin(lat * GRAUS) * senoElevacao) /
    (Math.cos(lat * GRAUS) * Math.cos(elevacao * GRAUS))
  const azimuteBruto = Math.acos(Math.max(-1, Math.min(1, cosAzimute))) / GRAUS

  // Antes do meio-dia solar o sol esta a nascente; depois, a poente.
  const azimute = anguloHorario < 0 ? azimuteBruto : 360 - azimuteBruto

  return { elevacao, azimute: ((azimute % 360) + 360) % 360 }
}

export type JanelaSolar = {
  /** Instante em que o sol sobe acima do minimo, ou `null` se nunca sobe. */
  inicio: number | null
  fim: number | null
  /** Elevacao maxima do dia, em graus. */
  elevacaoMaxima: number
  /** Instante do meio-dia solar, o ponto mais alto. */
  meioDiaSolar: number
}

/** Passo da amostragem, em milesimos. Um minuto chega para escolher uma hora. */
const PASSO = 60000

/**
 * A janela do dia em que o sol esta acima de uma dada altura.
 *
 * Amostra-se minuto a minuto em vez de resolver a equacao. Sao mil quatrocentos
 * e quarenta contas, que nao se notam, e evita todos os casos de fronteira em
 * que a resolucao analitica se engana - latitudes altas, dias em que o sol
 * nunca chega ao minimo, dias em que nunca desce abaixo dele.
 */
export function janelaSolar(
  lat: number,
  lon: number,
  /** Qualquer instante do dia em causa, em tempo universal. */
  diaEm: number,
  elevacaoMinima: number,
): JanelaSolar {
  const inicioDoDia = Math.floor(diaEm / 86400000) * 86400000

  let inicio: number | null = null
  let fim: number | null = null
  let elevacaoMaxima = -90
  let meioDiaSolar = inicioDoDia

  for (let m = 0; m < 1440; m++) {
    const instante = inicioDoDia + m * PASSO
    const { elevacao } = posicaoDoSol(lat, lon, instante)

    if (elevacao > elevacaoMaxima) {
      elevacaoMaxima = elevacao
      meioDiaSolar = instante
    }
    if (elevacao >= elevacaoMinima) {
      inicio ??= instante
      fim = instante
    }
  }

  return { inicio, fim, elevacaoMaxima, meioDiaSolar }
}

/**
 * Elevacao minima a partir da qual se considera a janela util, em graus.
 *
 * **Regra pratica, nao norma.** A norma de termografia de centrais fala em
 * irradiancia no plano dos modulos, que depende do ceu e da inclinacao e nao se
 * sabe de vespera; a altura do sol e o que a limita e e o que um planeador
 * consegue dizer. Trinta graus e o valor com que se costuma trabalhar em
 * Portugal - e editavel de proposito, e quem souber melhor que o mude.
 */
export const ELEVACAO_MINIMA_PREDEFINIDA = 30

/**
 * De onde vem a luz, e quanta luz ha sem ela.
 *
 * Serve o desenho do aparelho no mapa, que ate agora era iluminado por uma
 * direccao fixa escrita no shader - a mesma as nove da manha e as seis da
 * tarde. Como a posicao do sol ja se calcula aqui, e para o proprio sitio e a
 * propria hora, nao ha razao nenhuma para a luz ser inventada.
 *
 * ## O que acontece de noite
 *
 * Com o sol posto, a direccao verdadeira poe o aparelho todo em sombra e o que
 * se ve e uma silhueta preta. Isto e uma ferramenta de trabalho e nao um
 * simulador: a partir do horizonte a luz levanta-se para cima e a componente
 * ambiente sobe, de modo a que o aparelho continue legivel. Deixa de ser
 * fisicamente verdade, e e uma troca deliberada.
 *
 * A transicao e gradual entre o horizonte e `ELEVACAO_DE_TRANSICAO` graus, para
 * o aparelho nao mudar de aspecto de repente ao pôr do sol.
 */

/** Acima disto a luz e a do sol. Abaixo, vai-se levantando ate ficar de cima. */
const ELEVACAO_DE_TRANSICAO = 8

/** Quanta luz ha nas faces que o sol nao apanha. */
const AMBIENTE_DE_DIA = 0.4
const AMBIENTE_DE_NOITE = 0.62

export type Iluminacao = {
  /** Direccao normalizada de onde a luz vem, em (leste, norte, cima). */
  direccao: readonly [number, number, number]
  /** Quanto se ve das faces que a luz nao apanha, de 0 a 1. */
  ambiente: number
}

export function iluminacaoDoSol(lat: number, lon: number, instante: number): Iluminacao {
  const { elevacao, azimute } = posicaoDoSol(lat, lon, instante)

  /*
   * Quanto do sol verdadeiro se usa: tudo acima da transicao, nada abaixo do
   * horizonte, e a interpolar pelo meio.
   */
  const peso = Math.min(1, Math.max(0, elevacao / ELEVACAO_DE_TRANSICAO))

  const e = elevacao * GRAUS
  const a = azimute * GRAUS
  const doSol: [number, number, number] = [
    Math.cos(e) * Math.sin(a),
    Math.cos(e) * Math.cos(a),
    Math.sin(e),
  ]

  // A luz de recurso vem de cima, com uma inclinacao ligeira para dar relevo.
  const deCima: [number, number, number] = [0.35, 0.25, 0.9]

  const misturada: [number, number, number] = [
    doSol[0] * peso + deCima[0] * (1 - peso),
    doSol[1] * peso + deCima[1] * (1 - peso),
    doSol[2] * peso + deCima[2] * (1 - peso),
  ]

  const comprimento = Math.hypot(...misturada) || 1

  return {
    direccao: [
      misturada[0] / comprimento,
      misturada[1] / comprimento,
      misturada[2] / comprimento,
    ],
    ambiente: AMBIENTE_DE_NOITE + (AMBIENTE_DE_DIA - AMBIENTE_DE_NOITE) * peso,
  }
}
