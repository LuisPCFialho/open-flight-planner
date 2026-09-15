import Dexie, { type EntityTable } from 'dexie'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { copiarRota, rotaVazia } from '../nucleo/operacoes-rota.ts'

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

    /*
     * A altura minima acima do solo passou a ser por rota. As rotas gravadas
     * antes disso ficam com os 30 m que era o valor fixo ate aqui, que e o mesmo
     * criterio com que foram planeadas.
     */
    this.version(2)
      .stores({
        projetos: 'id, nome, cliente, criadoEm',
        rotas: 'id, projetoId, nome, alteradaEm',
      })
      .upgrade((transaccao) =>
        transaccao
          .table<Rota>('rotas')
          .toCollection()
          .modify((rota) => {
            rota.alturaMinimaAcimaDoSolo ??= 30
          }),
      )

    /*
     * As areas de referencia, importadas de KMZ ou KML com poligonos, sao
     * posteriores. As rotas gravadas antes disto ficam sem nenhuma, que e o que
     * sempre tiveram, mas com a lista criada para ninguem ter de a adivinhar.
     */
    this.version(3)
      .stores({
        projetos: 'id, nome, cliente, criadoEm',
        rotas: 'id, projetoId, nome, alteradaEm',
      })
      .upgrade((transaccao) =>
        transaccao
          .table<Rota>('rotas')
          .toCollection()
          .modify((rota) => {
            rota.areas ??= []
          }),
      )
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

/**
 * Cria uma rota no projeto, com o ponto de descolagem dado.
 *
 * O ponto de descolagem tem de vir de fora porque a cota do terreno e
 * assincrona: quem chama e que sabe espera-la.
 */
export async function criarRota(dados: {
  nome: string
  projetoId: string
  droneId: string
  pontoDescolagem: Rota['pontoDescolagem']
}): Promise<Rota> {
  const rota = rotaVazia(dados)
  await bd.rotas.add(rota)
  return rota
}

/** Duplica uma rota dentro do mesmo projeto, com identificadores novos. */
export async function duplicarRota(rotaId: string): Promise<Rota> {
  const original = await bd.rotas.get(rotaId)
  if (!original) throw new Error('rota nao encontrada')

  const copia = copiarRota(original, original.projetoId, `${original.nome} (copia)`)
  await bd.rotas.add(copia)
  return copia
}

export async function renomearRota(rotaId: string, nome: string): Promise<void> {
  await bd.rotas.update(rotaId, { nome, alteradaEm: Date.now() })
}
