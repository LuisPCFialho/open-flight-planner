import type { No, Texto } from './xml.ts'

/**
 * Leitor de XML para os ficheiros WPML.
 *
 * Proprio, e nao `DOMParser`, por dois motivos: os testes correm em Node, onde
 * `DOMParser` nao existe, e o mesmo codigo tem de ler os ficheiros no browser.
 * Cobre elementos, texto, atributos, comentarios, CDATA e a declaracao.
 *
 * O CDATA e o `>` dentro de aspas nao aparecem no WPML da DJI, mas este mesmo
 * leitor serve `importarKML`, que le KML de fora - do Google Earth ou de um
 * topografo - onde um `<description>` com HTML dentro de CDATA e corrente.
 */

export type NoLido = {
  nome: string
  atributos: Record<string, string>
  filhos: NoLido[]
  texto: string
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function desescapar(texto: string): string {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (todo, corpo: string) => {
    const codigo = corpo.startsWith('#x') || corpo.startsWith('#X')
      ? Number.parseInt(corpo.slice(2), 16)
      : corpo.startsWith('#')
        ? Number.parseInt(corpo.slice(1), 10)
        : null

    if (codigo === null) return ENTIDADES[corpo] ?? todo
    // Fora da gama Unicode, `fromCodePoint` atira um RangeError cru. Mais vale
    // deixar a entidade como esta do que rebentar a leitura do ficheiro todo.
    if (!Number.isFinite(codigo) || codigo < 0 || codigo > 0x10ffff) return todo
    return String.fromCodePoint(codigo)
  })
}

/**
 * Posicao do `>` que fecha a etiqueta, ignorando os que estejam dentro de aspas.
 *
 * `<Document id="a>b">` e XML valido, e procurar o primeiro `>` cortava a
 * etiqueta a meio: o atributo desaparecia e o resto entrava como texto.
 */
function fimDaEtiqueta(fonte: string, inicio: number): number {
  let aspas: string | null = null
  for (let i = inicio; i < fonte.length; i++) {
    const caracter = fonte[i]
    if (aspas !== null) {
      if (caracter === aspas) aspas = null
      continue
    }
    if (caracter === '"' || caracter === "'") aspas = caracter
    else if (caracter === '>') return i
  }
  return -1
}

export function lerXML(fonte: string): NoLido {
  let posicao = 0
  const pilha: NoLido[] = []
  let raiz: NoLido | null = null

  const criar = (nome: string, atributos: Record<string, string>): NoLido => ({
    nome,
    atributos,
    filhos: [],
    texto: '',
  })

  while (posicao < fonte.length) {
    const abertura = fonte.indexOf('<', posicao)
    if (abertura === -1) break

    // Texto entre elementos.
    if (abertura > posicao) {
      const conteudo = fonte.slice(posicao, abertura).trim()
      const actual = pilha.at(-1)
      if (conteudo && actual !== undefined) actual.texto += desescapar(conteudo)
    }

    // CDATA: o conteudo e texto cru, sem entidades a desescapar.
    if (fonte.startsWith('<![CDATA[', abertura)) {
      const fim = fonte.indexOf(']]>', abertura)
      if (fim === -1) throw new Error('XML mal formado: CDATA sem fecho')
      const actual = pilha.at(-1)
      if (actual !== undefined) actual.texto += fonte.slice(abertura + 9, fim)
      posicao = fim + 3
      continue
    }

    // Comentario: acaba em `-->` e nao no primeiro `>`, que pode estar la dentro.
    if (fonte.startsWith('<!--', abertura)) {
      const fim = fonte.indexOf('-->', abertura)
      if (fim === -1) throw new Error('XML mal formado: comentario sem fecho')
      posicao = fim + 3
      continue
    }

    if (fonte.startsWith('<?', abertura) || fonte.startsWith('<!', abertura)) {
      const fim = fimDaEtiqueta(fonte, abertura)
      if (fim === -1) break
      posicao = fim + 1
      continue
    }

    const fecho = fimDaEtiqueta(fonte, abertura)
    if (fecho === -1) throw new Error('XML mal formado: etiqueta sem fecho')
    const interior = fonte.slice(abertura + 1, fecho).trim()

    if (interior.startsWith('/')) {
      const fechado = pilha.pop()
      if (!fechado) throw new Error(`XML mal formado: fecho a mais em ${interior}`)
      if (fechado.nome !== interior.slice(1).trim()) {
        throw new Error(`XML mal formado: <${fechado.nome}> fechado por <${interior}>`)
      }
      posicao = fecho + 1
      continue
    }

    const vazio = interior.endsWith('/')
    const corpo = vazio ? interior.slice(0, -1).trim() : interior
    const espaco = corpo.search(/\s/)
    const nome = espaco === -1 ? corpo : corpo.slice(0, espaco)
    const atributos: Record<string, string> = {}

    if (espaco !== -1) {
      const regex = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g
      let encontrado: RegExpExecArray | null
      while ((encontrado = regex.exec(corpo.slice(espaco))) !== null) {
        const chave = encontrado[1] ?? encontrado[3]
        const conteudo = encontrado[2] ?? encontrado[4]
        if (chave !== undefined && conteudo !== undefined) atributos[chave] = desescapar(conteudo)
      }
    }

    const elemento = criar(nome, atributos)
    const pai = pilha.at(-1)
    if (pai) pai.filhos.push(elemento)
    else if (!raiz) raiz = elemento

    if (!vazio) pilha.push(elemento)
    posicao = fecho + 1
  }

  if (!raiz) throw new Error('XML sem elemento de raiz')
  if (pilha.length > 0) throw new Error(`XML mal formado: <${pilha.at(-1)?.nome}> ficou por fechar`)
  return raiz
}

// --- navegacao ---------------------------------------------------------------

/** Primeiro filho com o nome dado, sem descer mais do que um nivel. */
export function filho(pai: NoLido | undefined, nome: string): NoLido | undefined {
  return pai?.filhos.find((f) => f.nome === nome)
}

export function filhos(pai: NoLido | undefined, nome: string): NoLido[] {
  return pai?.filhos.filter((f) => f.nome === nome) ?? []
}

/** Texto de um descendente por caminho, por exemplo `Document/wpml:author`. */
export function textoEm(raiz: NoLido | undefined, caminho: string): string | undefined {
  let actual: NoLido | undefined = raiz
  for (const parte of caminho.split('/')) {
    actual = filho(actual, parte)
    if (!actual) return undefined
  }
  return actual?.texto
}

export function numeroEm(raiz: NoLido | undefined, caminho: string): number | undefined {
  const texto = textoEm(raiz, caminho)
  if (texto === undefined) return undefined
  const lido = Number.parseFloat(texto)
  return Number.isFinite(lido) ? lido : undefined
}

// --- comparacao para os testes -----------------------------------------------

export type Divergencia = {
  caminho: string
  esperado?: string | undefined
  obtido?: string | undefined
  razao: string
}

/**
 * Compara duas arvores etiqueta a etiqueta, incluindo a ordem.
 *
 * Um ficheiro com etiquetas a mais, a menos, ou pela ordem errada nao serve,
 * por isso a comparacao e estrita nos tres aspectos.
 */
export function compararXML(esperado: NoLido, obtido: NoLido, caminho = ''): Divergencia[] {
  const aqui = caminho ? `${caminho}/${esperado.nome}` : esperado.nome
  const divergencias: Divergencia[] = []

  if (esperado.nome !== obtido.nome) {
    return [{ caminho: aqui, esperado: esperado.nome, obtido: obtido.nome, razao: 'nome diferente' }]
  }

  for (const [chave, valorEsperado] of Object.entries(esperado.atributos)) {
    if (obtido.atributos[chave] !== valorEsperado) {
      divergencias.push({
        caminho: `${aqui}@${chave}`,
        esperado: valorEsperado,
        obtido: obtido.atributos[chave],
        razao: 'atributo diferente',
      })
    }
  }
  for (const chave of Object.keys(obtido.atributos)) {
    if (!(chave in esperado.atributos)) {
      divergencias.push({ caminho: `${aqui}@${chave}`, obtido: obtido.atributos[chave], razao: 'atributo a mais' })
    }
  }

  if (esperado.filhos.length === 0 && obtido.filhos.length === 0) {
    if (esperado.texto !== obtido.texto) {
      divergencias.push({ caminho: aqui, esperado: esperado.texto, obtido: obtido.texto, razao: 'texto diferente' })
    }
    return divergencias
  }

  const maximo = Math.max(esperado.filhos.length, obtido.filhos.length)
  for (let i = 0; i < maximo; i++) {
    const a = esperado.filhos[i]
    const b = obtido.filhos[i]
    if (a && !b) divergencias.push({ caminho: `${aqui}/${a.nome}`, esperado: a.nome, razao: 'etiqueta em falta' })
    else if (!a && b) divergencias.push({ caminho: `${aqui}/${b.nome}`, obtido: b.nome, razao: 'etiqueta a mais' })
    else if (a && b) divergencias.push(...compararXML(a, b, aqui))
  }
  return divergencias
}

/** Todos os nomes de etiqueta usados na arvore, para validar contra a lista fechada. */
export function etiquetasUsadas(raiz: NoLido, conjunto = new Set<string>()): Set<string> {
  conjunto.add(raiz.nome)
  for (const f of raiz.filhos) etiquetasUsadas(f, conjunto)
  return conjunto
}

/** Converte a arvore construida para serializacao na forma lida, util nos testes. */
export function paraNoLido(elemento: No | Texto): NoLido {
  if ('texto' in elemento) return { nome: '#texto', atributos: {}, filhos: [], texto: elemento.texto }
  const filhosTexto = elemento.filhos.filter((f): f is Texto => 'texto' in f)
  return {
    nome: elemento.nome,
    atributos: elemento.atributos ?? {},
    filhos: elemento.filhos.filter((f): f is No => !('texto' in f)).map(paraNoLido),
    texto: filhosTexto.map((f) => f.texto).join(''),
  }
}
