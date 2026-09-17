import type JSZip from 'jszip'

/**
 * Empacotamento e leitura do `.kmz`.
 *
 * Um KMZ de rota e um zip com exactamente dois ficheiros, `wpmz/template.kml` e
 * `wpmz/waylines.wpml`. Acrescentar outros pode fazer o aparelho recusar o
 * ficheiro sem dizer porque.
 *
 * ## Porque e que a biblioteca de zip entra a pedido
 *
 * Sao cem kilobytes que so fazem falta quando alguem importa ou exporta, e isso
 * acontece uma vez por sessao - nao a abrir a aplicacao. Carregada de origem,
 * ia no pacote principal e atrasava o arranque de toda a gente para servir o
 * momento de ninguem.
 *
 * O `import type` acima e o que permite continuar a escrever os tipos sem
 * trazer o codigo: apaga-se na compilacao.
 */

/** Traz a biblioteca de zip, uma vez. */
async function jszip(): Promise<typeof JSZip> {
  const modulo = await import('jszip')
  return modulo.default
}

export const CAMINHO_TEMPLATE = 'wpmz/template.kml'
export const CAMINHO_WAYLINES = 'wpmz/waylines.wpml'

export type ConteudoKMZ = { template: string; waylines: string }

export async function criarKMZ(conteudo: ConteudoKMZ): Promise<Blob> {
  const JSZip = await jszip()
  const zip = new JSZip()
  zip.file(CAMINHO_TEMPLATE, conteudo.template)
  zip.file(CAMINHO_WAYLINES, conteudo.waylines)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Versao para Node, usada nos testes. */
export async function criarKMZBytes(conteudo: ConteudoKMZ): Promise<Uint8Array> {
  const JSZip = await jszip()
  const zip = new JSZip()
  zip.file(CAMINHO_TEMPLATE, conteudo.template)
  zip.file(CAMINHO_WAYLINES, conteudo.waylines)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function lerKMZ(dados: ArrayBuffer | Uint8Array | Blob): Promise<ConteudoKMZ> {
  const JSZip = await jszip()
  const zip = await JSZip.loadAsync(dados as ArrayBuffer)

  const template = await lerEntrada(zip, CAMINHO_TEMPLATE, '.kml')
  const waylines = await lerEntrada(zip, CAMINHO_WAYLINES, '.wpml')

  if (!waylines) {
    throw new Error('o ficheiro nao contem wpmz/waylines.wpml: nao e uma rota de waypoints')
  }
  return { template: template ?? waylines, waylines }
}

/**
 * Procura a entrada pelo caminho exacto e, se falhar, por extensao.
 *
 * Ha ficheiros que vem de outras ferramentas com a pasta escrita de outra
 * maneira, e recusa-los por causa disso seria recusar rotas perfeitamente boas.
 */
async function lerEntrada(zip: JSZip, caminho: string, extensao: string): Promise<string | null> {
  const exacta = zip.file(caminho)
  if (exacta) return exacta.async('string')

  const alternativa = zip
    .filter((nome, entrada) => !entrada.dir && nome.toLowerCase().endsWith(extensao))
    .at(0)
  return alternativa ? alternativa.async('string') : null
}
