/**
 * Suporte a edicao de varios waypoints ao mesmo tempo.
 *
 * O Pilot 2 mostra "Varios valores" quando os waypoints seleccionados divergem
 * num campo, e so escreve o campo quando o utilizador lhe mexe. E o
 * comportamento certo: sem isto, abrir o painel com tres waypoints de alturas
 * diferentes nivelava-os todos pelo primeiro sem ninguem pedir.
 */

/** Marca que os valores divergem entre os waypoints seleccionados. */
export const VARIOS = Symbol('varios valores')
export type Varios = typeof VARIOS

export type ValorComum<T> = T | Varios | undefined

/**
 * Valor partilhado por todos os elementos, `VARIOS` se divergirem, `undefined`
 * se a lista estiver vazia.
 *
 * A comparacao e por `Object.is`, portanto serve valores primitivos. Campos
 * compostos, como a lista de accoes, nao passam por aqui.
 */
export function valorComum<T, V>(
  elementos: readonly T[],
  extrair: (elemento: T) => V,
): ValorComum<V> {
  if (elementos.length === 0) return undefined

  const primeiro = elementos[0]
  if (primeiro === undefined) return undefined

  const referencia = extrair(primeiro)
  for (let i = 1; i < elementos.length; i++) {
    const elemento = elementos[i]
    if (elemento === undefined) continue
    if (!Object.is(extrair(elemento), referencia)) return VARIOS
  }
  return referencia
}

export function ehVarios<T>(valor: ValorComum<T>): valor is Varios {
  return valor === VARIOS
}

/** Texto a mostrar num campo de edicao em lote. */
export function textoDoValor(
  valor: ValorComum<number>,
  opcoes: { casas?: number } = {},
): string {
  if (valor === undefined) return ''
  if (ehVarios(valor)) return ''
  return valor.toFixed(opcoes.casas ?? 0)
}

/** Rotulo descritivo para o campo, como o Pilot 2 mostra ao lado do titulo. */
export function rotuloDoValor(
  valor: ValorComum<number>,
  opcoes: { casas?: number; unidade?: string } = {},
): string {
  if (valor === undefined) return '--'
  if (ehVarios(valor)) return 'Varios valores'
  return `${valor.toFixed(opcoes.casas ?? 0)}${opcoes.unidade ?? ''}`
}
