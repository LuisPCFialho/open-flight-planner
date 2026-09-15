import type { Area, Drone, Rota } from '../nucleo/tipos.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'
import { novoId } from '../nucleo/ids.ts'
import { gerarFly } from './dialeto-fly.ts'
import { gerarPilot2 } from './dialeto-pilot2.ts'
import { criarKMZ, lerKMZ } from './empacotar.ts'
import { importarKMZ, type RotaImportada } from './importar.ts'
import { importarKML } from './kml.ts'

/**
 * Ligacao entre os geradores e o sistema de ficheiros do browser.
 *
 * O dialeto sai do drone escolhido na rota, nunca de uma opcao a parte: e a
 * unica forma de garantir que nao se exporta um ficheiro do dialeto errado, que
 * e aceite em silencio e depois nao voa.
 */

export type OpcoesExportacao = {
  cotas?: ReadonlyMap<string, number>
  chave?: (ponto: { lat: number; lon: number }) => string
}

export function gerarParaDrone(
  rota: Rota,
  drone: Drone,
  opcoes: OpcoesExportacao = {},
): { template: string; waylines: string } {
  return drone.dialeto === 'fly' ? gerarFly(rota, drone, opcoes) : gerarPilot2(rota, drone, opcoes)
}

/** Nome de ficheiro seguro, derivado do nome da rota. */
export function nomeDoFicheiro(rota: Rota): string {
  const limpo = rota.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${limpo || 'rota'}.kmz`
}

export async function exportarKMZ(
  rota: Rota,
  drone: Drone,
  opcoes: OpcoesExportacao = {},
): Promise<void> {
  const blob = await criarKMZ(gerarParaDrone(rota, drone, opcoes))
  const url = URL.createObjectURL(blob)
  try {
    const ligacao = document.createElement('a')
    ligacao.href = url
    ligacao.download = nomeDoFicheiro(rota)
    document.body.appendChild(ligacao)
    ligacao.click()
    ligacao.remove()
  } finally {
    // Sem isto o blob fica em memoria ate a pagina fechar.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export async function importarFicheiro(
  ficheiro: File,
  contexto: { projetoId: string; fonteTerreno?: FonteTerreno },
): Promise<RotaImportada> {
  const conteudo = await lerKMZ(await ficheiro.arrayBuffer())
  const nome = ficheiro.name.replace(/\.kmz$/i, '')
  const importada = importarKMZ(conteudo, { projetoId: contexto.projetoId, nome })

  /*
   * O dialeto Fly nao grava a cota do terreno no ponto de descolagem, e sem ela
   * a altura acima do solo de toda a rota sai errada pelo valor da cota do
   * sitio. Aqui em Sever do Vouga isso sao 356 m, o suficiente para a rota
   * inteira aparecer enterrada. Vai-se buscar ao motor de terreno.
   */
  if (importada.cotaDescolagemConhecida || !contexto.fonteTerreno) return importada

  try {
    const { lat, lon } = importada.rota.pontoDescolagem
    const cotaTerreno = await contexto.fonteTerreno.cota(lat, lon)
    return {
      ...importada,
      cotaDescolagemConhecida: true,
      rota: { ...importada.rota, pontoDescolagem: { lat, lon, cotaTerreno } },
    }
  } catch {
    return {
      ...importada,
      avisos: [
        ...importada.avisos,
        'o ficheiro nao traz a cota do ponto de descolagem e nao foi possivel obte-la do terreno: a altura acima do solo vai aparecer errada',
      ],
    }
  }
}


// --- areas de referencia -----------------------------------------------------

/**
 * Le as areas de um KMZ ou KML qualquer.
 *
 * Nao e um ficheiro de rota: e o que sai do Google Earth, de um SIG ou de um
 * topografo, com o limite da parcela ou da empreitada desenhado. Serve de
 * rascunho por baixo da rota, para se saber o que ha para filmar.
 *
 * Aceita as duas formas porque quem manda o ficheiro manda o que tem: o KMZ e
 * so um zip com o KML la dentro, em caminho que ninguem garante.
 */
export async function importarAreas(
  ficheiro: File,
): Promise<{ areas: Area[]; nome: string; avisos: string[] }> {
  const bytes = new Uint8Array(await ficheiro.arrayBuffer())
  const texto = await textoKML(bytes, ficheiro.name)

  const conteudo = importarKML(texto)
  const avisos: string[] = []

  const areas: Area[] = conteudo.poligonos.map((poligono) => ({
    id: novoId(),
    nome: poligono.nome,
    contorno: poligono.contorno,
  }))

  if (areas.length === 0) {
    throw new Error(
      `${ficheiro.name} nao traz nenhum poligono. Confirma que o desenho tem areas fechadas e nao so linhas ou marcadores.`,
    )
  }
  if (conteudo.linhas.length > 0) {
    avisos.push(
      `${conteudo.linhas.length} linha(s) aberta(s) do ficheiro foram ignoradas: so entram areas fechadas`,
    )
  }

  return { areas, nome: conteudo.nome, avisos }
}

/** Assinatura de um zip, que e o que um KMZ e por dentro. */
function ehZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

async function textoKML(bytes: Uint8Array, nomeDoFicheiro: string): Promise<string> {
  if (!ehZip(bytes)) return new TextDecoder().decode(bytes)

  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(bytes)

  // O doc.kml e a convencao, mas serve qualquer .kml que la esteja.
  const entrada =
    zip.file('doc.kml') ??
    zip.filter((nome, item) => !item.dir && nome.toLowerCase().endsWith('.kml')).at(0)

  if (!entrada) throw new Error(`${nomeDoFicheiro} e um KMZ mas nao tem nenhum .kml dentro`)
  return entrada.async('string')
}
