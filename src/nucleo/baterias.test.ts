import { describe, it, expect } from 'vitest'
import type { Drone, Rota } from './tipos.ts'
import { droneComId } from '../drones.ts'
import { deslocar } from './geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from './operacoes-rota.ts'
import { calcularEstatisticas, duracaoDoVooCompleto } from './estatisticas.ts'
import { bateriasNecessarias, dividirPorAutonomia, limiteDeVoo } from './baterias.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Rota em linha recta para leste, com `troco` metros entre pontos. */
function rotaRecta(quantos: number, troco = 100, velocidade = 10): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, velocidadeGlobal: velocidade }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, troco)
  }
  // Sem paragens, para os tempos serem so de percurso.
  return {
    ...rota,
    waypoints: rota.waypoints.map((w) => ({ ...w, tipoCurva: 'passarSuave' as const })),
  }
}

/**
 * Rota em serpentina, que e a forma de uma cobertura.
 *
 * Uma recta de dezenas de quilometros nao e uma rota que se divida: os pontos do
 * fim ficam longe de mais do sitio de descolagem para caberem em bateria alguma.
 * Uma cobertura e longa mas mantem-se perto, e e essa que se parte.
 */
function rotaSerpente(passagens: number, comprimento: number, espacamento: number): Rota {
  let rota = rotaVazia({
    nome: 'cobertura',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, velocidadeGlobal: 10 }

  let indice = 0
  for (let p = 0; p < passagens; p++) {
    const y = deslocar(DESCOLAGEM, 0, p * espacamento)
    const inicio = p % 2 === 0 ? y : deslocar(y, 90, comprimento)
    const fim = p % 2 === 0 ? deslocar(y, 90, comprimento) : y
    for (const ponto of [inicio, fim]) {
      rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: indice++ }))
    }
  }

  return {
    ...rota,
    waypoints: rota.waypoints.map((w) => ({ ...w, tipoCurva: 'passarSuave' as const })),
  }
}

const MINI = droneComId('mini5pro')

/** O mesmo aparelho com a autonomia que o teste quiser. */
function comAutonomia(minutos: number | undefined): Drone {
  if (minutos === undefined) {
    const { autonomiaMinutos: _fora, ...resto } = MINI
    return resto
  }
  return { ...MINI, autonomiaMinutos: minutos }
}

describe('limite de voo', () => {
  it('sai da autonomia com a margem prudente', () => {
    // 52 minutos a 70% sao 2184 segundos.
    expect(limiteDeVoo(MINI)).toBeCloseTo(52 * 60 * 0.7, 6)
  })

  it('sem autonomia declarada nao ha limite que se calcule', () => {
    expect(limiteDeVoo(comAutonomia(undefined))).toBeNull()
  })

  it('a margem e regulavel', () => {
    expect(limiteDeVoo(MINI, 1)).toBeCloseTo(52 * 60, 6)
  })
})

describe('divisao por autonomia', () => {
  it('uma rota curta e um voo so', () => {
    const rota = rotaRecta(5, 100)
    const divisao = dividirPorAutonomia(rota, MINI)
    expect(divisao.trocos).toHaveLength(1)
    expect(divisao.trocos[0]?.waypoints).toHaveLength(5)
  })

  it('uma rota que nao cabe parte-se em varios voos', () => {
    // 60 passagens de 600 m sao 36 km de percurso, muito alem dos 36 minutos uteis.
    const divisao = dividirPorAutonomia(rotaSerpente(60, 600, 30), MINI)
    expect(divisao.trocos.length).toBeGreaterThan(1)
    expect(divisao.inalcancaveis).toEqual([])
  })

  it('cada voo cabe mesmo no limite', () => {
    const rota = rotaSerpente(60, 600, 30)
    const divisao = dividirPorAutonomia(rota, MINI)

    for (const [i, troco] of divisao.trocos.entries()) {
      expect(duracaoDoVooCompleto(troco)).toBeLessThanOrEqual(divisao.limite)
      expect(divisao.duracoes[i]).toBeCloseTo(duracaoDoVooCompleto(troco), 6)
    }
  })

  it('os waypoints saem todos, pela mesma ordem e sem repetidos', () => {
    const rota = rotaSerpente(60, 600, 30)
    const divisao = dividirPorAutonomia(rota, MINI)

    const saidos = divisao.trocos.flatMap((t) => t.waypoints.map((w) => w.id))
    expect(saidos).toEqual(rota.waypoints.map((w) => w.id))
    expect(new Set(saidos).size).toBe(saidos.length)
  })

  it('cada voo fica renumerado desde o principio', () => {
    const divisao = dividirPorAutonomia(rotaSerpente(60, 600, 30), MINI)
    for (const troco of divisao.trocos) {
      expect(troco.waypoints.map((w) => w.index)).toEqual(troco.waypoints.map((_, i) => i))
    }
  })

  it('os voos tem nomes e identificadores diferentes', () => {
    const divisao = dividirPorAutonomia(rotaSerpente(60, 600, 30), MINI)
    expect(new Set(divisao.trocos.map((t) => t.nome)).size).toBe(divisao.trocos.length)
    expect(new Set(divisao.trocos.map((t) => t.id)).size).toBe(divisao.trocos.length)
  })

  it('os voos de longe gastam mais tempo fora do trabalho', () => {
    /*
     * Nao e o percurso a dividir pela autonomia: cada troco sobe, vai ate ao seu
     * primeiro ponto, percorre-o e volta a casa. Quanto mais longe fica, mais
     * tempo se gasta a ir e a voltar, e menos sobra para trabalhar.
     */
    const divisao = dividirPorAutonomia(rotaSerpente(60, 600, 30), MINI)
    expect(divisao.trocos.length).toBeGreaterThanOrEqual(2)

    /** Tempo que nao e percurso entre waypoints: a ida e o regresso. */
    const idaEVolta = (troco: (typeof divisao.trocos)[number]): number =>
      duracaoDoVooCompleto(troco) - calcularEstatisticas(troco).duracao

    const primeiro = divisao.trocos[0]
    const ultimo = divisao.trocos.at(-1)
    if (!primeiro || !ultimo) throw new Error('trocos em falta')
    expect(idaEVolta(ultimo)).toBeGreaterThan(idaEVolta(primeiro))
  })

  it('nenhum voo leva mais waypoints do que o primeiro', () => {
    // O primeiro parte do sitio de descolagem: e o que tem mais tempo util.
    const divisao = dividirPorAutonomia(rotaSerpente(60, 600, 30), MINI)
    const primeiro = divisao.trocos[0]?.waypoints.length ?? 0
    for (const troco of divisao.trocos) {
      expect(troco.waypoints.length).toBeLessThanOrEqual(primeiro)
    }
  })

  it('um aparelho sem autonomia declarada nao divide nada', () => {
    const divisao = dividirPorAutonomia(rotaRecta(50), comAutonomia(undefined))
    expect(divisao.trocos).toEqual([])
  })

  it('uma rota vazia nao divide nada', () => {
    expect(dividirPorAutonomia(rotaRecta(0), MINI).trocos).toEqual([])
  })

  it('um ponto longe de mais e assinalado em vez de dar um voo impossivel', () => {
    /*
     * Com uma bateria minuscula, nem o primeiro ponto cabe. Nao ha corte que
     * resolva: o que ha a fazer e mudar o ponto de descolagem, e vale mais
     * dize-lo do que devolver trocos que nao voam.
     */
    const divisao = dividirPorAutonomia(rotaRecta(5, 5000), comAutonomia(1))
    expect(divisao.inalcancaveis.length).toBeGreaterThan(0)
    for (const troco of divisao.trocos) {
      expect(duracaoDoVooCompleto(troco)).toBeLessThanOrEqual(divisao.limite)
    }
  })

  it('um ponto inalcancavel nao trava os que vem a seguir', () => {
    // O primeiro ponto longe, os outros a jeito: os outros tem de voar na mesma.
    let rota = rotaRecta(0)
    const longe = deslocar(DESCOLAGEM, 90, 40000)
    rota = acrescentarWaypoint(rota, waypointNovo({ ...longe, altura: 60, index: 0 }))
    for (let i = 1; i < 4; i++) {
      rota = acrescentarWaypoint(
        rota,
        waypointNovo({ ...deslocar(DESCOLAGEM, 90, i * 50), altura: 60, index: i }),
      )
    }

    const divisao = dividirPorAutonomia({ ...rota, velocidadeGlobal: 10 }, comAutonomia(20))
    expect(divisao.inalcancaveis).toEqual([0])
    expect(divisao.trocos.flatMap((t) => t.waypoints)).toHaveLength(3)
  })

  it('a margem mais folgada precisa de menos baterias', () => {
    const rota = rotaSerpente(60, 600, 30)
    expect(bateriasNecessarias(rota, MINI, 1)).toBeLessThanOrEqual(
      bateriasNecessarias(rota, MINI, 0.5),
    )
  })

  it('a contagem de baterias bate com o numero de voos', () => {
    const rota = rotaSerpente(60, 600, 30)
    expect(bateriasNecessarias(rota, MINI)).toBe(dividirPorAutonomia(rota, MINI).trocos.length)
  })
})
