import Dexie, { type EntityTable } from 'dexie'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'

/**
 * Persistencia local em IndexedDB. Sem backend e sem contas: os projetos ficam
 * no posto de trabalho e saem em JSON ou KMZ quando for preciso leva-los.
 *
 * As operacoes sobre o conteudo de uma rota vivem em `nucleo/operacoes-rota.ts`,
 * que e codigo puro. Aqui so entra o que toca na base de dados.
 */
class BaseDeDados extends Dexie {
  projetos!: EntityTable<Projeto, 'id'>
  rotas!: EntityTable<Rota, 'id'>

  constructor() {
    super('pye-flight-planner')
    this.version(1).stores({
      projetos: 'id, nome, cliente, criadoEm',
      rotas: 'id, projetoId, nome, alteradaEm',
    })
  }
}

export const bd = new BaseDeDados()

// --- Projetos ----------------------------------------------------------------

export async function criarProjeto(dados: {
  nome: string
  cliente?: string
  local?: string
}): Promise<Projeto> {
  const projeto: Projeto = {
    id: novoId(),
    nome: dados.nome,
    cliente: dados.cliente ?? '',
    local: dados.local ?? '',
    criadoEm: Date.now(),
  }
  await bd.projetos.add(projeto)
  return projeto
}

export function listarProjetos(): Promise<Projeto[]> {
  return bd.projetos.orderBy('criadoEm').reverse().toArray()
}

export async function apagarProjeto(id: string): Promise<void> {
  await bd.transaction('rw', bd.projetos, bd.rotas, async () => {
    await bd.rotas.where('projetoId').equals(id).delete()
    await bd.projetos.delete(id)
  })
}

// --- Rotas -------------------------------------------------------------------

export async function gravarRota(rota: Rota): Promise<void> {
  await bd.rotas.put({ ...rota, alteradaEm: Date.now() })
}

export function lerRota(id: string): Promise<Rota | undefined> {
  return bd.rotas.get(id)
}

export function listarRotas(projetoId: string): Promise<Rota[]> {
  return bd.rotas.where('projetoId').equals(projetoId).toArray()
}

export async function apagarRota(id: string): Promise<void> {
  await bd.rotas.delete(id)
}
