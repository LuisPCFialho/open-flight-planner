import type { Projeto, Rota, Vento } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { copiarRota } from '../nucleo/operacoes-rota.ts'
import { bd } from './bd.ts'

export { copiarRota }

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

/**
 * A marca que identifica o ficheiro como nosso.
 *
 * A ferramenta mudou de nome, e os ficheiros exportados antes trazem a marca
 * antiga. Escreve-se a nova e aceitam-se as duas a ler: recusar a antiga seria
 * recusar os projetos que alguem exportou ontem, por causa de uma palavra.
 */
export const MARCA_DO_FICHEIRO = 'open-flight-planner'
const MARCAS_ACEITES = [MARCA_DO_FICHEIRO, 'pye-flight-planner']

export type FicheiroProjeto = {
  formato: string
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
  if (!original) throw new Error('projeto não encontrado')

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

// --- troca em JSON -----------------------------------------------------------

export function paraFicheiro(conteudo: ProjetoComRotas): FicheiroProjeto {
  return {
    formato: MARCA_DO_FICHEIRO,
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
    throw new FicheiroInvalido('o ficheiro não contém um objecto')
  }
  const dados = bruto as Partial<FicheiroProjeto>

  if (typeof dados.formato !== 'string' || !MARCAS_ACEITES.includes(dados.formato)) {
    throw new FicheiroInvalido('o ficheiro não é um projeto do Open Flight Planner')
  }
  if (typeof dados.versao !== 'number' || dados.versao > VERSAO_FICHEIRO) {
    throw new FicheiroInvalido(
      `o ficheiro é da versão ${String(dados.versao)} e esta aplicação lê até à ${VERSAO_FICHEIRO}`,
    )
  }
  if (typeof dados.projeto !== 'object' || dados.projeto === null) {
    throw new FicheiroInvalido('o ficheiro não traz projeto')
  }
  if (!Array.isArray(dados.rotas)) {
    throw new FicheiroInvalido('o ficheiro não traz a lista de rotas')
  }

  const projetoBruto = dados.projeto as Partial<Projeto>
  if (typeof projetoBruto.nome !== 'string' || projetoBruto.nome.trim() === '') {
    throw new FicheiroInvalido('o projeto não tem nome')
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

/** Uma area sem contorno fechado nao se desenha, e entrar assim so daria erro depois. */
function areaValida(bruto: unknown): boolean {
  if (typeof bruto !== 'object' || bruto === null) return false
  const area = bruto as { contorno?: unknown }
  if (!Array.isArray(area.contorno) || area.contorno.length < 3) return false
  return area.contorno.every(
    (ponto: unknown) =>
      typeof ponto === 'object' &&
      ponto !== null &&
      Number.isFinite((ponto as { lat?: unknown }).lat) &&
      Number.isFinite((ponto as { lon?: unknown }).lon),
  )
}

/**
 * O vento de um ficheiro, ou nenhum.
 *
 * E o unico campo opcional da rota que entra directamente em aritmetica, e a
 * aritmetica com um numero que nao e numero ja custou caro a este projecto: um
 * `Math.hypot` com uma cadeia da NaN, o NaN alastra a duracao, e a barra passa a
 * mostrar "Infinity m NaN s". Um ficheiro vem de fora - de outro posto, de outra
 * versao, ou de alguem que o abriu num editor - e por isso verifica-se.
 *
 * Nao se corrige nem se adivinha: vento que nao se percebe e vento que nao ha,
 * e uma rota sem vento e exactamente o que a aplicacao fazia antes disto existir.
 */
function ventoValido(bruto: unknown): Vento | undefined {
  if (typeof bruto !== 'object' || bruto === null) return undefined
  const vento = bruto as Partial<Vento>
  if (!Number.isFinite(vento.velocidade) || !Number.isFinite(vento.rumo)) return undefined
  const velocidade = vento.velocidade as number
  if (velocidade < 0) return undefined
  return { velocidade, rumo: (((vento.rumo as number) % 360) + 360) % 360 }
}

function validarRota(bruto: unknown, ordem: number, projetoId: string): Rota {
  if (typeof bruto !== 'object' || bruto === null) {
    throw new FicheiroInvalido(`a rota ${ordem + 1} não é um objecto`)
  }
  const rota = bruto as Partial<Rota>

  if (typeof rota.nome !== 'string') throw new FicheiroInvalido(`a rota ${ordem + 1} não tem nome`)
  if (!Array.isArray(rota.waypoints)) {
    throw new FicheiroInvalido(`a rota "${rota.nome}" não tem lista de waypoints`)
  }
  const descolagem = rota.pontoDescolagem
  if (
    typeof descolagem !== 'object' ||
    descolagem === null ||
    !Number.isFinite(descolagem.lat) ||
    !Number.isFinite(descolagem.lon)
  ) {
    throw new FicheiroInvalido(`a rota "${rota.nome}" não tem ponto de descolagem válido`)
  }

  for (const [i, waypoint] of rota.waypoints.entries()) {
    if (!Number.isFinite(waypoint?.lat) || !Number.isFinite(waypoint?.lon)) {
      throw new FicheiroInvalido(
        `o waypoint ${i + 1} da rota "${rota.nome}" não tem coordenadas válidas`,
      )
    }
    if (!Number.isFinite(waypoint?.altura)) {
      throw new FicheiroInvalido(`o waypoint ${i + 1} da rota "${rota.nome}" não tem altura`)
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
      // As areas sao posteriores: um ficheiro antigo nao as traz.
      areas: Array.isArray(rota.areas) ? rota.areas.filter(areaValida) : [],
      modoCamaraTrajecto: rota.modoCamaraTrajecto ?? 'manter',
      droneId: rota.droneId ?? 'mini5pro',
      vento: ventoValido(rota.vento),
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
