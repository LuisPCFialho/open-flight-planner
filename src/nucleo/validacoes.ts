import type { Drone, LatLon, Rota } from './tipos.ts'
import { distancia, paraASL } from './geodesia.ts'
import { duracaoDoVooCompleto, formatarDuracao } from './estatisticas.ts'
import { accoesNaoSuportadas, NOME_DA_ACCAO } from './operacoes-accoes.ts'
import { velocidadeDe } from './operacoes-rota.ts'
import { interpolarAltura, percursoDosWaypoints } from './perfil.ts'
import { waypointsComPOIPerdido } from './operacoes-poi.ts'
import { incursoes, zonasInterditas } from './interdicoes.ts'
import { quadrante, temVento, trocosComVento } from './vento.ts'

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

/**
 * Limites de altura acima do solo, em metros.
 *
 * O minimo e o valor de partida de uma rota nova: cada rota leva o seu em
 * `alturaMinimaAcimaDoSolo`, porque a inspeccao de paineis voa mais baixo do
 * que o registo de obra. O maximo nao e configuravel: e regulamentar.
 */
export const AGL_MINIMO_PREDEFINIDO = 30
export const AGL_MAXIMO = 120

/** Altura minima aceite nesta rota. */
export function aglMinimoDe(rota: Rota): number {
  return rota.alturaMinimaAcimaDoSolo
}

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
    ...validarVelocidades(rota, drone),
    ...validarTectoDoAparelho(rota, drone, contexto),
    ...validarAfastamento(rota),
    ...validarAutonomia(rota, drone),
    ...validarAccoes(rota, drone),
    ...validarFotos(rota, contexto),
    ...validarPOIs(rota),
    ...validarCotasEmFalta(rota, contexto),
    ...validarZonasInterditas(rota),
    ...validarVento(rota, drone),
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

  const minimo = aglMinimoDe(rota)

  for (const waypoint of rota.waypoints) {
    const cota = contexto.cotas.get(contexto.chave(waypoint))
    if (cota === undefined) continue
    const agl = alturaASL(rota, waypoint, cota) - cota
    if (agl < minimo) baixos.push({ indice: waypoint.index, agl })
    else if (agl > AGL_MAXIMO) altos.push({ indice: waypoint.index, agl })
  }

  const validacoes: Validacao[] = []

  if (baixos.length > 0) {
    const pior = baixos.reduce((a, b) => (a.agl < b.agl ? a : b))
    validacoes.push({
      id: 'agl-baixo',
      severidade: 'erro',
      titulo: `${baixos.length} waypoint${baixos.length === 1 ? '' : 's'} abaixo de ${minimo} m do solo`,
      detalhe: `O mais baixo é o ${pior.indice + 1}, a ${pior.agl.toFixed(0)} m acima do terreno.`,
      waypoints: baixos.map((b) => b.indice),
    })
  }

  if (altos.length > 0) {
    const pior = altos.reduce((a, b) => (a.agl > b.agl ? a : b))
    validacoes.push({
      id: 'agl-alto',
      severidade: 'erro',
      titulo: `${altos.length} waypoint${altos.length === 1 ? '' : 's'} acima de ${AGL_MAXIMO} m do solo`,
      detalhe: `O mais alto é o ${pior.indice + 1}, a ${pior.agl.toFixed(0)} m acima do terreno. ${AGL_MAXIMO} m é o limite regulamentar.`,
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
  if (rota.waypoints.length < 2) return []

  /*
   * Sem perfil nao ha como verificar o que se passa entre waypoints, e calar-se
   * seria dar a rota por boa. Os waypoints podem estar todos folgados e o troco
   * entre dois deles ir contra um cabeco, que e precisamente o caso que esta
   * verificacao existe para apanhar. Fica aviso e nao erro porque e uma janela
   * passageira: o perfil chega assim que o motor de terreno responde.
   */
  if (!contexto.perfil) {
    return [
      {
        id: 'colisao-por-verificar',
        severidade: 'aviso',
        titulo: 'A folga entre waypoints ainda não foi verificada',
        detalhe:
          'Falta o perfil do terreno ao longo do percurso. Os waypoints podem estar folgados e um troço entre eles passar dentro do terreno.',
      },
    ]
  }

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
    if (folga < aglMinimoDe(rota) && (!pior || folga < pior.folga)) {
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
          : `A rota passa a menos de ${aglMinimoDe(rota)} m do solo entre waypoints`,
      detalhe: `Folga mínima de ${pior.folga.toFixed(0)} m aos ${pior.distancia.toFixed(0)} m de percurso. Os waypoints podem estar folgados e o troço entre eles não.`,
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
      detalhe: `O waypoint ${indice + 1} é o mais distante. Acima de ${DISTANCIA_AVISO} m já é difícil manter o aparelho à vista.`,
      waypoints: [indice],
    },
  ]
}

/**
 * Velocidades fora do que e voavel.
 *
 * Uma velocidade nula ou negativa nao e so absurda: a duracao estimada deixa de
 * ter valor e o dialeto Pilot 2, que escreve a duracao dentro do ficheiro,
 * recusa-se a gerar. Vale a pena dize-lo aqui, pelo nome, e nao deixar a
 * exportacao rebentar com uma mensagem sobre XML.
 */
function validarVelocidades(rota: Rota, drone: Drone): Validacao[] {
  const validacoes: Validacao[] = []

  if (!(rota.velocidadeGlobal > 0)) {
    validacoes.push({
      id: 'velocidade-global-invalida',
      severidade: 'erro',
      titulo: 'A velocidade global da rota não é voável',
      detalhe: `Está a ${rota.velocidadeGlobal} m/s. Tem de ser maior do que zero.`,
    })
  }

  const parados = rota.waypoints.filter((w) => w.velocidade !== undefined && !(w.velocidade > 0))
  if (parados.length > 0) {
    validacoes.push({
      id: 'velocidade-waypoint-invalida',
      severidade: 'erro',
      titulo: `${parados.length} waypoint${parados.length === 1 ? '' : 's'} com velocidade não voável`,
      detalhe: 'A velocidade própria de um waypoint tem de ser maior do que zero.',
      waypoints: parados.map((w) => w.index),
    })
  }

  const maxima = drone.velocidadeMaxWaypoint
  if (maxima !== undefined) {
    const rapidos = rota.waypoints.filter((w) => velocidadeDe(rota, w) > maxima)
    if (rapidos.length > 0 || rota.velocidadeGlobal > maxima) {
      validacoes.push({
        id: 'velocidade-acima-do-maximo',
        severidade: 'erro',
        titulo: `Velocidade acima dos ${maxima} m/s do ${drone.nome}`,
        detalhe:
          rapidos.length > 0
            ? `Afeta ${rapidos.length} waypoint${rapidos.length === 1 ? '' : 's'}.`
            : 'A velocidade global da rota está acima do máximo do aparelho.',
        ...(rapidos.length > 0 ? { waypoints: rapidos.map((w) => w.index) } : {}),
      })
    }
  }

  return validacoes
}

/**
 * Tecto de servico do aparelho, contado acima do nivel do mar.
 *
 * Numa central portuguesa este limite nunca aperta: o terreno anda pelos 400 m e
 * voa-se a 60 do solo. O que ele apanha e o engano de um digito - 4600 em vez de
 * 460 - ou uma rota importada com o modo de altitude trocado, que de outra forma
 * so se descobria no aparelho a recusar voar.
 */
function validarTectoDoAparelho(
  rota: Rota,
  drone: Drone,
  contexto: ContextoValidacao,
): Validacao[] {
  const tecto = drone.alturaMaxima
  if (tecto === undefined) return []

  const acima: { indice: number; asl: number }[] = []
  for (const waypoint of rota.waypoints) {
    const cota = contexto.cotas.get(contexto.chave(waypoint))
    if (cota === undefined) continue
    const asl = alturaASL(rota, waypoint, cota)
    if (asl > tecto) acima.push({ indice: waypoint.index, asl })
  }

  if (acima.length === 0) return []

  const pior = acima.reduce((a, b) => (a.asl > b.asl ? a : b))
  return [
    {
      id: 'acima-do-tecto',
      severidade: 'erro',
      titulo: `${acima.length} waypoint${acima.length === 1 ? '' : 's'} acima do tecto do ${drone.nome}`,
      detalhe: `O mais alto é o ${pior.indice + 1}, a ${pior.asl.toFixed(0)} m acima do nível do mar. O tecto do aparelho é ${tecto} m.`,
      waypoints: acima.map((a) => a.indice),
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
        detalhe: `A duração da rota não foi comparada com nada porque a autonomia do ${drone.nome} ainda não foi preenchida.`,
      },
    ]
  }

  // O voo completo, com a ida ao primeiro ponto e o regresso: e o que a bateria
  // tem de dar, e nao apenas o percurso entre waypoints que a barra mostra.
  const duracao = duracaoDoVooCompleto(rota, drone.velocidadeMaxWaypoint)
  const limite = autonomia * 60 * MARGEM_AUTONOMIA
  if (duracao <= limite) return []

  return [
    {
      id: 'autonomia',
      severidade: 'erro',
      titulo: 'A rota não cabe na autonomia',
      detalhe: `Estimam-se ${formatarDuracao(duracao)} de voo, contando a ida ao primeiro ponto e o regresso, e a margem prudente para o ${drone.nome} são ${formatarDuracao(limite)}, ou seja ${Math.round(MARGEM_AUTONOMIA * 100)}% de ${autonomia} minutos.`,
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
      titulo: `O ${drone.nome} não suporta ${tipos.join(', ')}`,
      detalhe: `Afeta ${problemas.length} ação${problemas.length === 1 ? '' : 'ões'}. Troca de drone ou remove as ações.`,
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
      titulo: `${semFoto.length} waypoint${semFoto.length === 1 ? '' : 's'} sem ação de foto`,
      detalhe: 'Numa rota de registo fotográfico cada ponto costuma ter a sua foto.',
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
      titulo: `${perdidos.length} waypoint${perdidos.length === 1 ? '' : 's'} a apontar a um POI que não existe`,
      detalhe: 'O ficheiro sairia com um ponto de interesse inválido.',
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
        'Sem essas cotas não é possível saber a que altura do solo a rota passa, nem converter alturas com segurança.',
      waypoints: emFalta.map((w) => w.index),
    },
  ]
}

// --- zonas interditas --------------------------------------------------------

/**
 * A rota a passar por onde nao pode.
 *
 * E erro e nao aviso: quem marcou a zona sabia porque a marcou, e sobrevoar o
 * posto de transformacao do cliente ou a parcela do vizinho que nao autorizou
 * nao e uma questao de grau.
 *
 * A verificacao apanha o troco inteiro e nao so os waypoints. Numa cobertura,
 * as transicoes entre passagens sao os trocos mais compridos da rota, e sao
 * precisamente os que atravessam uma zona de lado a lado sem que nenhuma ponta
 * caia la dentro.
 */
function validarZonasInterditas(rota: Rota): Validacao[] {
  const zonas = zonasInterditas(rota.areas)
  if (zonas.length === 0) return []

  const encontradas = incursoes(rota.waypoints, zonas)
  if (encontradas.length === 0) return []

  const nomes = [...new Set(encontradas.map((i) => i.nomeDaZona))]
  const indices = [...new Set(encontradas.map((i) => i.indice))].sort((a, b) => a - b)

  return [
    {
      id: 'zona-interdita',
      severidade: 'erro',
      titulo: `A rota entra em ${nomes.length === 1 ? 'zona interdita' : `${nomes.length} zonas interditas`}`,
      detalhe: `${indices.length} ${indices.length === 1 ? 'troço passa' : 'troços passam'} por ${nomes.join(', ')}.`,
      waypoints: indices,
    },
  ]
}

// --- vento -------------------------------------------------------------------

/**
 * O que o vento escrito a mao faz a esta rota.
 *
 * So avisa; nunca bloqueia. Quem decide se sai com vento e quem esta no campo a
 * olhar para o ceu, e nao um numero que alguem escreveu na vespera. O que a
 * ferramenta pode dizer e mais util do que uma proibicao: **quais** os trocos em
 * que a aeronave nao consegue manter a velocidade que se lhe pediu, e por isso
 * quais os que vao demorar mais do que a estimativa diz.
 *
 * O caso grave e proprio: travessia maior do que a velocidade que a aeronave faz
 * no ar nao e um troco lento, e um troco que ela nao segue. Vai a deriva.
 */
function validarVento(rota: Rota, drone: Drone): Validacao[] {
  if (!temVento(rota.vento)) return []

  const maximo = drone.velocidadeMaxWaypoint
  if (maximo === undefined) {
    return [
      {
        id: 'vento-sem-maximo',
        severidade: 'aviso',
        titulo: 'Vento sem nada com que o comparar',
        detalhe: `Foram apontados ${rota.vento.velocidade} m/s de ${quadrante(rota.vento.rumo)}, mas a velocidade máxima em missão do ${drone.nome} ainda não foi preenchida e sem ela não há como saber se a aeronave aguenta o rumo.`,
      },
    ]
  }

  const trocos = trocosComVento(
    rota.waypoints,
    (i) => velocidadeDe(rota, rota.waypoints[i]!),
    rota.vento,
    maximo,
  )

  const aDeriva = trocos.filter((t) => t.conseguida === null)
  const lentos = trocos.filter((t) => t.conseguida !== null && t.conseguida < t.pedida - 0.05)

  const validacoes: Validacao[] = []

  if (aDeriva.length > 0) {
    validacoes.push({
      id: 'vento-deriva',
      severidade: 'erro',
      titulo: 'Com este vento há rumos que a aeronave não segura',
      detalhe: `Em ${aDeriva.length} ${aDeriva.length === 1 ? 'troço' : 'troços'} o vento de través passa os ${maximo} m/s que o ${drone.nome} faz em missão: a aeronave não consegue manter a linha, é arrastada para fora dela. Com ${rota.vento.velocidade} m/s de ${quadrante(rota.vento.rumo)} esta rota não é para voar.`,
      waypoints: aDeriva.map((t) => rota.waypoints[t.indice]?.index ?? t.indice),
    })
  }

  if (lentos.length > 0) {
    const pior = lentos.reduce((a, b) => (a.conseguida! < b.conseguida! ? a : b))
    validacoes.push({
      id: 'vento-lento',
      severidade: 'aviso',
      titulo: 'O vento não deixa manter a velocidade em alguns troços',
      detalhe: `${lentos.length} ${lentos.length === 1 ? 'troço vai' : 'troços vão'} mais devagar do que o que se pediu, porque manter essa velocidade contra ${rota.vento.velocidade} m/s de ${quadrante(rota.vento.rumo)} exigiria mais do que os ${maximo} m/s que o ${drone.nome} faz em missão. No pior deles a aeronave faz ${pior.conseguida!.toFixed(1)} m/s em vez de ${pior.pedida.toFixed(1)}. A duração estimada já conta com isto.`,
      waypoints: lentos.map((t) => rota.waypoints[t.indice]?.index ?? t.indice),
    })
  }

  return validacoes
}
