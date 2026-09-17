import type { Projeto, Rota } from '../nucleo/tipos.ts'

/**
 * Traducao entre as linhas da base e os tipos da aplicacao.
 *
 * Vive a parte do resto do armazem remoto porque e a unica parte que se pode
 * verificar sem rede nenhuma - e e onde os enganos passam despercebidos: trocar
 * `criado_em` por `criadoEm` nao rebenta nada, so faz a lista aparecer pela
 * ordem errada.
 *
 * O conteudo vai em `jsonb` e as colunas so levam o que a base precisa para
 * ordenar, contar e ligar. Isso quer dizer que os mesmos valores existem nos
 * dois sitios, e que quem escreve tem de os por de acordo - e o que estas
 * funcoes garantem, ao serem o unico caminho.
 */

export type LinhaProjeto = {
  id: string
  criado_em: number
  conteudo: unknown
}

export type LinhaRota = {
  id: string
  projeto_id: string
  alterada_em: number
  conteudo: unknown
}

export class LinhaInvalida extends Error {}

function objecto(conteudo: unknown, onde: string): Record<string, unknown> {
  if (typeof conteudo !== 'object' || conteudo === null || Array.isArray(conteudo)) {
    throw new LinhaInvalida(`o conteudo de ${onde} nao e um objecto`)
  }
  return conteudo as Record<string, unknown>
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function deLinhaProjeto(linha: LinhaProjeto): Projeto {
  const conteudo = objecto(linha.conteudo, `projeto ${linha.id}`)
  return {
    id: linha.id,
    nome: texto(conteudo['nome']),
    cliente: texto(conteudo['cliente']),
    local: texto(conteudo['local']),
    criadoEm: linha.criado_em,
  }
}

export function paraLinhaProjeto(projeto: Projeto): LinhaProjeto {
  const { id, criadoEm, ...conteudo } = projeto
  return { id, criado_em: criadoEm, conteudo }
}

export function deLinhaRota(linha: LinhaRota): Rota {
  const conteudo = objecto(linha.conteudo, `rota ${linha.id}`)
  /*
   * As colunas mandam sobre o que esta no conteudo.
   *
   * Sao elas que a base indexa e por onde a consulta filtrou; se as duas
   * discordarem, a que trouxe a linha ate aqui e a coluna. O contrario deixava
   * passar uma rota que aparece num projeto e diz pertencer a outro.
   */
  return {
    ...(conteudo as unknown as Rota),
    id: linha.id,
    projetoId: linha.projeto_id,
    alteradaEm: linha.alterada_em,
  }
}

export function paraLinhaRota(rota: Rota): LinhaRota {
  return {
    id: rota.id,
    projeto_id: rota.projetoId,
    alterada_em: rota.alteradaEm,
    conteudo: rota,
  }
}
