import type { LatLon } from './tipos.ts'
import { deslocar } from './geodesia.ts'

/**
 * Integracao de um passo do voo virtual.
 *
 * Vive aqui, fora do hook, porque e a parte que decide o comportamento dos
 * comandos e a unica que vale a pena poder verificar: dentro do ciclo de
 * animacao nao ha como exercita-la, que o `requestAnimationFrame` nem sequer
 * corre com a janela por tras de outra.
 */

/**
 * O que se grava num waypoint: onde esta, e para onde olha.
 *
 * A velocidade e a atitude nao estao aqui de proposito. Sao coisas que so
 * existem enquanto se voa e que nao fazem sentido dentro de um waypoint - o
 * ficheiro que vai para o aparelho diz onde passar, nao com que inclinacao.
 * Vivem em `Movimento`.
 */
export type EstadoVoo = {
  posicao: LatLon
  /** Altura no modo de altitude da rota. */
  altura: number
  /** Rumo da aeronave em graus. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
  /** Rotacao do gimbal em graus, relativa ao nariz da aeronave. */
  gimbalYaw: number
}

/**
 * O que so existe enquanto se voa: para onde vai, e como esta inclinada.
 *
 * A velocidade esta no referencial do terreno e nao no da aeronave, e isso e
 * uma escolha com consequencia: rodar a meio de uma deslocacao nao muda para
 * onde ela vai. A aeronave passa a andar de lado enquanto a velocidade nao
 * acompanha o novo rumo, que e o que um multirotor faz mesmo.
 */
export type Movimento = {
  /** Metros por segundo para leste. */
  leste: number
  /** Metros por segundo para norte. */
  norte: number
  /** Graus, positivo com o nariz acima do horizonte. */
  inclinacao: number
  /** Graus, positivo a inclinar para a direita. */
  rolamento: number
}

export const PARADO: Movimento = { leste: 0, norte: 0, inclinacao: 0, rolamento: 0 }

/** Metros por segundo em translacao, graus por segundo em rotacao. */
export const VELOCIDADE = 18

/**
 * Gama da velocidade de deslocacao no voo virtual.
 *
 * Nao e a velocidade da rota: e a que se anda a reconhecer o sitio. A devagar
 * enquadra-se um alcado com cuidado, a depressa atravessa-se uma central de
 * ponta a ponta sem esperar.
 */
export const VELOCIDADE_MINIMA = 2
export const VELOCIDADE_MAXIMA = 60
/** Passo de cada toque nas teclas de mais e menos. */
export const PASSO_VELOCIDADE = 2
export const VELOCIDADE_VERTICAL = 10
export const ROTACAO = 70
export const ROTACAO_GIMBAL = 45

/**
 * Aceleracao no voo virtual, em m/s2.
 *
 * **Nao e a de `estatisticas.ts`.** La esta 1,5 m/s2, e esse numero foi medido
 * contra uma rota real do Pilot 2 - mas e a aceleracao de uma missao de
 * waypoints, onde a aeronave trava com cuidado em cada ponto. A 18 m/s, com
 * esse valor, o voo virtual levava doze segundos a arrancar.
 *
 * Este e escolhido pelo toque, como a `ROTACAO` e a `VELOCIDADE_VERTICAL` que
 * ja aqui estavam: dois segundos e picos ate a velocidade de cruzeiro. Nao e
 * uma especificacao de aparelho nenhum e nao deve ser lido como tal.
 */
export const ACELERACAO = 8

/**
 * Aceleracao da gravidade, em m/s2.
 *
 * Esta nao se escolhe. E ela que transforma a aceleracao em inclinacao: para
 * acelerar, um multirotor tem de inclinar o impulso, e o angulo sai de
 * `tan(θ) = a/g`. Sem mais nada, sem coeficiente nenhum.
 */
export const GRAVIDADE = 9.80665

/** Com Alt premido tudo abranda, para o ajuste fino do enquadramento. */
export const FACTOR_FINO = 0.2

/**
 * Limites do gimbal, em graus.
 *
 * A inclinacao vai de 90 para baixo a 45 para cima. A rotacao em relacao a
 * aeronave esta limitada a um quarto de volta para cada lado: e um valor
 * prudente e por confirmar contra a especificacao de cada aparelho, tal como o
 * campo de visao e a autonomia em `drones.ts`.
 */
export const PITCH_MINIMO = -90
export const PITCH_MAXIMO = 45
export const YAW_MAXIMO = 90

export function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor))
}

export function normalizarGraus(graus: number): number {
  return ((graus % 360) + 360) % 360
}

/**
 * Avanca o estado `delta` segundos, com as teclas que estiverem premidas.
 *
 * A separacao entre aeronave e camara e a razao de ser desta funcao: Q e E
 * rodam o aparelho, as quatro setas sao do gimbal e so dele. Antes as setas da
 * esquerda e da direita rodavam a aeronave, o mesmo que Q e E, e o `gimbalYaw`
 * nao tinha comando nenhum apesar de existir no modelo e de ir para o ficheiro.
 */
const GRAUS = Math.PI / 180

/**
 * A atitude que uma aceleracao implica.
 *
 * Um multirotor nao tem outra maneira de acelerar senao inclinar o impulso: a
 * componente horizontal e que o empurra, e o angulo sai de `tan(θ) = a/g`. Nao
 * ha aqui coeficiente nenhum nem constante escolhida - so a gravidade.
 *
 * Acelerar em frente baixa o nariz; travar levanta-o, que e o que se ve quando
 * se larga o comando. Acelerar para a direita inclina para a direita.
 *
 * O que **nao** se modela e a inclinacao de cruzeiro. A velocidade constante um
 * multirotor mantem o nariz um pouco em baixo para vencer a resistencia do ar, e
 * quanto depende de uma curva de arrasto que nao se sabe. Aqui, velocidade
 * constante e voo direito.
 */
export function atitudeDaAceleracao(
  aceleracaoLeste: number,
  aceleracaoNorte: number,
  guinada: number,
): { inclinacao: number; rolamento: number } {
  const a = guinada * GRAUS
  const nariz = { leste: Math.sin(a), norte: Math.cos(a) }
  // A direita do nariz: um quarto de volta no sentido dos ponteiros.
  const direita = { leste: Math.cos(a), norte: -Math.sin(a) }

  const aFrente = aceleracaoLeste * nariz.leste + aceleracaoNorte * nariz.norte
  const aDireita = aceleracaoLeste * direita.leste + aceleracaoNorte * direita.norte

  return {
    inclinacao: (-Math.atan2(aFrente, GRAVIDADE) * 180) / Math.PI,
    rolamento: (Math.atan2(aDireita, GRAVIDADE) * 180) / Math.PI,
  }
}

export function avancarVoo(
  estado: EstadoVoo,
  movimento: Movimento,
  teclas: ReadonlySet<string>,
  delta: number,
  opcoes: { velocidade?: number } = {},
): { estado: EstadoVoo; movimento: Movimento } {
  const velocidade = opcoes.velocidade ?? VELOCIDADE
  const fino = teclas.has('alt') ? FACTOR_FINO : 1
  let { posicao, altura, guinada, gimbalPitch, gimbalYaw } = estado

  // Deslocacao no referencial da aeronave: W e sempre em frente.
  let frente = 0
  let lado = 0
  if (teclas.has('w')) frente += 1
  if (teclas.has('s')) frente -= 1
  if (teclas.has('d')) lado += 1
  if (teclas.has('a')) lado -= 1

  /*
   * A velocidade que se pede com as teclas, no referencial do terreno.
   *
   * A velocidade e a mesma em qualquer direccao. O comprimento do vector das
   * teclas servia de factor, e em diagonal vale raiz de dois: W e D juntos
   * levavam a aeronave 41% mais depressa do que W sozinho. So interessa a
   * direccao, que sai do `atan2`.
   */
  let pedidaLeste = 0
  let pedidaNorte = 0
  if (frente !== 0 || lado !== 0) {
    const rumo = normalizarGraus(guinada + (Math.atan2(lado, frente) * 180) / Math.PI) * GRAUS
    pedidaLeste = velocidade * fino * Math.sin(rumo)
    pedidaNorte = velocidade * fino * Math.cos(rumo)
  }

  /*
   * A velocidade persegue a pedida, sem lá chegar de um fotograma para o outro.
   *
   * E daqui que sai tudo o resto: a aeronave demora a arrancar, demora a parar,
   * e continua a andar para onde ia se alguem a rodar a meio. Sem isto nao ha
   * aceleracao nenhuma de onde tirar a inclinacao - havia so velocidade a ligar
   * e a desligar.
   */
  const faltaLeste = pedidaLeste - movimento.leste
  const faltaNorte = pedidaNorte - movimento.norte
  const falta = Math.hypot(faltaLeste, faltaNorte)
  const passo = Math.min(falta, ACELERACAO * delta)

  let novoLeste = movimento.leste
  let novoNorte = movimento.norte
  if (falta > 1e-9) {
    novoLeste += (faltaLeste / falta) * passo
    novoNorte += (faltaNorte / falta) * passo
  }

  const andados = Math.hypot(novoLeste, novoNorte) * delta
  if (andados > 1e-9) {
    const rumoDoMovimento = normalizarGraus((Math.atan2(novoLeste, novoNorte) * 180) / Math.PI)
    posicao = deslocar(posicao, rumoDoMovimento, andados)
  }

  // Aeronave.
  if (teclas.has('q')) guinada -= ROTACAO * delta * fino
  if (teclas.has('e')) guinada += ROTACAO * delta * fino
  guinada = normalizarGraus(guinada)

  if (teclas.has('c')) altura += VELOCIDADE_VERTICAL * delta * fino
  if (teclas.has('z')) altura -= VELOCIDADE_VERTICAL * delta * fino

  // Camara.
  if (teclas.has('arrowup')) gimbalPitch += ROTACAO_GIMBAL * delta * fino
  if (teclas.has('arrowdown')) gimbalPitch -= ROTACAO_GIMBAL * delta * fino
  gimbalPitch = limitar(gimbalPitch, PITCH_MINIMO, PITCH_MAXIMO)

  if (teclas.has('arrowleft')) gimbalYaw -= ROTACAO_GIMBAL * delta * fino
  if (teclas.has('arrowright')) gimbalYaw += ROTACAO_GIMBAL * delta * fino
  gimbalYaw = limitar(gimbalYaw, -YAW_MAXIMO, YAW_MAXIMO)

  /*
   * A atitude sai da aceleracao que acabou de acontecer, e nao da pedida.
   *
   * A diferenca aparece quando a aeronave ja vai a velocidade de cruzeiro: a
   * pedida continua cheia, a aceleracao e zero, e a aeronave endireita-se - que
   * e o que tem de fazer.
   */
  const atitude =
    delta > 0
      ? atitudeDaAceleracao(
          (novoLeste - movimento.leste) / delta,
          (novoNorte - movimento.norte) / delta,
          guinada,
        )
      : { inclinacao: movimento.inclinacao, rolamento: movimento.rolamento }

  return {
    estado: { posicao, altura, guinada, gimbalPitch, gimbalYaw },
    movimento: { leste: novoLeste, norte: novoNorte, ...atitude },
  }
}

/** Velocidade de deslocacao depois de somar `delta`, dentro da gama aceite. */
export function velocidadeAjustada(actual: number, delta: number): number {
  return limitar(actual + delta, VELOCIDADE_MINIMA, VELOCIDADE_MAXIMA)
}

/**
 * Roda a aeronave por incrementos. Serve o arrasto do rato na vista de camara.
 *
 * Nao tem limites, ao contrario do gimbal: uma aeronave da voltas completas, e
 * o rumo normaliza-se entre zero e trezentos e sessenta.
 */
export function rodarAeronave(estado: EstadoVoo, deltaGraus: number): EstadoVoo {
  return { ...estado, guinada: normalizarGraus(estado.guinada + deltaGraus) }
}

/** Aponta o gimbal por incrementos, com os mesmos limites. Serve o rato. */
export function apontarGimbal(
  estado: EstadoVoo,
  deltaPitch: number,
  deltaYaw: number,
): EstadoVoo {
  return {
    ...estado,
    gimbalPitch: limitar(estado.gimbalPitch + deltaPitch, PITCH_MINIMO, PITCH_MAXIMO),
    gimbalYaw: limitar(estado.gimbalYaw + deltaYaw, -YAW_MAXIMO, YAW_MAXIMO),
  }
}
