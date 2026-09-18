import type { AccaoFinal, AccaoPerdaSinal } from '../nucleo/tipos.ts'

/**
 * Os nomes por que estas opcoes sao conhecidas em portugues.
 *
 * Estavam so dentro do painel de configuracoes, onde nasceram como opcoes de uma
 * caixa de seleccao. O resumo do plano - que se imprime e se leva para o campo -
 * mostrava-as em bruto: "goHome" e "goBack", que e a grafia que o WPML usa e nao
 * e para ninguem ler. Sao os mesmos valores nos dois sitios e passam a sair
 * daqui, para nao poderem divergir.
 */

export const ACCOES_FINAIS: readonly { valor: AccaoFinal; rotulo: string }[] = [
  { valor: 'goHome', rotulo: 'Regressar ao ponto de descolagem' },
  { valor: 'noAction', rotulo: 'Pairar no último waypoint' },
  { valor: 'autoLand', rotulo: 'Aterrar no último waypoint' },
  { valor: 'gotoFirstWaypoint', rotulo: 'Voltar ao primeiro waypoint' },
]

export const PERDA_SINAL: readonly { valor: AccaoPerdaSinal; rotulo: string }[] = [
  { valor: 'goBack', rotulo: 'Regressar' },
  { valor: 'landing', rotulo: 'Aterrar' },
  { valor: 'hover', rotulo: 'Pairar' },
]

/**
 * O nome de uma opcao, ou o proprio valor se ele for desconhecido.
 *
 * Devolver o valor em bruto e melhor do que devolver vazio: se algum dia
 * aparecer uma opcao nova sem nome, o que se ve e feio mas diz o que se passa.
 */
export function nomeDe(
  opcoes: readonly { valor: string; rotulo: string }[],
  valor: string,
): string {
  return opcoes.find((o) => o.valor === valor)?.rotulo ?? valor
}
