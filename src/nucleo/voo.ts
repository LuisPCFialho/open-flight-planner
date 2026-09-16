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
export function avancarVoo(
  estado: EstadoVoo,
  teclas: ReadonlySet<string>,
  delta: number,
  opcoes: { velocidade?: number } = {},
): EstadoVoo {
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

  if (frente !== 0 || lado !== 0) {
    /*
     * A velocidade e a mesma em qualquer direccao.
     *
     * O comprimento do vector das teclas servia de factor, e em diagonal vale
     * raiz de dois: W e D juntos levavam a aeronave 41% mais depressa do que W
     * sozinho. Aqui so interessa a direccao, que sai do `atan2`.
     */
    const rumo = normalizarGraus(guinada + (Math.atan2(lado, frente) * 180) / Math.PI)
    posicao = deslocar(posicao, rumo, velocidade * delta * fino)
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

  return { posicao, altura, guinada, gimbalPitch, gimbalYaw }
}

/** Velocidade de deslocacao depois de somar `delta`, dentro da gama aceite. */
export function velocidadeAjustada(actual: number, delta: number): number {
  return limitar(actual + delta, VELOCIDADE_MINIMA, VELOCIDADE_MAXIMA)
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
