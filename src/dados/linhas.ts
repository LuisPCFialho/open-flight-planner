import type { Projeto, Rota } from '../nucleo/tipos.ts'

/**
 * Traducao entre os documentos do Firestore e os tipos da aplicacao.
 *
 * Vive a parte do resto do armazem remoto porque e a unica parte que se pode
 * verificar sem rede nenhuma - e e onde os enganos passam despercebidos: trocar
 * `criadoEm` por `criado_em` nao rebenta nada, so faz a lista aparecer pela
 * ordem errada, e quem a ve nao tem como saber porque.
 *
 * O conteudo vai como texto JSON e nao como objecto aninhado.
 *
 * O Firestore aceitaria o objecto, mas com tres condicoes que este formato nao
 * pode prometer: nada de arrays dentro de arrays, nada de `undefined`, e um
 * tecto de campos aninhados. Os waypoints tem campos opcionais - `velocidade`,
 * `guinada`, `poiId` - e um `undefined` faz a escrita atirar, ou, com
 * `ignoreUndefinedProperties`, desaparece em silencio. O formato da rota ainda
 * vai mudar muitas vezes; em texto, nenhuma dessas mudancas se torna um defeito
 * de gravacao. O que fica em campo proprio e so o que a base precisa para
 * ordenar e filtrar.
 */

export type DocumentoProjeto = {
  criadoEm: number
  conteudo: string
}

export type DocumentoRota = {
  projetoId: string
  alteradaEm: number
  conteudo: string
}

export class DocumentoInvalido extends Error {}

function lerJSON(conteudo: unknown, onde: string): Record<string, unknown> {
  if (typeof conteudo !== 'string') {
    throw new DocumentoInvalido(`o conteúdo de ${onde} não é texto`)
  }

  let lido: unknown
  try {
    lido = JSON.parse(conteudo)
  } catch {
    throw new DocumentoInvalido(`o conteúdo de ${onde} não é JSON válido`)
  }

  if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) {
    throw new DocumentoInvalido(`o conteúdo de ${onde} não é um objecto`)
  }
  return lido as Record<string, unknown>
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function deDocumentoProjeto(id: string, documento: DocumentoProjeto): Projeto {
  const conteudo = lerJSON(documento.conteudo, `projeto ${id}`)
  return {
    id,
    nome: texto(conteudo['nome']),
    cliente: texto(conteudo['cliente']),
    local: texto(conteudo['local']),
    criadoEm: documento.criadoEm,
  }
}

export function paraDocumentoProjeto(projeto: Projeto): DocumentoProjeto {
  const { id: _id, criadoEm, ...conteudo } = projeto
  return { criadoEm, conteudo: JSON.stringify(conteudo) }
}

export function deDocumentoRota(id: string, documento: DocumentoRota): Rota {
  const conteudo = lerJSON(documento.conteudo, `rota ${id}`)
  /*
   * Os campos proprios mandam sobre o que esta no conteudo.
   *
   * Foi por eles que a consulta filtrou e foi por eles que a rota chegou aqui;
   * se discordarem do conteudo, o que trouxe a linha e que conta. O contrario
   * deixava passar uma rota que aparece num projeto e diz pertencer a outro.
   */
  return {
    ...(conteudo as unknown as Rota),
    id,
    projetoId: documento.projetoId,
    alteradaEm: documento.alteradaEm,
  }
}

export function paraDocumentoRota(rota: Rota): DocumentoRota {
  return {
    projetoId: rota.projetoId,
    alteradaEm: rota.alteradaEm,
    conteudo: JSON.stringify(rota),
  }
}
