/**
 * Construtor de XML minimo para WPML.
 *
 * Nao usa serializacao generica de proposito. O que sai daqui tem de bater
 * etiqueta a etiqueta com ficheiros reais da DJI, e a ordem dos elementos conta:
 * um ficheiro com as etiquetas certas pela ordem errada e aceite em silencio e
 * depois a rota nao voa.
 */

export type No = { nome: string; atributos?: Record<string, string>; filhos: (No | Texto)[] }
export type Texto = { texto: string }

export function no(
  nome: string,
  filhos: (No | Texto | null | undefined)[] = [],
  atributos?: Record<string, string>,
): No {
  const limpos = filhos.filter((f): f is No | Texto => f !== null && f !== undefined)
  return atributos ? { nome, atributos, filhos: limpos } : { nome, filhos: limpos }
}

/** Elemento com um unico valor de texto. */
export function valor(nome: string, conteudo: string | number): No {
  return { nome, filhos: [{ texto: String(conteudo) }] }
}

/**
 * Numero formatado para WPML.
 *
 * Os ficheiros da DJI escrevem inteiros sem casas decimais e evitam notacao
 * exponencial. Um `1e-7` no sitio de uma coordenada torna o ficheiro ilegivel
 * para o aparelho.
 */
export function numero(valorNumerico: number, casas = 6): string {
  if (!Number.isFinite(valorNumerico)) throw new Error(`numero invalido para WPML: ${valorNumerico}`)
  if (Number.isInteger(valorNumerico)) return String(valorNumerico)
  const texto = valorNumerico.toFixed(casas)
  // Remove zeros finais, mas nunca deixa o numero acabar em ponto.
  return texto.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

/**
 * Numero com casas decimais fixas, como a DJI os escreve.
 *
 * Alturas, velocidades e inclinacoes saem sempre com uma casa, mesmo quando e
 * zero: `8.0`, `-20.0`, `60.8`. Outros campos saem inteiros. Nao e so estetica,
 * e o que faz o ficheiro gerado ser identico ao que o aparelho produz.
 */
export function decimal(valor: number, casas: number): string {
  if (!Number.isFinite(valor)) throw new Error(`numero invalido para WPML: ${valor}`)
  return valor.toFixed(casas)
}

/**
 * Coordenada com 15 algarismos significativos, que e a forma que o DJI Fly
 * escreve: `-8.41066700000000`, `40.7465720000000`.
 */
export function coordenada(valor: number): string {
  if (!Number.isFinite(valor)) throw new Error(`coordenada invalida para WPML: ${valor}`)
  return valor.toPrecision(15)
}

export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Serializa com indentacao de dois espacos, como nos ficheiros de referencia. */
export function serializar(raiz: No, opcoes: { declaracao?: boolean } = {}): string {
  const corpo = escreverNo(raiz, 0)
  const declaracao = opcoes.declaracao === false ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n'
  return `${declaracao}${corpo}\n`
}

function escreverNo(elemento: No, nivel: number): string {
  const avanco = '  '.repeat(nivel)
  const atributos = elemento.atributos
    ? Object.entries(elemento.atributos)
        .map(([chave, v]) => ` ${chave}="${escapar(v)}"`)
        .join('')
    : ''

  if (elemento.filhos.length === 0) {
    return `${avanco}<${elemento.nome}${atributos}/>`
  }

  // Um unico filho de texto fica na mesma linha, como nos ficheiros da DJI.
  const primeiro = elemento.filhos[0]
  if (elemento.filhos.length === 1 && primeiro && 'texto' in primeiro) {
    return `${avanco}<${elemento.nome}${atributos}>${escapar(primeiro.texto)}</${elemento.nome}>`
  }

  const dentro = elemento.filhos
    .map((filho) => ('texto' in filho ? `${'  '.repeat(nivel + 1)}${escapar(filho.texto)}` : escreverNo(filho, nivel + 1)))
    .join('\n')

  return `${avanco}<${elemento.nome}${atributos}>\n${dentro}\n${avanco}</${elemento.nome}>`
}
