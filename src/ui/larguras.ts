import { useEffect, useState } from 'react'

/**
 * Quanto espaco cabe mesmo aos paineis laterais.
 *
 * As larguras que ficam guardadas sao uma preferencia, e uma preferencia
 * escolhida num ecra grande nao serve num pequeno: com 240 a esquerda e 300 a
 * direita, num portatil de 900 pontos sobravam 350 para o mapa - que e a coisa
 * que se veio aqui ver.
 *
 * O que se faz nao e mexer na preferencia: e aperta-la enquanto a janela for
 * estreita. Quem alargar a janela volta a ter a largura que escolheu, sem ter
 * de arrastar outra vez.
 */

/** O mapa nunca desce daqui por causa dos paineis. */
export const MAPA_MINIMO = 430

/**
 * Ate onde um painel pode ser apertado automaticamente.
 *
 * E mais estreito do que o minimo do arrasto de proposito: a arrumacao
 * automatica pode ir mais longe do que a mao vai, porque e temporaria e
 * reversivel. Abaixo disto a lista de waypoints deixa de mostrar a altura ao
 * lado do numero, e ai ja nao adianta encolher mais.
 */
export const LARGURA_APERTADA = 148

export type LargurasDosPaineis = { esquerda: number; direita: number }

/**
 * Aperta os dois paineis o suficiente para o mapa ter espaco.
 *
 * Aperta-os na mesma proporcao, para o que estivesse mais largo continuar mais
 * largo. Quando nem os dois no minimo chegam, ficam os dois no minimo e o mapa
 * leva o que sobrar - numa janela assim tao estreita nao ha arrumacao que
 * salve, e mais vale nao esconder nenhum dos dois.
 */
export function encolherPaineis(
  janela: number,
  guardadas: LargurasDosPaineis,
): LargurasDosPaineis {
  const pedido = guardadas.esquerda + guardadas.direita
  const disponivel = janela - MAPA_MINIMO

  if (pedido <= disponivel) return guardadas
  if (disponivel <= LARGURA_APERTADA * 2) {
    return { esquerda: LARGURA_APERTADA, direita: LARGURA_APERTADA }
  }

  const factor = disponivel / pedido
  const esquerda = Math.max(LARGURA_APERTADA, Math.round(guardadas.esquerda * factor))
  const direita = Math.max(LARGURA_APERTADA, Math.round(guardadas.direita * factor))

  /*
   * O minimo pode ter empurrado a soma para cima do disponivel outra vez. Nesse
   * caso o que nao esta no minimo devolve a diferenca, porque e o unico que
   * ainda tem folga.
   */
  const excesso = esquerda + direita - disponivel
  if (excesso <= 0) return { esquerda, direita }

  if (esquerda > direita) {
    return { esquerda: Math.max(LARGURA_APERTADA, esquerda - excesso), direita }
  }
  return { esquerda, direita: Math.max(LARGURA_APERTADA, direita - excesso) }
}

/** Largura da janela, acompanhada enquanto ela muda. */
export function useLarguraDaJanela(): number {
  const [largura, setLargura] = useState(() =>
    typeof window === 'undefined' ? 1920 : window.innerWidth,
  )

  useEffect(() => {
    const medir = (): void => setLargura(window.innerWidth)
    window.addEventListener('resize', medir)
    // A janela pode ter mudado entre o primeiro render e este efeito.
    medir()
    return () => window.removeEventListener('resize', medir)
  }, [])

  return largura
}
