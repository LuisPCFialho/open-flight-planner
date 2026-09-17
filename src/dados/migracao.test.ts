import { describe, it, expect, vi } from 'vitest'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { rotaVazia } from '../nucleo/operacoes-rota.ts'
import type { ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
import { enviarProjetosLocais, quantosProjetosLocais } from './migracao.ts'

/**
 * Levar para a conta o que ficou nesta maquina.
 *
 * E a operacao mais delicada de todas: quem a corre tem trabalho a serio
 * guardado localmente e nao tem forma de o verificar antes. O que se verifica
 * aqui e que nada se perde e que correr duas vezes nao escreve por cima.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function projeto(id: string, nome: string): Projeto {
  return { id, nome, cliente: 'PowerYield', local: 'Aveiro', criadoEm: 1700 }
}

function rota(id: string, projetoId: string): Rota {
  const base = rotaVazia({
    nome: `rota de ${projetoId}`,
    projetoId,
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  return { ...base, id }
}

/** Um armazem de origem com o conteudo dado, sem base de dados nenhuma. */
function origemCom(conteudos: ProjetoComRotas[]) {
  return {
    listarResumos: (): Promise<ResumoProjeto[]> =>
      Promise.resolve(conteudos.map((c) => ({ projeto: c.projeto, rotas: c.rotas.length }))),
    lerProjetoComRotas: (id: string): Promise<ProjetoComRotas | null> =>
      Promise.resolve(conteudos.find((c) => c.projeto.id === id) ?? null),
  }
}

function destinoQueRegista() {
  const recebidos: ProjetoComRotas[] = []
  return {
    recebidos,
    gravarProjetoImportado: (conteudo: ProjetoComRotas): Promise<Projeto> => {
      recebidos.push(conteudo)
      return Promise.resolve(conteudo.projeto)
    },
  }
}

describe('copiar os projetos locais para a conta', () => {
  it('conta os que estao nesta maquina', async () => {
    const origem = origemCom([
      { projeto: projeto('p1', 'um'), rotas: [] },
      { projeto: projeto('p2', 'dois'), rotas: [] },
    ])
    expect(await quantosProjetosLocais(origem)).toBe(2)
  })

  it('leva os projetos e as suas rotas', async () => {
    const origem = origemCom([
      { projeto: projeto('p1', 'Sever do Vouga'), rotas: [rota('r1', 'p1'), rota('r2', 'p1')] },
    ])
    const destino = destinoQueRegista()

    expect(await enviarProjetosLocais(destino, origem)).toBe(1)
    expect(destino.recebidos).toHaveLength(1)
    expect(destino.recebidos[0]?.projeto.nome).toBe('Sever do Vouga')
    expect(destino.recebidos[0]?.rotas).toHaveLength(2)
  })

  /*
   * Os identificadores sao regerados porque a copia passa pelo caminho da
   * importacao. Sem isso, copiar outra vez escrevia por cima do que ja la
   * estava - e quem carrega duas vezes no botao fica com dois projetos, que e
   * uma chatice, e nao sem nenhum, que e uma perda.
   */
  it('a copia leva identificadores novos, e a segunda nao apaga a primeira', async () => {
    const origem = origemCom([{ projeto: projeto('p1', 'um'), rotas: [rota('r1', 'p1')] }])
    const destino = destinoQueRegista()

    await enviarProjetosLocais(destino, origem)
    await enviarProjetosLocais(destino, origem)

    const [primeira, segunda] = destino.recebidos
    expect(primeira?.projeto.id).not.toBe('p1')
    expect(primeira?.projeto.id).not.toBe(segunda?.projeto.id)
    expect(primeira?.rotas[0]?.id).not.toBe(segunda?.rotas[0]?.id)
  })

  it('as rotas copiadas ficam penduradas no projeto novo, e nao no antigo', async () => {
    const origem = origemCom([{ projeto: projeto('p1', 'um'), rotas: [rota('r1', 'p1')] }])
    const destino = destinoQueRegista()

    await enviarProjetosLocais(destino, origem)

    const recebido = destino.recebidos[0]
    expect(recebido?.rotas[0]?.projetoId).toBe(recebido?.projeto.id)
  })

  it('um projeto que desapareceu a meio nao trava os outros', async () => {
    const origem = origemCom([
      { projeto: projeto('p1', 'um'), rotas: [] },
      { projeto: projeto('p2', 'dois'), rotas: [] },
    ])
    origem.lerProjetoComRotas = vi.fn(async (id: string) =>
      id === 'p1' ? null : { projeto: projeto('p2', 'dois'), rotas: [] },
    )
    const destino = destinoQueRegista()

    expect(await enviarProjetosLocais(destino, origem)).toBe(1)
    expect(destino.recebidos[0]?.projeto.nome).toBe('dois')
  })
})
