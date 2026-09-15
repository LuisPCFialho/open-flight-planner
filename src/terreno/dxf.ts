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
        // Numa curva de nivel a cota vive na elevacao da polilinha, nao nos vertices.
        for (const vertice of entidade.vertices ?? []) {
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

  return { pontos, triangulos, camadas: [...camadas].sort(), limites: envolvente(pontos, triangulos) }
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
