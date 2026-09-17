import { describe, it, expect } from 'vitest'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import {
  deDocumentoProjeto,
  deDocumentoRota,
  DocumentoInvalido,
  paraDocumentoProjeto,
  paraDocumentoRota,
} from './linhas.ts'

/**
 * A traducao entre os documentos do Firestore e os tipos da aplicacao.
 *
 * O que aqui se verifica nao e a base: e a fronteira. Trocar `criadoEm` por
 * `criado_em` nao rebenta nada - so faz a lista aparecer pela ordem errada, e
 * quem a ve nao tem como saber porque.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function projeto(): Projeto {
  return { id: 'p1', nome: 'Sever do Vouga', cliente: 'PowerYield', local: 'Aveiro', criadoEm: 1700 }
}

function rota(): Rota {
  const base = rotaVazia({
    nome: 'campanha 1',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  return acrescentarWaypoint(
    base,
    waypointNovo({ lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon, altura: 60, index: 0 }),
  )
}

describe('documentos de projeto', () => {
  it('ida e volta nao perde nada', () => {
    const original = projeto()
    expect(deDocumentoProjeto(original.id, paraDocumentoProjeto(original))).toEqual(original)
  })

  /*
   * O identificador e o caminho do documento, nao um campo dentro dele. Guardar
   * as duas coisas era deixar-lhes espaco para discordarem.
   */
  it('a data fica em campo proprio, e o identificador nao fica no conteudo', () => {
    const documento = paraDocumentoProjeto(projeto())
    expect(documento.criadoEm).toBe(1700)

    const conteudo = JSON.parse(documento.conteudo) as Record<string, unknown>
    expect(conteudo).not.toHaveProperty('id')
    expect(conteudo).not.toHaveProperty('criadoEm')
  })

  it('um projeto sem cliente nem local le-se com os campos vazios', () => {
    const lido = deDocumentoProjeto('p9', {
      criadoEm: 1,
      conteudo: JSON.stringify({ nome: 'so nome' }),
    })
    expect(lido).toEqual({ id: 'p9', nome: 'so nome', cliente: '', local: '', criadoEm: 1 })
  })

  it('um conteudo que nao se le e recusado com a razao', () => {
    expect(() => deDocumentoProjeto('p1', { criadoEm: 1, conteudo: 'nao e json' })).toThrow(
      DocumentoInvalido,
    )
    expect(() => deDocumentoProjeto('p1', { criadoEm: 1, conteudo: '[]' })).toThrow(
      DocumentoInvalido,
    )
    expect(() =>
      deDocumentoProjeto('p1', { criadoEm: 1, conteudo: 7 as unknown as string }),
    ).toThrow(DocumentoInvalido)
  })
})

describe('documentos de rota', () => {
  it('ida e volta nao perde os waypoints', () => {
    const original = rota()
    const lida = deDocumentoRota(original.id, paraDocumentoRota(original))
    expect(lida).toEqual(original)
    expect(lida.waypoints).toHaveLength(1)
  })

  it('o projeto e a data de alteracao ficam em campo proprio, para se poder filtrar', () => {
    const documento = paraDocumentoRota(rota())
    expect(documento.projetoId).toBe('p1')
    expect(typeof documento.alteradaEm).toBe('number')
  })

  /*
   * Foi o campo que trouxe a rota ate aqui: foi por ele que a consulta filtrou.
   * Deixar o conteudo ganhar era deixar passar uma rota que aparece num projeto
   * e diz pertencer a outro.
   */
  it('quando o campo e o conteudo discordam, manda o campo', () => {
    const original = rota()
    const lida = deDocumentoRota('r-do-caminho', {
      ...paraDocumentoRota(original),
      projetoId: 'p-do-campo',
      alteradaEm: 999,
    })

    expect(lida.id).toBe('r-do-caminho')
    expect(lida.projetoId).toBe('p-do-campo')
    expect(lida.alteradaEm).toBe(999)
  })

  /*
   * A razao de o conteudo ir como texto e nao como objecto: um waypoint tem
   * campos opcionais, e o Firestore recusa `undefined`. Em JSON, um campo
   * ausente e um campo ausente, e a rota volta como saiu.
   */
  it('campos opcionais ausentes sobrevivem a ida e volta', () => {
    const original = rota()
    const primeiro = original.waypoints[0]
    expect(primeiro?.velocidade).toBeUndefined()

    const lida = deDocumentoRota(original.id, paraDocumentoRota(original))
    expect(lida.waypoints[0]).not.toHaveProperty('velocidade')
  })

  it('um conteudo que nao se le e recusado com a razao', () => {
    expect(() =>
      deDocumentoRota('r1', { projetoId: 'p1', alteradaEm: 1, conteudo: '{' }),
    ).toThrow(DocumentoInvalido)
  })
})
