import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { copiarRota, rotaVazia } from '../nucleo/operacoes-rota.ts'
import type { Armazem, ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
import { anunciarMudanca } from './mudancas.ts'
import {
  deLinhaProjeto,
  deLinhaRota,
  paraLinhaProjeto,
  paraLinhaRota,
  type LinhaProjeto,
  type LinhaRota,
} from './linhas.ts'

/**
 * O armazem em Postgres, com uma conta por pessoa.
 *
 * Nenhuma consulta aqui filtra por dono, e e de proposito: quem filtra e o
 * Postgres, pelas politicas de linha em `supabase/esquema.sql`. Um filtro no
 * cliente seria decoracao - a chave que o browser usa esta a vista de quem
 * abrir as ferramentas de programador, e quem quisesse pedia sem ele.
 *
 * O `dono` tambem nao se escreve: a coluna toma por omissao a identidade de
 * quem esta a escrever. Uma linha nao pode nascer em nome de outra conta, nem
 * por engano nosso.
 */

const PROJETOS = 'projetos'
const ROTAS = 'rotas'

type Resposta<T> = { data: T | null; error: PostgrestError | null }

class ErroDoArmazem extends Error {
  constructor(operacao: string, razao: string) {
    /*
     * A razao que a base deu vai inteira para o ecra.
     *
     * "falha a gravar" nao ajuda ninguem a perceber se foi a rede, se foi a
     * sessao a expirar, ou se foi uma politica de linha a recusar. O que o
     * Postgres devolve nao expoe dados de ninguem: diz o que a operacao tentou.
     */
    super(`${operacao}: ${razao}`)
    this.name = 'ErroDoArmazem'
  }
}

/** Desembrulha uma resposta do Postgrest, ou atira com a razao. */
export function ou<T>(operacao: string, resposta: Resposta<T>): T {
  if (resposta.error) throw new ErroDoArmazem(operacao, resposta.error.message)
  if (resposta.data === null) throw new ErroDoArmazem(operacao, 'a base nao devolveu nada')
  return resposta.data
}

export function armazemRemoto(cliente: SupabaseClient): Armazem {
  const projetos = () => cliente.from(PROJETOS)
  const rotas = () => cliente.from(ROTAS)

  const COLUNAS_PROJETO = 'id, criado_em, conteudo'
  const COLUNAS_ROTA = 'id, projeto_id, alterada_em, conteudo'

  const lerProjetos = async (): Promise<Projeto[]> => {
    const linhas = ou(
      'listar projetos',
      (await projetos()
        .select(COLUNAS_PROJETO)
        .order('criado_em', { ascending: false })) as Resposta<LinhaProjeto[]>,
    )
    return linhas.map(deLinhaProjeto)
  }

  const lerRotasDoProjeto = async (projetoId: string): Promise<Rota[]> => {
    const linhas = ou(
      'listar rotas',
      (await rotas()
        .select(COLUNAS_ROTA)
        .eq('projeto_id', projetoId)) as Resposta<LinhaRota[]>,
    )
    return linhas.map(deLinhaRota)
  }

  const lerProjeto = async (id: string): Promise<Projeto | null> => {
    const linhas = ou(
      'ler projeto',
      (await projetos().select(COLUNAS_PROJETO).eq('id', id).limit(1)) as Resposta<LinhaProjeto[]>,
    )
    const linha = linhas[0]
    return linha ? deLinhaProjeto(linha) : null
  }

  const lerUmaRota = async (id: string): Promise<Rota | undefined> => {
    const linhas = ou(
      'ler rota',
      (await rotas().select(COLUNAS_ROTA).eq('id', id).limit(1)) as Resposta<LinhaRota[]>,
    )
    const linha = linhas[0]
    return linha ? deLinhaRota(linha) : undefined
  }

  const inserirProjeto = async (projeto: Projeto): Promise<Projeto> => {
    ou(
      'criar projeto',
      (await projetos().insert(paraLinhaProjeto(projeto)).select('id')) as Resposta<unknown[]>,
    )
    return projeto
  }

  const inserirRotas = async (novas: readonly Rota[]): Promise<void> => {
    if (novas.length === 0) return
    ou(
      'gravar rotas',
      (await rotas().insert(novas.map(paraLinhaRota)).select('id')) as Resposta<unknown[]>,
    )
  }

  return {
    remoto: true,

    listarProjetos: lerProjetos,

    /*
     * Duas consultas e a contagem aqui, em vez de um `group by` na base.
     *
     * Uma conta tem dezenas de projetos e cada um meia duzia de rotas: trazer
     * os identificadores e contar custa menos do que manter uma vista ou uma
     * funcao na base so para isto. As politicas de linha ja limitam o que vem.
     */
    async listarResumos(): Promise<ResumoProjeto[]> {
      const lista = await lerProjetos()
      const linhas = ou(
        'contar rotas',
        (await rotas().select('projeto_id')) as Resposta<{ projeto_id: string }[]>,
      )

      const quantas = new Map<string, number>()
      for (const linha of linhas) {
        quantas.set(linha.projeto_id, (quantas.get(linha.projeto_id) ?? 0) + 1)
      }

      return lista.map((projeto) => ({ projeto, rotas: quantas.get(projeto.id) ?? 0 }))
    },

    async criarProjeto(dados): Promise<Projeto> {
      const projeto = await inserirProjeto({
        id: novoId(),
        nome: dados.nome,
        cliente: dados.cliente ?? '',
        local: dados.local ?? '',
        criadoEm: Date.now(),
      })
      anunciarMudanca()
      return projeto
    },

    async renomearProjeto(id, alteracao): Promise<void> {
      const actual = await lerProjeto(id)
      if (!actual) throw new Error('projeto nao encontrado')
      ou(
        'renomear projeto',
        (await projetos()
          .update({ conteudo: paraLinhaProjeto({ ...actual, ...alteracao }).conteudo })
          .eq('id', id)
          .select('id')) as Resposta<unknown[]>,
      )
      anunciarMudanca()
    },

    async apagarProjeto(id): Promise<void> {
      // As rotas vao atras pela chave estrangeira, com `on delete cascade`.
      ou(
        'apagar projeto',
        (await projetos().delete().eq('id', id).select('id')) as Resposta<unknown[]>,
      )
      anunciarMudanca()
    },

    async duplicarProjeto(id): Promise<Projeto> {
      const original = await lerProjeto(id)
      if (!original) throw new Error('projeto nao encontrado')
      const originais = await lerRotasDoProjeto(id)

      const copia = await inserirProjeto({
        ...original,
        id: novoId(),
        nome: `${original.nome} (copia)`,
        criadoEm: Date.now(),
      })
      await inserirRotas(originais.map((rota) => copiarRota(rota, copia.id)))
      anunciarMudanca()
      return copia
    },

    async lerProjetoComRotas(id): Promise<ProjetoComRotas | null> {
      const projeto = await lerProjeto(id)
      if (!projeto) return null
      return { projeto, rotas: await lerRotasDoProjeto(id) }
    },

    async gravarProjetoImportado(conteudo): Promise<Projeto> {
      await inserirProjeto(conteudo.projeto)
      await inserirRotas(conteudo.rotas)
      anunciarMudanca()
      return conteudo.projeto
    },

    listarRotas: lerRotasDoProjeto,
    lerRota: lerUmaRota,

    async criarRota(dados): Promise<Rota> {
      const rota = rotaVazia(dados)
      await inserirRotas([rota])
      anunciarMudanca()
      return rota
    },

    async gravarRota(rota): Promise<void> {
      const actualizada = { ...rota, alteradaEm: Date.now() }
      ou(
        'gravar rota',
        (await rotas().upsert(paraLinhaRota(actualizada)).select('id')) as Resposta<unknown[]>,
      )
      anunciarMudanca()
    },

    async renomearRota(id, nome): Promise<void> {
      const actual = await lerUmaRota(id)
      if (!actual) throw new Error('rota nao encontrada')
      ou(
        'renomear rota',
        (await rotas()
          .update(paraLinhaRota({ ...actual, nome, alteradaEm: Date.now() }))
          .eq('id', id)
          .select('id')) as Resposta<unknown[]>,
      )
      anunciarMudanca()
    },

    async duplicarRota(id): Promise<Rota> {
      const original = await lerUmaRota(id)
      if (!original) throw new Error('rota nao encontrada')
      const copia = copiarRota(original, original.projetoId, `${original.nome} (copia)`)
      await inserirRotas([copia])
      anunciarMudanca()
      return copia
    },

    async apagarRota(id): Promise<void> {
      ou('apagar rota', (await rotas().delete().eq('id', id).select('id')) as Resposta<unknown[]>)
      anunciarMudanca()
    },

    async gravarTrocos(trocos): Promise<Rota[]> {
      const agora = Date.now()
      const novas = trocos.map((troco) => ({
        ...troco,
        id: novoId(),
        criadaEm: agora,
        alteradaEm: agora,
      }))
      await inserirRotas(novas)
      anunciarMudanca()
      return novas
    },
  }
}
