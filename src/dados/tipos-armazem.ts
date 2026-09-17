import type { Projeto, Rota } from '../nucleo/tipos.ts'

/**
 * O contrato de armazenamento.
 *
 * Ha duas implementacoes e a aplicacao nao sabe qual esta a usar: a local, em
 * IndexedDB, que e o que este repositorio faz por omissao e nao precisa de
 * conta nenhuma; e a remota, em Postgres, onde cada conta ve os seus projetos e
 * so os seus.
 *
 * Existe por duas razoes. A primeira e o sitio publicado, onde os projetos tem
 * de sobreviver ao browser e a maquina. A segunda e mais importante: quem clona
 * este repositorio tem de o poder correr com `npm run dev` e mais nada. A
 * promessa que esta no README - corre no browser, os teus dados nao saem da
 * maquina - deixaria de ser verdade se a base remota fosse obrigatoria.
 *
 * Quem escolhe e `armazem.ts`, pela presenca das variaveis de ambiente.
 */
export type Armazem = {
  /** Com que identidade se esta a trabalhar. `null` no armazem local. */
  readonly remoto: boolean

  // --- projetos -------------------------------------------------------------
  listarProjetos: () => Promise<Projeto[]>
  /** A lista do ecra de projetos: cada projeto com quantas rotas tem. */
  listarResumos: () => Promise<ResumoProjeto[]>
  criarProjeto: (dados: { nome: string; cliente?: string; local?: string }) => Promise<Projeto>
  renomearProjeto: (
    id: string,
    alteracao: Partial<Pick<Projeto, 'nome' | 'cliente' | 'local'>>,
  ) => Promise<void>
  apagarProjeto: (id: string) => Promise<void>
  duplicarProjeto: (id: string) => Promise<Projeto>
  lerProjetoComRotas: (id: string) => Promise<ProjetoComRotas | null>
  /** Grava um projeto inteiro vindo de um ficheiro JSON, com as suas rotas. */
  gravarProjetoImportado: (conteudo: ProjetoComRotas) => Promise<Projeto>

  // --- rotas ----------------------------------------------------------------
  listarRotas: (projetoId: string) => Promise<Rota[]>
  lerRota: (id: string) => Promise<Rota | undefined>
  criarRota: (dados: {
    nome: string
    projetoId: string
    droneId: string
    pontoDescolagem: Rota['pontoDescolagem']
  }) => Promise<Rota>
  gravarRota: (rota: Rota) => Promise<void>
  renomearRota: (id: string, nome: string) => Promise<void>
  duplicarRota: (id: string) => Promise<Rota>
  apagarRota: (id: string) => Promise<void>
  /** Grava os voos de uma divisao por bateria como rotas do mesmo projeto. */
  gravarTrocos: (trocos: readonly Rota[]) => Promise<Rota[]>
}

export type ResumoProjeto = { projeto: Projeto; rotas: number }

export type ProjetoComRotas = { projeto: Projeto; rotas: Rota[] }
