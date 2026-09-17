import { armazemLocal } from './armazem-local.ts'
import { armazemRemoto } from './armazem-remoto.ts'
import { supabase } from './supabase.ts'
import type { Armazem } from './tipos-armazem.ts'

/**
 * O armazem em uso.
 *
 * Escolhido uma vez, pela presenca das variaveis do Supabase, e nao muda
 * enquanto a aplicacao estiver aberta. Toda a gente le daqui: ninguem importa
 * `bd.ts` nem `armazem-remoto.ts` directamente.
 */
export const armazem: Armazem = supabase ? armazemRemoto(supabase) : armazemLocal

export type { Armazem, ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
