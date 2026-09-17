import { describe, it, expect } from 'vitest'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import {
  deLinhaProjeto,
  deLinhaRota,
  LinhaInvalida,
  paraLinhaProjeto,
  paraLinhaRota,
} from './linhas.ts'

/**
 * A traducao entre as linhas da base e os tipos da aplicacao.
 *
 * O que aqui se verifica nao e o Postgres: e a fronteira. Trocar `criado_em`
 * por `criadoEm` nao rebenta nada - so faz a lista aparecer pela ordem errada,
 * e quem a ve nao tem como saber porque.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function projeto(): Projeto {
  return { id: 'p1', nome: 'Sever do Vouga', cliente: 'PowerYield', local: 'Aveiro', criadoEm: 1700 }
}

function rota(): Rota {
  const base = rotaVazia({
    nome: 'campanha 1',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  return acrescentarWaypoint(
    base,
    waypointNovo({ lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon, altura: 60, index: 0 }),
  )
}

describe('linhas de projeto', () => {
  it('ida e volta nao perde nada', () => {
    const original = projeto()
    expect(deLinhaProjeto(paraLinhaProjeto(original))).toEqual(original)
  })

  it('a data fica em coluna, para a base poder ordenar por ela', () => {
    const linha = paraLinhaProjeto(projeto())
    expect(linha.criado_em).toBe(1700)
    expect(linha.conteudo).not.toHaveProperty('criadoEm')
    expect(linha.conteudo).not.toHaveProperty('id')
  })

  it('um projeto sem cliente nem local le-se com os campos vazios', () => {
    const lido = deLinhaProjeto({ id: 'p9', criado_em: 1, conteudo: { nome: 'so nome' } })
    expect(lido).toEqual({ id: 'p9', nome: 'so nome', cliente: '', local: '', criadoEm: 1 })
  })

  it('um conteudo que nao e objecto e recusado com a razao', () => {
    expect(() => deLinhaProjeto({ id: 'p1', criado_em: 1, conteudo: 'nada' })).toThrow(LinhaInvalida)
    expect(() => deLinhaProjeto({ id: 'p1', criado_em: 1, conteudo: null })).toThrow(LinhaInvalida)
    expect(() => deLinhaProjeto({ id: 'p1', criado_em: 1, conteudo: [] })).toThrow(LinhaInvalida)
  })
})

describe('linhas de rota', () => {
  it('ida e volta nao perde os waypoints', () => {
    const original = rota()
    const lida = deLinhaRota(paraLinhaRota(original))
    expect(lida).toEqual(original)
    expect(lida.waypoints).toHaveLength(1)
  })

  it('o projeto e a data de alteracao ficam tambem em coluna', () => {
    const linha = paraLinhaRota(rota())
    expect(linha.projeto_id).toBe('p1')
    expect(typeof linha.alterada_em).toBe('number')
  })

  /*
   * Foi a coluna que trouxe a linha ate aqui: foi por ela que a consulta
   * filtrou e foi ela que o indice leu. Deixar o conteudo ganhar era deixar
   * passar uma rota que aparece num projeto e diz pertencer a outro.
   */
  it('quando a coluna e o conteudo discordam, manda a coluna', () => {
    const original = rota()
    const lida = deLinhaRota({
      ...paraLinhaRota(original),
      id: 'r-da-coluna',
      projeto_id: 'p-da-coluna',
      alterada_em: 999,
    })

    expect(lida.id).toBe('r-da-coluna')
    expect(lida.projetoId).toBe('p-da-coluna')
    expect(lida.alteradaEm).toBe(999)
  })

  it('um conteudo que nao e objecto e recusado com a razao', () => {
    expect(() =>
      deLinhaRota({ id: 'r1', projeto_id: 'p1', alterada_em: 1, conteudo: 7 }),
    ).toThrow(LinhaInvalida)
  })
})
