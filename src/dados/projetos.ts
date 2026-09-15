import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { bd } from './bd.ts'

/**
 * Operacoes sobre projetos inteiros: duplicar, renomear, apagar, e a troca em
 * JSON que serve para levar um projeto de um posto para outro.
 *
 * O ficheiro JSON e entrada externa e e validado campo a campo antes de entrar
 * na base de dados. Um projeto com uma rota mal formada nao rebenta a
 * aplicacao ao ser aberto: e recusado com a razao.
 */

export type ProjetoComRotas = { projeto: Projeto; rotas: Rota[] }

export const VERSAO_FICHEIRO = 1

export type FicheiroProjeto = {
  formato: 'pye-flight-planner'
  versao: number
  exportadoEm: number
  projeto: Projeto
  rotas: Rota[]
}

export async function lerProjetoComRotas(projetoId: string): Promise<ProjetoComRotas | null> {
  const projeto = await bd.projetos.get(projetoId)
  if (!projeto) return null
  const rotas = await bd.rotas.where('projetoId').equals(projetoId).toArray()
  return { projeto, rotas }
}

export async function contarRotas(projetoId: string): Promise<number> {
  return bd.rotas.where('projetoId').equals(projetoId).count()
}

export async function renomearProjeto(
  projetoId: string,
  alteracao: Partial<Pick<Projeto, 'nome' | 'cliente' | 'local'>>,
): Promise<void> {
  await bd.projetos.update(projetoId, alteracao)
}

/** Copia o projeto e todas as suas rotas, com identificadores novos. */
export async function duplicarProjeto(projetoId: string): Promise<Projeto> {
  const original = await lerProjetoComRotas(projetoId)
  if (!original) throw new Error('projeto nao encontrado')

  const copia: Projeto = {
    ...original.projeto,
    id: novoId(),
    nome: `${original.projeto.nome} (copia)`,
    criadoEm: Date.now(),
  }

  const rotas = original.rotas.map((rota) => copiarRota(rota, copia.id))

  await bd.transaction('rw', bd.projetos, bd.rotas, async () => {
    await bd.projetos.add(copia)
    if (rotas.length > 0) await bd.rotas.bulkAdd(rotas)
  })
  return copia
}

/**
 * Copia uma rota para outro projeto.
 *
 * Os identificadores sao todos novos, incluindo os dos POI, e as referencias dos
 * waypoints sao reapontadas. Copiar mantendo os ids antigos faria as duas rotas
 * partilhar POI e uma alteracao numa aparecer na outra.
 */
export function copiarRota(rota: Rota, projetoId: string, nome?: string): Rota {
  const mapaPOI = new Map(rota.pois.map((poi) => [poi.id, novoId()]))
  const agora = Date.now()

  return {
    ...rota,
    id: novoId(),
    projetoId,
    nome: nome ?? rota.nome,
    pois: rota.pois.map((poi) => ({ ...poi, id: mapaPOI.get(poi.id) ?? novoId() })),
    waypoints: rota.waypoints.map((waypoint) => {
      const novo = { ...waypoint, id: novoId() }
      if (waypoint.poiId) {
        const destino = mapaPOI.get(waypoint.poiId)
        if (destino) novo.poiId = destino
        else delete novo.poiId
      }
      return novo
    }),
    criadaEm: agora,
    alteradaEm: agora,
  }
}

// --- troca em JSON -----------------------------------------------------------

export function paraFicheiro(conteudo: ProjetoComRotas): FicheiroProjeto {
  return {
    formato: 'pye-flight-planner',
    versao: VERSAO_FICHEIRO,
    exportadoEm: Date.now(),
    projeto: conteudo.projeto,
    rotas: conteudo.rotas,
  }
}

export class FicheiroInvalido extends Error {}

/**
 * Valida e normaliza um ficheiro de projeto.
 *
 * Os identificadores sao regerados de proposito, para importar duas vezes o
 * mesmo ficheiro dar dois projetos e nao sobrescrever o primeiro.
 */
export function deFicheiro(bruto: unknown): ProjetoComRotas {
  if (typeof bruto !== 'object' || bruto === null) {
    throw new FicheiroInvalido('o ficheiro nao contem um objecto')
  }
  const dados = bruto as Partial<FicheiroProjeto>

  if (dados.formato !== 'pye-flight-planner') {
    throw new FicheiroInvalido('o ficheiro nao e um projeto do PYE Flight Planner')
  }
  if (typeof dados.versao !== 'number' || dados.versao > VERSAO_FICHEIRO) {
    throw new FicheiroInvalido(
      `o ficheiro e da versao ${String(dados.versao)} e esta aplicacao le ate a ${VERSAO_FICHEIRO}`,
    )
  }
  if (typeof dados.projeto !== 'object' || dados.projeto === null) {
    throw new FicheiroInvalido('o ficheiro nao traz projeto')
  }
  if (!Array.isArray(dados.rotas)) {
    throw new FicheiroInvalido('o ficheiro nao traz a lista de rotas')
  }

  const projetoBruto = dados.projeto as Partial<Projeto>
  if (typeof projetoBruto.nome !== 'string' || projetoBruto.nome.trim() === '') {
    throw new FicheiroInvalido('o projeto nao tem nome')
  }

  const projeto: Projeto = {
    id: novoId(),
    nome: projetoBruto.nome,
    cliente: typeof projetoBruto.cliente === 'string' ? projetoBruto.cliente : '',
    local: typeof projetoBruto.local === 'string' ? projetoBruto.local : '',
    criadoEm: typeof projetoBruto.criadoEm === 'number' ? projetoBruto.criadoEm : Date.now(),
  }

  const rotas = dados.rotas.map((rota, i) => validarRota(rota, i, projeto.id))
  return { projeto, rotas }
}

function validarRota(bruto: unknown, ordem: number, projetoId: string): Rota {
  if (typeof bruto !== 'object' || bruto === null) {
    throw new FicheiroInvalido(`a rota ${ordem + 1} nao e um objecto`)
  }
  const rota = bruto as Partial<Rota>

  if (typeof rota.nome !== 'string') throw new FicheiroInvalido(`a rota ${ordem + 1} nao tem nome`)
  if (!Array.isArray(rota.waypoints)) {
    throw new FicheiroInvalido(`a rota "${rota.nome}" nao tem lista de waypoints`)
  }
  const descolagem = rota.pontoDescolagem
  if (
    typeof descolagem !== 'object' ||
    descolagem === null ||
    !Number.isFinite(descolagem.lat) ||
    !Number.isFinite(descolagem.lon)
  ) {
    throw new FicheiroInvalido(`a rota "${rota.nome}" nao tem ponto de descolagem valido`)
  }

  for (const [i, waypoint] of rota.waypoints.entries()) {
    if (!Number.isFinite(waypoint?.lat) || !Number.isFinite(waypoint?.lon)) {
      throw new FicheiroInvalido(
        `o waypoint ${i + 1} da rota "${rota.nome}" nao tem coordenadas validas`,
      )
    }
    if (!Number.isFinite(waypoint?.altura)) {
      throw new FicheiroInvalido(`o waypoint ${i + 1} da rota "${rota.nome}" nao tem altura`)
    }
  }

  // Os valores em falta tomam o mesmo valor que uma rota nova teria.
  return copiarRota(
    {
      ...(rota as Rota),
      modoAltitude: rota.modoAltitude ?? 'AGL',
      velocidadeGlobal: Number.isFinite(rota.velocidadeGlobal) ? (rota.velocidadeGlobal as number) : 5,
      alturaSegurancaDescolagem: rota.alturaSegurancaDescolagem ?? 20,
      modoDescolagem: rota.modoDescolagem ?? 'subidaDireta',
      acaoFinal: rota.acaoFinal ?? 'goHome',
      acaoPerdaSinal: rota.acaoPerdaSinal ?? 'goBack',
      alturaRTH: rota.alturaRTH ?? 100,
      alturaMinimaAcimaDoSolo: rota.alturaMinimaAcimaDoSolo ?? 30,
      ondulacaoGeoide: Number.isFinite(rota.ondulacaoGeoide) ? (rota.ondulacaoGeoide as number) : 55.6,
      pois: Array.isArray(rota.pois) ? rota.pois : [],
      droneId: rota.droneId ?? 'mini5pro',
    },
    projetoId,
  )
}

export async function gravarProjetoImportado(conteudo: ProjetoComRotas): Promise<Projeto> {
  await bd.transaction('rw', bd.projetos, bd.rotas, async () => {
    await bd.projetos.add(conteudo.projeto)
    if (conteudo.rotas.length > 0) await bd.rotas.bulkAdd(conteudo.rotas)
  })
  return conteudo.projeto
}
