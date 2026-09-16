import type { Area, Drone, LatLon, Rota } from '../nucleo/tipos.ts'
import { distancia } from '../nucleo/geodesia.ts'
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

  /*
   * Sem poligonos, tenta-se as linhas.
   *
   * Muito desenho de limites sai como polilinha e nao como area, sobretudo o
   * que vem de CAD passado a KML. Se a linha volta praticamente ao ponto de
   * partida, e um contorno: recusa-la por causa da etiqueta seria recusar
   * exactamente o ficheiro que se quer.
   */
  if (areas.length > 0 && conteudo.linhas.length > 0) {
    avisos.push(
      `${conteudo.linhas.length} linha(s) do ficheiro ficaram de fora: havendo areas fechadas, sao essas que contam`,
    )
  }

  if (areas.length === 0) {
    for (const linha of conteudo.linhas) {
      const contorno = linha.pontos.map((p) => ({ lat: p.lat, lon: p.lon }))
      if (!pareceFechada(contorno)) continue

      areas.push({ id: novoId(), nome: linha.nome, contorno: semFecho(contorno) })
      avisos.push(`"${linha.nome}" veio como linha e foi lida como contorno fechado`)
    }
  }

  if (areas.length === 0) {
    throw new Error(
      `${ficheiro.name} nao traz nenhum poligono nem linha fechada. Confirma que o desenho tem o limite desenhado como area ou como polilinha fechada, e nao so marcadores.`,
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

/**
 * Se a linha volta ao ponto de partida, dentro de uma tolerancia generosa.
 *
 * Um metro de folga cobre o desenho feito a mao que quase fecha. Sem isto, um
 * limite desenhado como polilinha ficava de fora por uma questao de etiqueta.
 */
function pareceFechada(contorno: readonly LatLon[]): boolean {
  if (contorno.length < 4) return false
  const primeiro = contorno[0]
  const ultimo = contorno.at(-1)
  if (!primeiro || !ultimo) return false
  return distancia(primeiro, ultimo) < 1
}

/** Tira o ponto de fecho, que nao se guarda. */
function semFecho(contorno: readonly LatLon[]): LatLon[] {
  const limpos = [...contorno]
  if (limpos.length > 3) limpos.pop()
  return limpos
}
