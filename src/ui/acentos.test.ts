import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * O texto que se ve tem de estar em portugues europeu, com os acentos certos.
 *
 * Isto e um teste e nao um script de correccao, e e deliberado: o script que ja
 * existiu passou por cima do codigo duas vezes, uma delas a transformar
 * `estatisticas.duracao` em `estatisticas.duração`, que e um acesso a
 * propriedade e nao texto nenhum. Um teste assinala e nunca reescreve.
 *
 * Apanhou dois defeitos quando foi escrito: a aba `Validacoes` e a frase
 * "Selecciona um so para editar a lista".
 */

const PASTA = resolve('src')

/**
 * Palavras que em portugues nunca aparecem sem diacritico.
 *
 * A lista e curta de proposito. So entra aqui uma palavra cuja forma sem acento
 * nao existe na lingua - nada de casos em que as duas escritas sao palavras
 * diferentes, como `e` e `é`, porque essas nao se distinguem sem ler a frase.
 */
const SEM_ACENTO: Record<string, string> = {
  accao: 'ação',
  accoes: 'ações',
  area: 'área',
  areas: 'áreas',
  camara: 'câmara',
  codigo: 'código',
  configuracoes: 'configurações',
  descricao: 'descrição',
  direccao: 'direção',
  duracao: 'duração',
  elevacao: 'elevação',
  exportacao: 'exportação',
  grafico: 'gráfico',
  importacao: 'importação',
  inclinacao: 'inclinação',
  informacao: 'informação',
  maximo: 'máximo',
  medio: 'médio',
  minimo: 'mínimo',
  numero: 'número',
  operacao: 'operação',
  orientacao: 'orientação',
  posicao: 'posição',
  proximo: 'próximo',
  rotacao: 'rotação',
  seleccao: 'seleção',
  so: 'só',
  sobreposicao: 'sobreposição',
  titulo: 'título',
  trajectoria: 'trajetória',
  trajectorias: 'trajetórias',
  ultimo: 'último',
  validacoes: 'validações',
  video: 'vídeo',
}

/**
 * Texto entre etiquetas: uma linha que e so palavras, sem codigo nenhum.
 *
 * Os parenteses, os parenteses rectos e o ponto e virgula sao o que distingue
 * uma frase de uma linha de codigo - sem eles, `center: [posicao.lon, ...]`
 * passava por texto. Uma frase que os use fica de fora da verificacao, e e um
 * preco justo: isto e uma rede, e nao uma prova.
 */
const TEXTO_JSX = /^\s{4,}([A-Za-zÀ-ÿ][^<>{}"'=/\\()[\];?]{2,80})$/
/**
 * Texto na mesma linha das etiquetas: `<span>Sombreado</span>`.
 *
 * E como esta escrita a maior parte dos rotulos curtos, e sem isto a
 * verificacao so via as frases longas, que o formatador parte para a sua
 * propria linha.
 */
const TEXTO_INLINE = />([^<>{}=]*[A-Za-zÀ-ÿ][^<>{}=]*)</g

/** Os atributos que o utilizador le. */
const ATRIBUTOS = /(?:title|aria-label|placeholder)="([^"]+)"/g

/**
 * O que sobrou do codigo e passou pelo reconhecedor de texto.
 *
 * Sao tres formas: um elemento de lista, que acaba em virgula; uma propriedade
 * de objecto cujo valor continua na linha seguinte - `posicao: ultimo`; e uma
 * instrucao que comeca por palavra reservada - `return proximo`. Nenhuma frase
 * do interface tem qualquer destas formas.
 */
const PALAVRAS_RESERVADAS =
  /^(return|const|let|var|if|else|for|while|do|switch|case|break|continue|throw|await|new|delete|typeof|export|import|type|function|class|try|catch|finally|yield)\b/

function ehCodigo(linha: string): boolean {
  const limpa = linha.trim()
  return (
    limpa.endsWith(',') || /^[\w$]+:\s*\S+$/.test(limpa) || PALAVRAS_RESERVADAS.test(limpa)
  )
}

function ficheirosTsx(pasta: string): string[] {
  const encontrados: string[] = []
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...ficheirosTsx(caminho))
    else if (entrada.name.endsWith('.tsx') && !entrada.name.endsWith('.test.tsx')) {
      encontrados.push(caminho)
    }
  }
  return encontrados
}

/** Tudo o que o utilizador chega a ler, por ficheiro e por linha. */
function textoVisivel(): { ficheiro: string; linha: number; texto: string }[] {
  const encontrado: { ficheiro: string; linha: number; texto: string }[] = []

  for (const ficheiro of ficheirosTsx(PASTA)) {
    const linhas = readFileSync(ficheiro, 'utf8').split('\n')
    const curto = ficheiro.replace(resolve('.'), '').replace(/\\/g, '/')

    for (const [i, linha] of linhas.entries()) {
      const nota = TEXTO_JSX.exec(linha)
      if (nota?.[1] && !ehCodigo(linha)) {
        encontrado.push({ ficheiro: curto, linha: i + 1, texto: nota[1] })
      }

      for (const [, valor] of linha.matchAll(TEXTO_INLINE)) {
        if (valor) encontrado.push({ ficheiro: curto, linha: i + 1, texto: valor })
      }

      for (const [, valor] of linha.matchAll(ATRIBUTOS)) {
        if (valor) encontrado.push({ ficheiro: curto, linha: i + 1, texto: valor })
      }
    }
  }

  return encontrado
}

describe('acentos no texto visivel', () => {
  it('ha texto visivel para verificar', () => {
    // Se a extraccao se partir, o teste passava a nao verificar nada em silencio.
    expect(textoVisivel().length).toBeGreaterThan(100)
  })

  it('nenhuma palavra visivel esta escrita sem o seu acento', () => {
    const faltas: string[] = []

    for (const { ficheiro, linha, texto } of textoVisivel()) {
      for (const palavra of texto.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []) {
        const certa = SEM_ACENTO[palavra]
        if (certa) faltas.push(`${ficheiro}:${linha} escreve "${palavra}" em vez de "${certa}"`)
      }
    }

    expect(faltas).toEqual([])
  })
})
