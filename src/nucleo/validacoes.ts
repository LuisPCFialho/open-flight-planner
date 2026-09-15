import type { Drone, LatLon, Rota } from './tipos.ts'
import { distancia, paraASL } from './geodesia.ts'
import { calcularEstatisticas, formatarDuracao } from './estatisticas.ts'
import { accoesNaoSuportadas, NOME_DA_ACCAO } from './operacoes-accoes.ts'
import { interpolarAltura, percursoDosWaypoints } from './perfil.ts'
import { waypointsComPOIPerdido } from './operacoes-poi.ts'

/**
 * Validacoes que correm antes de exportar.
 *
 * Erros bloqueiam a exportacao, avisos nao. A regra para decidir qual e qual e
 * simples: bloqueia o que faz a rota nao voar ou voar contra o solo; avisa o que
 * e questao de criterio de quem planeia.
 */

export type Severidade = 'erro' | 'aviso'

export type Validacao = {
  id: string
  severidade: Severidade
  titulo: string
  detalhe: string
  /** Indices dos waypoints em causa, para se poder saltar para eles. */
  waypoints?: number[]
}

/** Intervalo seguro acima do solo, em metros. */
export const AGL_MINIMO = 30
export const AGL_MAXIMO = 120

/** Passo de amostragem na deteccao de colisao entre waypoints. */
export const PASSO_COLISAO = 10

/** Afastamento ao ponto de descolagem a partir do qual se avisa, em metros. */
export const DISTANCIA_AVISO = 500

/** Fracao da autonomia que se considera prudente nao ultrapassar. */
export const MARGEM_AUTONOMIA = 0.7

export type ContextoValidacao = {
  cotas: ReadonlyMap<string, number>
  chave: (ponto: LatLon) => string
  /**
   * Perfil do terreno ao longo da rota, amostrado de `PASSO_COLISAO` em
   * `PASSO_COLISAO` metros pela mesma funcao que o grafico usa. Sem isto a
   * colisao entre waypoints nao e verificada e fica um aviso a dizer porque.
   */
  perfil?: { pontos: readonly LatLon[]; cotas: readonly number[] }
  /** Se esta rota e de registo fotografico, caso em que se espera foto em cada ponto. */
  registoFotografico?: boolean
}

export function validarRota(rota: Rota, drone: Drone, contexto: ContextoValidacao): Validacao[] {
  return [
    ...validarAlturaAcimaDoSolo(rota, contexto),
    ...validarColisaoNosTrocos(rota, contexto),
    ...validarAfastamento(rota),
    ...validarAutonomia(rota, drone),
    ...validarAccoes(rota, drone),
    ...validarFotos(rota, contexto),
    ...validarPOIs(rota),
    ...validarCotasEmFalta(rota, contexto),
  ]
}

export function temErros(validacoes: readonly Validacao[]): boolean {
  return validacoes.some((v) => v.severidade === 'erro')
}

// --- altura acima do solo ----------------------------------------------------

function alturaASL(rota: Rota, ponto: { lat: number; lon: number; altura: number }, cota: number): number {
  return paraASL(ponto.altura, rota.modoAltitude, {
    cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
    cotaTerreno: cota,
  })
}

function validarAlturaAcimaDoSolo(rota: Rota, contexto: ContextoValidacao): Validacao[] {
  const baixos: { indice: number; agl: number }[] = []
  const altos: { indice: number; agl: number }[] = []

  for (const waypoint of rota.waypoints) {
    const cota = contexto.cotas.get(contexto.chave(waypoint))
    if (cota === undefined) continue
    const agl = alturaASL(rota, waypoint, cota) - cota
    if (agl < AGL_MINIMO) baixos.push({ indice: waypoint.index, agl })
    else if (agl > AGL_MAXIMO) altos.push({ indice: waypoint.index, agl })
  }

  const validacoes: Validacao[] = []

  if (baixos.length > 0) {
    const pior = baixos.reduce((a, b) => (a.agl < b.agl ? a : b))
    validacoes.push({
      id: 'agl-baixo',
      severidade: 'erro',
      titulo: `${baixos.length} waypoint${baixos.length === 1 ? '' : 's'} abaixo de ${AGL_MINIMO} m do solo`,
      detalhe: `O mais baixo e o ${pior.indice + 1}, a ${pior.agl.toFixed(0)} m acima do terreno.`,
      waypoints: baixos.map((b) => b.indice),
    })
  }

  if (altos.length > 0) {
    const pior = altos.reduce((a, b) => (a.agl > b.agl ? a : b))
    validacoes.push({
      id: 'agl-alto',
      severidade: 'erro',
      titulo: `${altos.length} waypoint${altos.length === 1 ? '' : 's'} acima de ${AGL_MAXIMO} m do solo`,
      detalhe: `O mais alto e o ${pior.indice + 1}, a ${pior.agl.toFixed(0)} m acima do terreno. ${AGL_MAXIMO} m e o limite regulamentar.`,
      waypoints: altos.map((a) => a.indice),
    })
  }

  return validacoes
}

// --- colisao entre waypoints -------------------------------------------------

/**
 * A altura de voo entre dois waypoints varia linearmente com a distancia, mas o
 * terreno nao. Um troco que passe por cima de um cabeco pode ir contra ele mesmo
 * com os dois waypoints folgados, e e por isso que nao chega validar os pontos.
 */
function validarColisaoNosTrocos(rota: Rota, contexto: ContextoValidacao): Validacao[] {
  if (!contexto.perfil || rota.waypoints.length < 2) return []

  const { pontos, cotas } = contexto.perfil
  if (pontos.length !== cotas.length || pontos.length === 0) return []

  const percursoWaypoints = percursoDosWaypoints(rota)

  const aslWaypoints = rota.waypoints.map((w) => {
    const cota = contexto.cotas.get(contexto.chave(w))
    return cota === undefined ? null : alturaASL(rota, w, cota)
  })
  if (aslWaypoints.some((a) => a === null)) return []

  let acumulado = 0
  let pior: { distancia: number; folga: number } | null = null

  for (let i = 0; i < pontos.length; i++) {
    if (i > 0) {
      const anterior = pontos[i - 1]
      const actual = pontos[i]
      if (anterior && actual) acumulado += distancia(anterior, actual)
    }

    const aslVoo = interpolarAltura(percursoWaypoints, aslWaypoints as number[], acumulado)
    const cotaTerreno = cotas[i]
    if (aslVoo === null || cotaTerreno === undefined) continue

    const folga = aslVoo - cotaTerreno
    if (folga < AGL_MINIMO && (!pior || folga < pior.folga)) {
      pior = { distancia: acumulado, folga }
    }
  }

  if (!pior) return []

  return [
    {
      id: 'colisao-troco',
      severidade: 'erro',
      titulo:
        pior.folga < 0
          ? 'A rota passa por baixo do terreno entre waypoints'
          : `A rota passa a menos de ${AGL_MINIMO} m do solo entre waypoints`,
      detalhe: `Folga minima de ${pior.folga.toFixed(0)} m aos ${pior.distancia.toFixed(0)} m de percurso. Os waypoints podem estar folgados e o troco entre eles nao.`,
    },
  ]
}

// --- afastamento, autonomia, accoes -----------------------------------------

function validarAfastamento(rota: Rota): Validacao[] {
  if (rota.waypoints.length === 0) return []

  let maxima = 0
  let indice = 0
  for (const waypoint of rota.waypoints) {
    const d = distancia(rota.pontoDescolagem, waypoint)
    if (d > maxima) {
      maxima = d
      indice = waypoint.index
    }
  }

  if (maxima <= DISTANCIA_AVISO) return []
  return [
    {
      id: 'afastamento',
      severidade: 'aviso',
      titulo: `A rota afasta-se ${maxima.toFixed(0)} m do ponto de descolagem`,
      detalhe: `O waypoint ${indice + 1} e o mais distante. Acima de ${DISTANCIA_AVISO} m ja e dificil manter o aparelho a vista.`,
      waypoints: [indice],
    },
  ]
}

function validarAutonomia(rota: Rota, drone: Drone): Validacao[] {
  const autonomia = drone.autonomiaMinutos
  if (autonomia === undefined) {
    if (rota.waypoints.length === 0) return []
    return [
      {
        id: 'autonomia-desconhecida',
        severidade: 'aviso',
        titulo: 'Autonomia do drone por confirmar',
        detalhe: `A duracao da rota nao foi comparada com nada porque a autonomia do ${drone.nome} ainda nao foi preenchida.`,
      },
    ]
  }

  const { duracao } = calcularEstatisticas(rota)
  const limite = autonomia * 60 * MARGEM_AUTONOMIA
  if (duracao <= limite) return []

  return [
    {
      id: 'autonomia',
      severidade: 'erro',
      titulo: 'A rota nao cabe na autonomia',
      detalhe: `Estimam-se ${formatarDuracao(duracao)} de voo, e a margem prudente para o ${drone.nome} sao ${formatarDuracao(limite)}, ou seja ${Math.round(MARGEM_AUTONOMIA * 100)}% de ${autonomia} minutos.`,
    },
  ]
}

function validarAccoes(rota: Rota, drone: Drone): Validacao[] {
  const problemas = accoesNaoSuportadas(rota, drone)
  if (problemas.length === 0) return []

  const tipos = [...new Set(problemas.map((p) => NOME_DA_ACCAO[p.tipo]))]
  return [
    {
      id: 'accoes-nao-suportadas',
      severidade: 'erro',
      titulo: `O ${drone.nome} nao suporta ${tipos.join(', ')}`,
      detalhe: `Afecta ${problemas.length} accao${problemas.length === 1 ? '' : 'es'}. Troca de drone ou remove as accoes.`,
      waypoints: [...new Set(problemas.map((p) => p.indiceWaypoint))],
    },
  ]
}

function validarFotos(rota: Rota, contexto: ContextoValidacao): Validacao[] {
  if (!contexto.registoFotografico || rota.waypoints.length === 0) return []

  const semFoto = rota.waypoints.filter((w) => !w.acoes.some((a) => a.tipo === 'tirarFoto'))
  if (semFoto.length === 0) return []

  return [
    {
      id: 'sem-foto',
      severidade: 'aviso',
      titulo: `${semFoto.length} waypoint${semFoto.length === 1 ? '' : 's'} sem accao de foto`,
      detalhe: 'Numa rota de registo fotografico cada ponto costuma ter a sua foto.',
      waypoints: semFoto.map((w) => w.index),
    },
  ]
}

function validarPOIs(rota: Rota): Validacao[] {
  const perdidos = waypointsComPOIPerdido(rota)
  if (perdidos.length === 0) return []

  return [
    {
      id: 'poi-perdido',
      severidade: 'erro',
      titulo: `${perdidos.length} waypoint${perdidos.length === 1 ? '' : 's'} a apontar a um POI que nao existe`,
      detalhe: 'O ficheiro sairia com um ponto de interesse invalido.',
      waypoints: perdidos,
    },
  ]
}

function validarCotasEmFalta(rota: Rota, contexto: ContextoValidacao): Validacao[] {
  const emFalta = rota.waypoints.filter((w) => !contexto.cotas.has(contexto.chave(w)))
  if (emFalta.length === 0) return []

  return [
    {
      id: 'cotas-em-falta',
      severidade: 'erro',
      titulo: `Falta a cota do terreno de ${emFalta.length} waypoint${emFalta.length === 1 ? '' : 's'}`,
      detalhe:
        'Sem essas cotas nao e possivel saber a que altura do solo a rota passa, nem converter alturas com seguranca.',
      waypoints: emFalta.map((w) => w.index),
    },
  ]
}
