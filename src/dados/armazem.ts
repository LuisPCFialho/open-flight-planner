import { armazemFirestore } from './armazem-firestore.ts'
import { armazemLocal } from './armazem-local.ts'
import { autenticacao, firestore } from './firebase.ts'
import type { Armazem } from './tipos-armazem.ts'

/**
 * O armazem em uso.
 *
 * Escolhido uma vez, pela presenca das variaveis de ambiente, e nao muda
 * enquanto a aplicacao estiver aberta. Toda a gente le daqui: ninguem importa
 * `bd.ts` nem `armazem-firestore.ts` directamente.
 */
export const armazem: Armazem =
  firestore && autenticacao ? armazemFirestore(firestore, autenticacao) : armazemLocal

export type { Armazem, ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
