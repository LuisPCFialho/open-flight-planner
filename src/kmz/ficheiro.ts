import type { Area, Drone, LatLon, Rota } from '../nucleo/tipos.ts'
import { descarregar, nomeSeguro } from '../descarregar.ts'
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
  return nomeSeguro(rota.nome, 'kmz', 'rota')
}

export async function exportarKMZ(
  rota: Rota,
  drone: Drone,
  opcoes: OpcoesExportacao = {},
): Promise<void> {
  const blob = await criarKMZ(gerarParaDrone(rota, drone, opcoes))
  descarregar(blob, nomeDoFicheiro(rota))
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

  /** Linhas que quase fecham mas ficaram de fora, para a mensagem de erro. */
  const quaseFechadas: { nome: string; folga: number }[] = []

  if (areas.length === 0) {
    for (const linha of conteudo.linhas) {
      const contorno = linha.pontos.map((p) => ({ lat: p.lat, lon: p.lon }))
      const folga = folgaDeFecho(contorno)

      if (folga === null) {
        if (contorno.length >= 4) {
          const primeiro = contorno[0]
          const ultimo = contorno.at(-1)
          if (primeiro && ultimo) {
            quaseFechadas.push({ nome: linha.nome, folga: distancia(primeiro, ultimo) })
          }
        }
        continue
      }

      areas.push({ id: novoId(), nome: linha.nome, contorno: semFecho(contorno) })
      avisos.push(
        folga > 0.5
          ? `"${linha.nome}" veio como linha aberta por ${folga.toFixed(1)} m e foi fechada`
          : `"${linha.nome}" veio como linha e foi lida como contorno fechado`,
      )
    }
  }

  if (areas.length === 0) {
    const pior = quaseFechadas.sort((a, b) => a.folga - b.folga)[0]
    throw new Error(
      pior
        ? `${ficheiro.name} traz "${pior.nome}" como linha aberta: faltam ${pior.folga.toFixed(0)} m para fechar o contorno. Fecha o desenho no ponto de partida e volta a exportar.`
        : `${ficheiro.name} nao traz nenhum poligono nem linha fechada. Confirma que o desenho tem o limite desenhado como area ou como polilinha fechada, e nao so marcadores.`,
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

/** Folga de fecho aceite, em metros e em fraccao do perimetro. */
export const FECHO_ABSOLUTO = 5
export const FECHO_RELATIVO = 0.02

/**
 * Se a linha volta ao ponto de partida, dentro de uma tolerancia generosa.
 *
 * A tolerancia e relativa ao perimetro, e nao um numero fixo. Um metro de folga
 * - que era o criterio - parece razoavel ate se olhar para um caso real: um
 * perimetro de central desenhado a mao no Google Earth Pro, 410 pontos e 3808 m
 * de volta, fechava com 6,25 m de folga, ou seja 0,16% do percurso. Ficava de
 * fora por uma questao de etiqueta, com uma mensagem a dizer que o ficheiro nao
 * tinha poligonos nenhuns - o que nem era verdade.
 *
 * Isto e um rascunho da area a filmar, nao um levantamento cadastral: dois por
 * cento de folga num contorno de referencia nao muda nenhuma decisao, e ser
 * rigido recusa trabalho legitimo.
 */
export function pareceFechada(contorno: readonly LatLon[]): boolean {
  return folgaDeFecho(contorno) !== null
}

/**
 * Metros que faltam para a linha fechar, ou `null` se ela nao fecha de todo.
 *
 * Serve tambem a mensagem de erro: dizer quantos metros faltam e o que permite
 * a quem desenhou ir corrigir, em vez de ficar a adivinhar.
 */
export function folgaDeFecho(contorno: readonly LatLon[]): number | null {
  if (contorno.length < 4) return null
  const primeiro = contorno[0]
  const ultimo = contorno.at(-1)
  if (!primeiro || !ultimo) return null

  let perimetro = 0
  for (let i = 1; i < contorno.length; i++) {
    const de = contorno[i - 1]
    const para = contorno[i]
    if (de && para) perimetro += distancia(de, para)
  }

  const folga = distancia(primeiro, ultimo)
  const tolerancia = Math.max(FECHO_ABSOLUTO, perimetro * FECHO_RELATIVO)
  return folga <= tolerancia ? folga : null
}

/** Tira o ponto de fecho, que nao se guarda. */
function semFecho(contorno: readonly LatLon[]): LatLon[] {
  const limpos = [...contorno]
  if (limpos.length > 3) limpos.pop()
  return limpos
}
