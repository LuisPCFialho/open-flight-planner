import { armazemLocal } from './armazem-local.ts'
import { ligarFirebase, remotoConfigurado, type FuncoesDeAutenticacao } from './firebase.ts'
import type { Armazem } from './tipos-armazem.ts'
import type { Auth } from 'firebase/auth'

/**
 * O armazem em uso.
 *
 * Escolhido uma vez, pela presenca das variaveis de ambiente, e nao muda
 * enquanto a aplicacao estiver aberta. Toda a gente le daqui: ninguem importa
 * `bd.ts` nem `armazem-firestore.ts` directamente.
 *
 * ## A espera no topo do modulo
 *
 * O `await` aqui fora de qualquer funcao e o que permite que tudo o resto da
 * aplicacao continue a escrever `armazem.listarRotas(...)` sem saber de nada
 * disto. Em troca, o modulo demora a resolver - e so demora quando ha armazem
 * remoto configurado, que e quando ha mesmo alguma coisa para ir buscar.
 *
 * Sem configuracao nenhuma - quem clonou o repositorio, e hoje tambem o sitio
 * publicado - o `ligarFirebase` devolve `null` sem pedir nada a rede, e isto
 * resolve-se no mesmo instante em que seria lido de qualquer maneira.
 */
const remoto = remotoConfigurado ? await ligarFirebase() : null

export const armazem: Armazem = remoto
  ? (await import('./armazem-firestore.ts')).armazemFirestore(remoto.firestore, remoto.autenticacao)
  : armazemLocal

/**
 * A autenticacao e as suas funcoes, para a sessao.
 *
 * Saem daqui e nao de `firebase/auth` porque um `import` estatico do SDK em
 * `sessao.ts` trazia-o de volta para o pedaco principal, e o proposito de tudo
 * isto era precisamente tira-lo de la.
 */
export const autenticacaoRemota: Auth | null = remoto?.autenticacao ?? null
export const funcoesDeAutenticacao: FuncoesDeAutenticacao | null = remoto?.funcoes ?? null

export type { Armazem, ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
