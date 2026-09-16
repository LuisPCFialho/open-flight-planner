import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { deslocar, distancia, rumo } from './geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from './operacoes-rota.ts'
import { repetirDeslocado, repetirEmSentidoContrario, rumoPerpendicular } from './repeticao.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Rota em linha recta para leste, com `troco` metros entre pontos. */
function rotaRecta(quantos: number, troco = 100): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, troco)
  }
  return rota
}

const todos = (rota: Rota) => new Set(rota.waypoints.map((w) => w.id))

describe('rumo perpendicular', () => {
  it('uma passagem para leste tem a fila seguinte a sul', () => {
    // Perpendicular a direita de quem vai para leste sao 180 graus.
    expect(rumoPerpendicular(rotaRecta(3).waypoints)).toBeCloseTo(180, 1)
  })

  it('com menos de dois pontos nao ha direccao que se defina', () => {
    expect(rumoPerpendicular(rotaRecta(1).waypoints)).toBe(90)
    expect(rumoPerpendicular([])).toBe(90)
  })
})

describe('repetir deslocado', () => {
  it('uma copia acrescenta tantos waypoints quantos os escolhidos', () => {
    const rota = rotaRecta(4)
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 25 })
    expect(nova.waypoints).toHaveLength(8)
  })

  it('tres copias acrescentam tres troços', () => {
    const rota = rotaRecta(4)
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 25, quantas: 3 })
    expect(nova.waypoints).toHaveLength(16)
  })

  it('cada copia fica mais longe do que a anterior, e sempre na mesma direccao', () => {
    const rota = rotaRecta(3)
    const nova = repetirDeslocado(rota, todos(rota), {
      afastamento: 30,
      rumoGraus: 0,
      quantas: 2,
    })
    const original = nova.waypoints[0]
    const primeiraCopia = nova.waypoints[3]
    const segundaCopia = nova.waypoints[6]
    if (!original || !primeiraCopia || !segundaCopia) throw new Error('waypoints em falta')

    expect(distancia(original, primeiraCopia)).toBeCloseTo(30, 0)
    expect(distancia(original, segundaCopia)).toBeCloseTo(60, 0)
    expect(rumo(original, primeiraCopia)).toBeCloseTo(0, 0)
  })

  it('as copias ficam no fim, e nao intercaladas', () => {
    // Intercalar faria a aeronave saltar de fila para fila a cada ponto.
    const rota = rotaRecta(3)
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 20 })
    for (const [i, waypoint] of rota.waypoints.entries()) {
      expect(nova.waypoints[i]?.id).toBe(waypoint.id)
    }
  })

  it('a copia leva a altura e os angulos do original', () => {
    const base = rotaRecta(2)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w) => ({ ...w, altura: 85, gimbalPitch: -55, gimbalYaw: 12 })),
    }
    const copiado = repetirDeslocado(rota, todos(rota), { afastamento: 20 }).waypoints[2]
    expect(copiado?.altura).toBe(85)
    expect(copiado?.gimbalPitch).toBe(-55)
    expect(copiado?.gimbalYaw).toBe(12)
  })

  it('cada copia leva accoes suas, e nao as mesmas', () => {
    // Partilhar o objecto faria editar uma accao mexer em todas as copias.
    const base = rotaRecta(2)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w) => ({ ...w, acoes: [{ tipo: 'tirarFoto' as const }] })),
    }
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 20 })
    expect(nova.waypoints[2]?.acoes[0]).not.toBe(rota.waypoints[0]?.acoes[0])
    expect(nova.waypoints[2]?.acoes[0]).toEqual({ tipo: 'tirarFoto' })
  })

  it('os identificadores sao novos, senao a seleccao ficava ambigua', () => {
    const rota = rotaRecta(3)
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 20 })
    expect(new Set(nova.waypoints.map((w) => w.id)).size).toBe(nova.waypoints.length)
  })

  it('a numeracao fica seguida', () => {
    const rota = rotaRecta(3)
    const nova = repetirDeslocado(rota, todos(rota), { afastamento: 20 })
    expect(nova.waypoints.map((w) => w.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('so os escolhidos se repetem', () => {
    const rota = rotaRecta(4)
    const doisPrimeiros = new Set([rota.waypoints[0]?.id ?? '', rota.waypoints[1]?.id ?? ''])
    const nova = repetirDeslocado(rota, doisPrimeiros, { afastamento: 20 })
    expect(nova.waypoints).toHaveLength(6)
  })

  it('sem nada escolhido nao mexe na rota', () => {
    const rota = rotaRecta(3)
    expect(repetirDeslocado(rota, new Set(), { afastamento: 20 })).toBe(rota)
  })

  it('um afastamento invalido nao produz coordenadas invalidas', () => {
    const rota = rotaRecta(3)
    expect(repetirDeslocado(rota, todos(rota), { afastamento: NaN })).toBe(rota)
  })
})

describe('repetir em sentido contrario', () => {
  it('a volta refaz o caminho pela ordem inversa', () => {
    const rota = rotaRecta(4)
    const nova = repetirEmSentidoContrario(rota, todos(rota))

    // Quatro de ida, mais tres de volta: o ponto onde ela ja esta nao se repete.
    expect(nova.waypoints).toHaveLength(7)
    const original = rota.waypoints
    expect(nova.waypoints[4]?.lon).toBeCloseTo(original[2]?.lon ?? 0, 9)
    expect(nova.waypoints[6]?.lon).toBeCloseTo(original[0]?.lon ?? 0, 9)
  })

  it('nao deixa dois waypoints em cima um do outro', () => {
    // Dois no mesmo sitio fariam a aeronave parar ali duas vezes.
    const rota = rotaRecta(4)
    const nova = repetirEmSentidoContrario(rota, todos(rota))
    for (let i = 1; i < nova.waypoints.length; i++) {
      const anterior = nova.waypoints[i - 1]
      const actual = nova.waypoints[i]
      if (!anterior || !actual) throw new Error('waypoint em falta')
      expect(distancia(anterior, actual)).toBeGreaterThan(0.5)
    }
  })

  it('um troço a meio da rota repete-se inteiro', () => {
    // Nao acaba onde a aeronave esta, portanto nada ha para dispensar.
    const rota = rotaRecta(5)
    const meio = new Set([rota.waypoints[1]?.id ?? '', rota.waypoints[2]?.id ?? ''])
    expect(repetirEmSentidoContrario(rota, meio).waypoints).toHaveLength(7)
  })

  it('os identificadores sao novos', () => {
    const rota = rotaRecta(3)
    const nova = repetirEmSentidoContrario(rota, todos(rota))
    expect(new Set(nova.waypoints.map((w) => w.id)).size).toBe(nova.waypoints.length)
  })

  it('com menos de dois pontos nao ha caminho para refazer', () => {
    const rota = rotaRecta(1)
    expect(repetirEmSentidoContrario(rota, todos(rota))).toBe(rota)
  })

  it('a numeracao fica seguida', () => {
    const rota = rotaRecta(3)
    const nova = repetirEmSentidoContrario(rota, todos(rota))
    expect(nova.waypoints.map((w) => w.index)).toEqual([0, 1, 2, 3, 4])
  })
})
