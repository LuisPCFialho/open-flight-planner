import { armazemLocal } from './armazem-local.ts'
import { deFicheiro, paraFicheiro } from './projetos.ts'
import type { Armazem } from './tipos-armazem.ts'

/**
 * Levar para a conta os projetos que ficaram nesta maquina.
 *
 * Quem usou a ferramenta antes de haver contas tem trabalho em IndexedDB. Essa
 * base continua la, intacta, mas deixa de ser onde a aplicacao le - e sem isto
 * a pessoa entrava, via a lista vazia, e concluia que tinha perdido tudo.
 *
 * A copia passa pelo mesmo caminho da importacao de um ficheiro JSON: valida
 * campo a campo e gera identificadores novos. Isso e de proposito duas vezes -
 * um projeto mal formado e recusado com a razao em vez de entrar na conta, e
 * enviar duas vezes da dois projetos em vez de escrever por cima do primeiro.
 *
 * Nada e apagado desta maquina. Se a copia correr mal, o que la esta continua a
 * estar; quem quiser limpar faz o mesmo que sempre fez, projeto a projeto.
 */

/**
 * De onde se copia. So os testes o dizem: em uso e sempre o armazem local.
 *
 * Existe porque a IndexedDB nao existe no ambiente onde estes testes correm, e
 * levantar uma de mentira so para verificar uma copia trocava o ensaio da copia
 * por um ensaio do Dexie.
 */
type Origem = Pick<Armazem, 'listarResumos' | 'lerProjetoComRotas'>

/** Quantos projetos estao guardados nesta maquina. */
export async function quantosProjetosLocais(origem: Origem = armazemLocal): Promise<number> {
  const resumos = await origem.listarResumos()
  return resumos.length
}

/** Copia os projetos desta maquina para o armazem dado. Devolve quantos foram. */
export async function enviarProjetosLocais(
  destino: Pick<Armazem, 'gravarProjetoImportado'>,
  origem: Origem = armazemLocal,
): Promise<number> {
  const resumos = await origem.listarResumos()

  let enviados = 0
  for (const { projeto } of resumos) {
    const conteudo = await origem.lerProjetoComRotas(projeto.id)
    if (!conteudo) continue
    await destino.gravarProjetoImportado(deFicheiro(paraFicheiro(conteudo)))
    enviados++
  }

  return enviados
}
