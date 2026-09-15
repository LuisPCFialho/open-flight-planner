import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { droneComId } from '../drones.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './operacoes-rota.ts'
import {
  accaoPredefinida,
  accaoSuportada,
  accoesNaoSuportadas,
  acrescentarAccao,
  acrescentarAccaoEmLote,
  alterarAccao,
  moverAccao,
  removerAccao,
  removerAccoesNaoSuportadas,
} from './operacoes-accoes.ts'

function rotaDeTeste(quantos: number): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mavic3t',
    pontoDescolagem: { lat: 40.7, lon: -8.4, cotaTerreno: 200 },
  })
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ lat: 40.7 + i * 0.001, lon: -8.4, altura: 60, index: i }))
  }
  return rota
}

describe('accaoPredefinida', () => {
  it('parte do angulo que o waypoint ja tem, para o gimbal nao dar um salto', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')

    const accao = accaoPredefinida('rodarGimbal', { ...wp, gimbalPitch: -75, gimbalYaw: 20 })
    expect(accao).toEqual({ tipo: 'rodarGimbal', pitch: -75, yaw: 20 })
  })

  it('da valores de partida a cada tipo', () => {
    expect(accaoPredefinida('tirarFoto')).toEqual({ tipo: 'tirarFoto' })
    expect(accaoPredefinida('pairar')).toEqual({ tipo: 'pairar', segundos: 3 })
    expect(accaoPredefinida('zoom')).toEqual({ tipo: 'zoom', fator: 1 })
  })
})

describe('suporte por drone', () => {
  it('o Mavic 3T faz zoom e o Mini 5 Pro nao', () => {
    expect(accaoSuportada(droneComId('mavic3t'), 'zoom')).toBe(true)
    expect(accaoSuportada(droneComId('mini5pro'), 'zoom')).toBe(false)
  })

  it('assinala as accoes que o drone escolhido nao sabe executar', () => {
    let rota = rotaDeTeste(3)
    const segundo = rota.waypoints[1]
    if (!segundo) throw new Error('waypoint em falta')
    rota = acrescentarAccao(rota, segundo.id, { tipo: 'zoom', fator: 4 })

    expect(accoesNaoSuportadas(rota, droneComId('mavic3t'))).toEqual([])
    expect(accoesNaoSuportadas(rota, droneComId('mini5pro'))).toEqual([
      { indiceWaypoint: 1, tipo: 'zoom' },
    ])
  })

  it('remove as accoes nao suportadas e deixa as outras intactas', () => {
    let rota = rotaDeTeste(2)
    const primeiro = rota.waypoints[0]
    if (!primeiro) throw new Error('waypoint em falta')
    rota = acrescentarAccao(rota, primeiro.id, { tipo: 'tirarFoto' })
    rota = acrescentarAccao(rota, primeiro.id, { tipo: 'zoom', fator: 2 })

    const limpa = removerAccoesNaoSuportadas(rota, droneComId('mini5pro'))
    expect(limpa.waypoints[0]?.acoes).toEqual([{ tipo: 'tirarFoto' }])
    // O waypoint que nao mudou mantem a identidade.
    expect(limpa.waypoints[1]).toBe(rota.waypoints[1])
  })
})

describe('ordem das accoes', () => {
  it('acrescenta no fim e mantem a ordem', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')

    let com = acrescentarAccao(rota, wp.id, { tipo: 'rodarGimbal', pitch: -90, yaw: 0 })
    com = acrescentarAccao(com, wp.id, { tipo: 'tirarFoto' })
    expect(com.waypoints[0]?.acoes.map((a) => a.tipo)).toEqual(['rodarGimbal', 'tirarFoto'])
  })

  it('move uma accao de posicao', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')

    let com = acrescentarAccao(rota, wp.id, { tipo: 'rodarGimbal', pitch: -90, yaw: 0 })
    com = acrescentarAccao(com, wp.id, { tipo: 'tirarFoto' })
    com = acrescentarAccao(com, wp.id, { tipo: 'pairar', segundos: 2 })

    const movida = moverAccao(com, wp.id, 2, 0)
    expect(movida.waypoints[0]?.acoes.map((a) => a.tipo)).toEqual([
      'pairar',
      'rodarGimbal',
      'tirarFoto',
    ])
  })

  it('ignora posicoes fora do intervalo', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')
    const com = acrescentarAccao(rota, wp.id, { tipo: 'tirarFoto' })

    expect(moverAccao(com, wp.id, 0, 9).waypoints[0]?.acoes).toEqual([{ tipo: 'tirarFoto' }])
    expect(moverAccao(com, wp.id, -1, 0).waypoints[0]?.acoes).toEqual([{ tipo: 'tirarFoto' }])
  })

  it('remove e altera pelo indice', () => {
    const rota = rotaDeTeste(1)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')

    let com = acrescentarAccao(rota, wp.id, { tipo: 'tirarFoto' })
    com = acrescentarAccao(com, wp.id, { tipo: 'pairar', segundos: 2 })

    expect(alterarAccao(com, wp.id, 1, { tipo: 'pairar', segundos: 9 }).waypoints[0]?.acoes[1]).toEqual({
      tipo: 'pairar',
      segundos: 9,
    })
    expect(removerAccao(com, wp.id, 0).waypoints[0]?.acoes).toEqual([{ tipo: 'pairar', segundos: 2 }])
  })
})

describe('accao em lote', () => {
  it('acrescenta a mesma accao a varios waypoints e deixa os outros em paz', () => {
    const rota = rotaDeTeste(4)
    const alvos = [rota.waypoints[0]?.id ?? '', rota.waypoints[2]?.id ?? '']

    const com = acrescentarAccaoEmLote(rota, alvos, 'tirarFoto')
    expect(com.waypoints[0]?.acoes).toEqual([{ tipo: 'tirarFoto' }])
    expect(com.waypoints[2]?.acoes).toEqual([{ tipo: 'tirarFoto' }])
    expect(com.waypoints[1]?.acoes).toEqual([])
    expect(com.waypoints[1]).toBe(rota.waypoints[1])
  })

  it('usa o angulo proprio de cada waypoint ao rodar o gimbal em lote', () => {
    let rota = rotaDeTeste(2)
    rota = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) => ({ ...w, gimbalPitch: i === 0 ? -30 : -80 })),
    }
    const ids = rota.waypoints.map((w) => w.id)

    const com = acrescentarAccaoEmLote(rota, ids, 'rodarGimbal')
    expect(com.waypoints[0]?.acoes[0]).toEqual({ tipo: 'rodarGimbal', pitch: -30, yaw: 0 })
    expect(com.waypoints[1]?.acoes[0]).toEqual({ tipo: 'rodarGimbal', pitch: -80, yaw: 0 })
  })
})

describe('imutabilidade', () => {
  it('nenhuma operacao altera a rota recebida', () => {
    let rota = rotaDeTeste(3)
    const wp = rota.waypoints[0]
    if (!wp) throw new Error('waypoint em falta')
    rota = acrescentarAccao(rota, wp.id, { tipo: 'tirarFoto' })
    const copia = structuredClone(rota)

    acrescentarAccao(rota, wp.id, { tipo: 'pairar', segundos: 1 })
    removerAccao(rota, wp.id, 0)
    alterarAccao(rota, wp.id, 0, { tipo: 'zoom', fator: 3 })
    moverAccao(rota, wp.id, 0, 0)
    acrescentarAccaoEmLote(rota, [wp.id], 'tirarFoto')
    removerAccoesNaoSuportadas(rota, droneComId('mini5pro'))

    expect(rota).toEqual(copia)
  })
})
