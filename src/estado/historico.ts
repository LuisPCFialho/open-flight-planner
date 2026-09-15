/**
 * Historico de desfazer e refazer, puro e sem dependencias de React.
 *
 * Guarda estados inteiros em vez de diferencas. Uma rota, mesmo com centenas de
 * waypoints, sao dezenas de kilobytes, e como as operacoes sobre a rota sao
 * imutaveis os estados partilham quase toda a estrutura entre si.
 */

export type Historico<T> = {
  readonly passado: readonly T[]
  readonly presente: T
  readonly futuro: readonly T[]
}

/** Passos guardados. Acima disto os mais antigos caem. */
const PROFUNDIDADE_MAXIMA = 100

export function historicoInicial<T>(presente: T): Historico<T> {
  return { passado: [], presente, futuro: [] }
}

/**
 * Regista um novo estado. Um ramo novo apaga o futuro, como em qualquer editor.
 * Registar o mesmo objecto nao cria um passo, para o arrastar de um waypoint nao
 * encher o historico com estados iguais.
 */
export function registar<T>(historico: Historico<T>, novo: T): Historico<T> {
  if (Object.is(novo, historico.presente)) return historico
  const passado = [...historico.passado, historico.presente]
  return {
    passado: passado.length > PROFUNDIDADE_MAXIMA ? passado.slice(-PROFUNDIDADE_MAXIMA) : passado,
    presente: novo,
    futuro: [],
  }
}

/**
 * Substitui o presente sem criar um passo.
 *
 * E o que serve o arrastar continuo de um waypoint: o passo fica registado
 * quando o rato e largado, nao a cada pixel de movimento.
 */
export function substituir<T>(historico: Historico<T>, novo: T): Historico<T> {
  return { ...historico, presente: novo }
}

export function desfazer<T>(historico: Historico<T>): Historico<T> {
  const anterior = historico.passado.at(-1)
  if (anterior === undefined) return historico
  return {
    passado: historico.passado.slice(0, -1),
    presente: anterior,
    futuro: [historico.presente, ...historico.futuro],
  }
}

export function refazer<T>(historico: Historico<T>): Historico<T> {
  const seguinte = historico.futuro[0]
  if (seguinte === undefined) return historico
  return {
    passado: [...historico.passado, historico.presente],
    presente: seguinte,
    futuro: historico.futuro.slice(1),
  }
}

export function podeDesfazer<T>(historico: Historico<T>): boolean {
  return historico.passado.length > 0
}

export function podeRefazer<T>(historico: Historico<T>): boolean {
  return historico.futuro.length > 0
}
