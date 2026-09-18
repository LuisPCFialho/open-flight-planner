import { describe, expect, it } from 'vitest'
import { filtrar, numeroProcurado, waypointsAssinalados } from './filtro-waypoints.ts'
import type { LinhaWaypoint } from './ListaWaypoints.tsx'
import { waypointNovo } from '../nucleo/operacoes-rota.ts'

function linha(
  index: number,
  opcoes: { alerta?: boolean; foto?: boolean } = {},
): LinhaWaypoint {
  const waypoint = waypointNovo({ lat: 40, lon: -8, altura: 60, index })
  return {
    waypoint: opcoes.foto
      ? { ...waypoint, acoes: [{ tipo: 'tirarFoto' as const }] }
      : { ...waypoint, acoes: [] },
    cotaTerreno: 100,
    acimaDoSolo: 60,
    alerta: opcoes.alerta ?? false,
    origemCota: null,
  }
}

const LINHAS: LinhaWaypoint[] = [
  linha(0, { foto: true }),
  linha(1, { alerta: true }),
  linha(2, { foto: true, alerta: true }),
  linha(3),
]

describe('numeroProcurado', () => {
  it('le o numero que a lista mostra', () => {
    expect(numeroProcurado('12')).toBe(12)
    expect(numeroProcurado('  7 ')).toBe(7)
  })

  it('ignora o que nao e um numero de waypoint', () => {
    expect(numeroProcurado('')).toBeNull()
    expect(numeroProcurado('   ')).toBeNull()
    expect(numeroProcurado('abc')).toBeNull()
    expect(numeroProcurado('1.5')).toBeNull()
    expect(numeroProcurado('0')).toBeNull()
    expect(numeroProcurado('-3')).toBeNull()
  })
})

describe('filtrar', () => {
  it('sem filtro devolve o proprio arranjo, nao uma copia', () => {
    expect(filtrar(LINHAS, 'todos', '')).toBe(LINHAS)
  })

  it('procura pelo numero que a lista mostra, nao pelo indice', () => {
    const achado = filtrar(LINHAS, 'todos', '3')
    expect(achado).toHaveLength(1)
    expect(achado[0]!.waypoint.index).toBe(2)
  })

  it('um numero que nao existe nao da nada', () => {
    expect(filtrar(LINHAS, 'todos', '99')).toHaveLength(0)
  })

  it('assinalados', () => {
    expect(filtrar(LINHAS, 'alerta', '').map((l) => l.waypoint.index)).toEqual([1, 2])
  })

  it('com foto e sem foto sao complementares', () => {
    const com = filtrar(LINHAS, 'foto', '').map((l) => l.waypoint.index)
    const sem = filtrar(LINHAS, 'sem-foto', '').map((l) => l.waypoint.index)
    expect(com).toEqual([0, 2])
    expect(sem).toEqual([1, 3])
    expect(com.length + sem.length).toBe(LINHAS.length)
  })

  it('o numero e o criterio aplicam-se os dois', () => {
    expect(filtrar(LINHAS, 'alerta', '1')).toHaveLength(0)
    expect(filtrar(LINHAS, 'alerta', '2')).toHaveLength(1)
  })
})

describe('waypointsAssinalados', () => {
  it('junta os indices de todas as validacoes', () => {
    const conjunto = waypointsAssinalados([
      { waypoints: [1, 2] },
      { waypoints: [2, 5] },
      {},
    ])
    expect([...conjunto].sort((a, b) => a - b)).toEqual([1, 2, 5])
  })

  it('sem validacoes nao assinala nada', () => {
    expect(waypointsAssinalados([]).size).toBe(0)
  })
})

describe('o filtro dos assinalados', () => {
  /*
   * O alerta da linha e so a altura acima do solo fora dos limites. As zonas
   * interditas, o vento e as accoes que o aparelho nao suporta apontam waypoints
   * que nao levam alerta nenhum na linha, e um filtro chamado "assinalados" que
   * os ignorasse mentia pelo nome.
   */
  it('apanha o que as validacoes apontaram, alem do alerta da linha', () => {
    const achados = filtrar(LINHAS, 'alerta', '', new Set([0]))
    expect(achados.map((l) => l.waypoint.index)).toEqual([0, 1, 2])
  })

  it('sem conjunto nenhum continua a valer so o alerta da linha', () => {
    expect(filtrar(LINHAS, 'alerta', '').map((l) => l.waypoint.index)).toEqual([1, 2])
  })

  it('um indice assinalado que ja tinha alerta nao aparece duas vezes', () => {
    const achados = filtrar(LINHAS, 'alerta', '', new Set([1]))
    expect(achados.map((l) => l.waypoint.index)).toEqual([1, 2])
  })

  it('os outros criterios nao olham para os assinalados', () => {
    expect(filtrar(LINHAS, 'foto', '', new Set([1])).map((l) => l.waypoint.index)).toEqual([0, 2])
  })
})
