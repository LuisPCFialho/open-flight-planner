import type { Armazem, ResumoProjeto } from './tipos-armazem.ts'
import { anunciarMudanca } from './mudancas.ts'
import {
  apagarProjeto,
  apagarRota,
  bd,
  criarProjeto,
  criarRota,
  duplicarRota,
  gravarRota,
  gravarTrocos,
  lerRota,
  listarProjetos,
  listarRotas,
  renomearRota,
} from './bd.ts'
import {
  duplicarProjeto,
  gravarProjetoImportado,
  lerProjetoComRotas,
  renomearProjeto,
} from './projetos.ts'

/**
 * O armazem de sempre: IndexedDB, nesta maquina, sem conta nenhuma.
 *
 * E o que este repositorio faz por omissao, e o que corre quando as variaveis
 * do Firebase nao estao postas. As funcoes ja existiam em `bd.ts` e em
 * `projetos.ts`; o que se acrescenta aqui e o aviso de mudanca, que antes vinha
 * de graca no `useLiveQuery` do Dexie.
 */

/** Envolve uma escrita para que quem esta a mostrar listas saiba que mudou. */
function aoEscrever<A extends unknown[], R>(
  funcao: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const resultado = await funcao(...args)
    anunciarMudanca()
    return resultado
  }
}

async function listarResumos(): Promise<ResumoProjeto[]> {
  const projetos = await bd.projetos.orderBy('criadoEm').reverse().toArray()
  return Promise.all(
    projetos.map(async (projeto) => ({
      projeto,
      rotas: await bd.rotas.where('projetoId').equals(projeto.id).count(),
    })),
  )
}

export const armazemLocal: Armazem = {
  remoto: false,

  listarProjetos,
  listarResumos,
  criarProjeto: aoEscrever(criarProjeto),
  renomearProjeto: aoEscrever(renomearProjeto),
  apagarProjeto: aoEscrever(apagarProjeto),
  duplicarProjeto: aoEscrever(duplicarProjeto),
  lerProjetoComRotas,
  gravarProjetoImportado: aoEscrever(gravarProjetoImportado),

  listarRotas,
  lerRota,
  criarRota: aoEscrever(criarRota),
  gravarRota: aoEscrever(gravarRota),
  renomearRota: aoEscrever(renomearRota),
  duplicarRota: aoEscrever(duplicarRota),
  apagarRota: aoEscrever(apagarRota),
  gravarTrocos: aoEscrever(gravarTrocos),
}
