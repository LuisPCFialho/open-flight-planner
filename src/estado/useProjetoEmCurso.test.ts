import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { rotaVazia } from '../nucleo/operacoes-rota.ts'
import { rotaAAbrir } from './useProjetoEmCurso.ts'

/**
 * Qual das rotas abrir ao entrar num projeto.
 *
 * A regra parece pequena e nao e: uma rota explicitamente escolhida - vinda de
 * uma divisao por baterias, de uma duplicacao, de uma importacao - tem de mandar
 * sobre a ultima alterada, ou o utilizador acaba a olhar para outra rota logo a
 * seguir a criar a que queria.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function rota(id: string, alteradaEm: number): Rota {
  return {
    ...rotaVazia({
      nome: id,
      projetoId: 'p',
      droneId: 'mini5pro',
      pontoDescolagem: DESCOLAGEM,
    }),
    id,
    alteradaEm,
  }
}

describe('qual das rotas abrir', () => {
  const rotas = [rota('antiga', 100), rota('recente', 300), rota('media', 200)]

  it('sem rotas nao ha nada a abrir', () => {
    expect(rotaAAbrir([], null)).toBeUndefined()
    expect(rotaAAbrir([], 'seja-qual-for')).toBeUndefined()
  })

  it('sem escolha abre-se a ultima alterada', () => {
    expect(rotaAAbrir(rotas, null)?.id).toBe('recente')
  })

  it('a rota escolhida manda sobre a ultima alterada', () => {
    expect(rotaAAbrir(rotas, 'antiga')?.id).toBe('antiga')
  })

  it('uma escolha que ja nao existe cai na ultima alterada', () => {
    // Acontece depois de apagar a rota que estava aberta.
    expect(rotaAAbrir(rotas, 'apagada')?.id).toBe('recente')
  })

  it('a lista recebida nao e alterada', () => {
    /*
     * A ordenacao e sobre uma copia. Ordenar a lista que vem da base de dados
     * mudava a ordem por que ela e mostrada noutro sitio.
     */
    const original = [...rotas]
    rotaAAbrir(rotas, null)
    expect(rotas.map((r) => r.id)).toEqual(original.map((r) => r.id))
  })

  it('com uma rota so, e essa', () => {
    expect(rotaAAbrir([rota('unica', 1)], null)?.id).toBe('unica')
  })
})
