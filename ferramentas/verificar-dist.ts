import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Verificar que a versao construida nao tem importacoes que nao existem.
 *
 * Corre no fim da construcao - `npm run build` - e uma falha trava-a. Corre-se
 * a mao com `node ferramentas/verificar-dist.ts`; o Node le o TypeScript
 * directamente, sem passo de compilacao.
 *
 * Existe por causa de um defeito que so aparecia na versao construida e que nao
 * dava erro nenhum visivel. O worker do MapLibre entrava no `dist` por um
 * `?url`, que copia o ficheiro e nao segue o que ele importa: o worker ficava la
 * a pedir um `maplibre-gl-shared.mjs` que nunca foi copiado, o servidor
 * respondia com o `index.html`, e o worker morria ao carregar.
 *
 * Um worker que morre assim nao atira excepcao nenhuma. Os pedidos que lhe sao
 * feitos ficam eternamente por responder: sem relevo do terreno, sem
 * sombreado, sem as fontes GeoJSON - e com a ortofoto a carregar na mesma, o
 * que da um mapa com aspecto de estar bom e com o solo perfeitamente plano numa
 * zona de montanha.
 *
 * Nenhum teste de unidade apanha isto, porque o que falha e o empacotamento. O
 * que se verifica aqui e uma so coisa, e chega: tudo o que um ficheiro do `dist`
 * importa por caminho relativo tem de estar la.
 */

const PASTA = resolve('dist')

/** `import ... from "./x"`, `export ... from "./x"` e `import("./x")`. */
const IMPORTACOES = /(?:from|import)\s*\(?\s*["'](\.[^"']*)["']/g

function ficheirosDeCodigo(pasta: string): string[] {
  const encontrados: string[] = []

  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...ficheirosDeCodigo(caminho))
    else if (/\.(m?js|cjs)$/.test(entrada.name)) encontrados.push(caminho)
  }

  return encontrados
}

function main(): void {
  if (!existsSync(PASTA)) {
    console.error('Nao ha `dist` para verificar. Corre a construcao primeiro.')
    process.exit(1)
  }

  const faltas: string[] = []

  for (const ficheiro of ficheirosDeCodigo(PASTA)) {
    const codigo = readFileSync(ficheiro, 'utf8')
    for (const [, alvo] of codigo.matchAll(IMPORTACOES)) {
      if (!alvo) continue
      const destino = resolve(dirname(ficheiro), alvo)
      if (!existsSync(destino)) {
        faltas.push(`${ficheiro.replace(PASTA, 'dist')} importa ${alvo}, que nao existe`)
      }
    }
  }

  if (faltas.length > 0) {
    console.error('A versao construida tem importacoes por resolver:\n')
    for (const falta of faltas) console.error(`  ${falta}`)
    console.error(
      '\nUm `?url` copia o ficheiro mas nao segue o que ele importa. Para um worker,' +
        '\nusa `?worker&url`, que empacota as dependencias todas.',
    )
    process.exit(1)
  }

  console.log('Versao construida sem importacoes por resolver.')
}

main()
