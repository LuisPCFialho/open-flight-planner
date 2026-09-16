/**
 * Navegacao com o rato ao estilo do Google Earth.
 *
 * O que o MapLibre ja faz igual fica como esta: arrastar com o botao esquerdo
 * desloca, a roda aproxima sobre o cursor, e arrastar com o botao direito ou com
 * Ctrl roda e inclina. O que diverge sao duas coisas:
 *
 * - Shift e arrastar desenha uma caixa de zoom, que e um habito de mapas 2D e
 *   nao existe no Earth, onde inclina e roda;
 * - o botao do meio nao faz nada, e no Earth tambem inclina e roda.
 *
 * A conta do arrasto vive separada da ligacao aos eventos para poder ser
 * verificada sem browser nenhum.
 */

/** Graus de rotacao por pixel arrastado na horizontal. */
export const GRAUS_RUMO_POR_PIXEL = 0.4
/** Graus de inclinacao por pixel arrastado na vertical. */
export const GRAUS_INCLINACAO_POR_PIXEL = 0.4

export type Orientacao = { rumo: number; inclinacao: number }

export type LimitesInclinacao = { minima: number; maxima: number }

/**
 * Orientacao depois de arrastar `dx`, `dy` pixeis.
 *
 * Arrastar para cima inclina a vista para a rasante, como no Earth: puxa-se o
 * horizonte para baixo. Arrastar para o lado roda no mesmo sentido do arrasto.
 */
export function orientacaoAposArrasto(
  actual: Orientacao,
  dx: number,
  dy: number,
  limites: LimitesInclinacao,
): Orientacao {
  const rumo = ((actual.rumo + dx * GRAUS_RUMO_POR_PIXEL) % 360 + 360) % 360

  const inclinacao = Math.max(
    limites.minima,
    Math.min(limites.maxima, actual.inclinacao - dy * GRAUS_INCLINACAO_POR_PIXEL),
  )

  return { rumo, inclinacao }
}

/** Se este evento de rato deve conduzir a orientacao em vez de deslocar o mapa. */
export function arrastoDeOrientacao(evento: {
  button: number
  shiftKey: boolean
}): boolean {
  // Botao do meio, ou Shift com o esquerdo.
  return evento.button === 1 || (evento.button === 0 && evento.shiftKey)
}
