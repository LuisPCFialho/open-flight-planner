import DxfParser from 'dxf-parser'
import type { LatLon } from '../nucleo/tipos.ts'
import { ptTm06ParaWgs84, type PontoPTTM06 } from './projeccao.ts'

/**
 * Leitura de topografia a partir de um DXF.
 *
 * O que interessa sao cotas: os vertices das curvas de nivel, que trazem a cota
 * na elevacao da polilinha, os triangulos de uma superficie 3DFACE, e pontos
 * cotados soltos. Tudo o resto do desenho, que e a maior parte, e ignorado.
 *
 * As coordenadas vem em ETRS89 / PT-TM06 e sao convertidas para WGS84 a leitura,
 * uma vez, e nao a cada consulta.
 */

export type PontoCotado = { posicao: LatLon; cota: number }

export type TrianguloCotado = {
  /** Os tres vertices, ja em WGS84, com a respectiva cota. */
  vertices: [PontoCotado, PontoCotado, PontoCotado]
}

export type Topografia = {
  pontos: PontoCotado[]
  triangulos: TrianguloCotado[]
  /** Camadas encontradas com cotas, para se saber o que foi lido. */
  camadas: string[]
  /** O que ficou por ler ou merece desconfianca, para mostrar a quem importa. */
  avisos: string[]
  /** Envolvente em WGS84. */
  limites: { latMin: number; latMax: number; lonMin: number; lonMax: number } | null
}

type VerticeDXF = { x?: number; y?: number; z?: number }

type EntidadeDXF = {
  type?: string
  layer?: string
  vertices?: VerticeDXF[]
  elevation?: number
  position?: VerticeDXF
}

export class DXFSemCotas extends Error {}

export function lerDXF(fonte: string): Topografia {
  const analisador = new DxfParser()
  const desenho = analisador.parseSync(fonte) as { entities?: EntidadeDXF[] } | null
  if (!desenho?.entities) throw new DXFSemCotas('o ficheiro DXF nao tem entidades')

  const pontos: PontoCotado[] = []
  const triangulos: TrianguloCotado[] = []
  const camadas = new Set<string>()
  let polilinhasSemCota = 0

  const converter = (vertice: VerticeDXF, cotaAlternativa?: number): PontoCotado | null => {
    if (!Number.isFinite(vertice.x) || !Number.isFinite(vertice.y)) return null
    const cota = Number.isFinite(vertice.z) ? (vertice.z as number) : cotaAlternativa
    if (cota === undefined || !Number.isFinite(cota)) return null
    return { posicao: ptTm06ParaWgs84({ x: vertice.x as number, y: vertice.y as number }), cota }
  }

  for (const entidade of desenho.entities) {
    const camada = entidade.layer ?? 'sem camada'

    switch (entidade.type) {
      case '3DFACE': {
        const lidos = (entidade.vertices ?? [])
          .map((v) => converter(v))
          .filter((p): p is PontoCotado => p !== null)
        if (lidos.length < 3) break

        const [a, b, c, d] = lidos
        if (a && b && c) {
          triangulos.push({ vertices: [a, b, c] })
          camadas.add(camada)
          // Uma face de quatro vertices parte-se em dois triangulos.
          if (d && !mesmoPonto(c, d)) triangulos.push({ vertices: [a, c, d] })
        }
        break
      }

      case 'POLYLINE':
      case 'LWPOLYLINE': {
        /*
         * Numa curva de nivel a cota vive na elevacao da polilinha, nao nos
         * vertices - mas so a LWPOLYLINE a traz ate aqui. Na POLYLINE classica,
         * dos DXF antigos, o dxf-parser le o grupo 30 e deita-o fora, pelo que
         * `elevation` chega sempre indefinida. Quando isso acontece e os
         * vertices estao todos a z=0, a cota real perdeu-se pelo caminho: aceita-la
         * poria a curva ao nivel do mar e uma rota em AGL por cima dela voaria
         * dezenas de metros abaixo do que era suposto. Conta-se para se dizer.
         */
        const vertices = entidade.vertices ?? []
        if (
          entidade.type === 'POLYLINE' &&
          entidade.elevation === undefined &&
          vertices.length > 0 &&
          vertices.every((v) => !v.z)
        ) {
          polilinhasSemCota++
        }

        for (const vertice of vertices) {
          const ponto = converter(vertice, entidade.elevation)
          if (ponto) {
            pontos.push(ponto)
            camadas.add(camada)
          }
        }
        break
      }

      case 'POINT': {
        const ponto = entidade.position ? converter(entidade.position) : null
        if (ponto) {
          pontos.push(ponto)
          camadas.add(camada)
        }
        break
      }

      default:
        break
    }
  }

  if (pontos.length === 0 && triangulos.length === 0) {
    throw new DXFSemCotas(
      'o DXF nao traz nenhuma cota: nao ha curvas de nivel com elevacao, superficies 3DFACE nem pontos cotados',
    )
  }

  // Um levantamento inteiro ao nivel do mar nao existe: o que existe e a cota
  // ter-se perdido na leitura. Mais vale recusar do que planear por cima disto.
  if (pontos.length > 0 && triangulos.length === 0 && pontos.every((p) => p.cota === 0)) {
    throw new DXFSemCotas(
      'todas as cotas do DXF sao zero, o que quer dizer que se perderam na leitura. Grava as curvas de nivel como LWPOLYLINE, ou a superficie como 3DFACE.',
    )
  }

  const avisos =
    polilinhasSemCota > 0
      ? [
          `${polilinhasSemCota} polilinha${polilinhasSemCota === 1 ? '' : 's'} do tipo POLYLINE sem cota nos vertices: a elevacao da entidade nao e legivel neste formato e essas curvas de nivel ficaram a zero. Grava-as como LWPOLYLINE.`,
        ]
      : []

  return {
    pontos,
    triangulos,
    camadas: [...camadas].sort(),
    avisos,
    limites: envolvente(pontos, triangulos),
  }
}

function mesmoPonto(a: PontoCotado, b: PontoCotado): boolean {
  return (
    Math.abs(a.posicao.lat - b.posicao.lat) < 1e-9 && Math.abs(a.posicao.lon - b.posicao.lon) < 1e-9
  )
}

function envolvente(
  pontos: readonly PontoCotado[],
  triangulos: readonly TrianguloCotado[],
): Topografia['limites'] {
  const todos = [...pontos, ...triangulos.flatMap((t) => t.vertices)]
  if (todos.length === 0) return null

  let latMin = Infinity
  let latMax = -Infinity
  let lonMin = Infinity
  let lonMax = -Infinity

  for (const { posicao } of todos) {
    latMin = Math.min(latMin, posicao.lat)
    latMax = Math.max(latMax, posicao.lat)
    lonMin = Math.min(lonMin, posicao.lon)
    lonMax = Math.max(lonMax, posicao.lon)
  }
  return { latMin, latMax, lonMin, lonMax }
}

/** Escreve um DXF minimo com os pontos dados, usado nos testes. */
export function escreverDXFdeEnsaio(
  faces: readonly { a: PontoPTTM06 & { z: number }; b: PontoPTTM06 & { z: number }; c: PontoPTTM06 & { z: number } }[],
  curvas: readonly { cota: number; vertices: readonly PontoPTTM06[] }[] = [],
): string {
  const linhas = ['0', 'SECTION', '2', 'ENTITIES']

  for (const face of faces) {
    linhas.push(
      '0', '3DFACE', '8', 'SUPERFICIE',
      '10', String(face.a.x), '20', String(face.a.y), '30', String(face.a.z),
      '11', String(face.b.x), '21', String(face.b.y), '31', String(face.b.z),
      '12', String(face.c.x), '22', String(face.c.y), '32', String(face.c.z),
      '13', String(face.c.x), '23', String(face.c.y), '33', String(face.c.z),
    )
  }

  for (const curva of curvas) {
    linhas.push('0', 'LWPOLYLINE', '8', 'CURVAS_NIVEL', '38', String(curva.cota), '90', String(curva.vertices.length))
    for (const vertice of curva.vertices) {
      linhas.push('10', String(vertice.x), '20', String(vertice.y))
    }
  }

  linhas.push('0', 'ENDSEC', '0', 'EOF')
  return linhas.join('\n')
}
