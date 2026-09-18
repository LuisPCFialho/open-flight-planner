import type { LinhaWaypoint } from './ListaWaypoints.tsx'

/**
 * Filtrar a lista de waypoints.
 *
 * Uma cobertura de parcela da trezentos e tal waypoints, e a lista deixa de ser
 * uma lista: e uma parede. Procurar nela o ponto que a validacao apontou, ou o
 * unico troco onde falta a accao de foto, faz-se a rolar com o rato e a contar
 * numeros - e a contagem falha.
 *
 * Os criterios nao sao genericos de proposito. Sao as tres perguntas que
 * alguem faz mesmo a uma rota destas: onde esta o numero tal, quais e que estao
 * assinalados, e quais e que tiram foto. Um filtro por expressao servia todas
 * as perguntas e nenhuma delas depressa.
 */

export type Criterio = 'todos' | 'alerta' | 'foto' | 'sem-foto'

export const CRITERIOS: readonly { valor: Criterio; rotulo: string; ajuda: string }[] = [
  { valor: 'todos', rotulo: 'Todos', ajuda: 'Sem filtro' },
  {
    valor: 'alerta',
    rotulo: 'Assinalados',
    ajuda: 'Só os pontos que uma verificação assinalou',
  },
  { valor: 'foto', rotulo: 'Com foto', ajuda: 'Só os pontos com acção de tirar foto' },
  {
    valor: 'sem-foto',
    rotulo: 'Sem foto',
    ajuda: 'Só os pontos que não tiram foto nenhuma',
  },
]

function temFoto(linha: LinhaWaypoint): boolean {
  return linha.waypoint.acoes.some((a) => a.tipo === 'tirarFoto')
}

/**
 * O numero escrito na caixa, se for um numero.
 *
 * A lista mostra `index + 1`, que e o que se ve no mapa e o que as validacoes
 * dizem. E esse que se procura, e nao o indice interno.
 */
export function numeroProcurado(procura: string): number | null {
  const limpo = procura.trim()
  if (limpo === '') return null
  const numero = Number(limpo)
  return Number.isInteger(numero) && numero > 0 ? numero : null
}

export function filtrar(
  linhas: readonly LinhaWaypoint[],
  criterio: Criterio,
  procura: string,
): readonly LinhaWaypoint[] {
  const numero = numeroProcurado(procura)

  /*
   * Sem filtro nenhum devolve-se o proprio arranjo, e nao uma copia igual.
   *
   * E o caso de longe mais comum, e uma copia nova a cada render punha a lista
   * inteira a redesenhar-se por nada.
   */
  if (criterio === 'todos' && numero === null) return linhas

  return linhas.filter((linha) => {
    if (numero !== null && linha.waypoint.index + 1 !== numero) return false
    if (criterio === 'alerta') return linha.alerta
    if (criterio === 'foto') return temFoto(linha)
    if (criterio === 'sem-foto') return !temFoto(linha)
    return true
  })
}
