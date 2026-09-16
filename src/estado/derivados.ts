import type { Rota } from '../nucleo/tipos.ts'
import { paraASL } from '../nucleo/geodesia.ts'
import { atitudeNoWaypoint } from '../nucleo/camara-trajecto.ts'
import { AGL_MAXIMO } from '../nucleo/validacoes.ts'
import { chaveDaPosicao } from './useCotasTerreno.ts'
import { FonteComposta } from '../terreno/fonte-dxf.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'
import type { LinhaWaypoint } from '../ui/ListaWaypoints.tsx'
import type { PontoRota3D } from '../mapa/camada-rota-3d.ts'

/**
 * O que a lista e o mapa mostram, a partir da rota e das cotas do terreno.
 *
 * Sao contas puras e vivem fora da aplicacao para poderem ser verificadas sem
 * montar interface nenhuma. O que se verifica aqui nao e o desenho - e quais
 * waypoints levam alerta, e onde e que o aparelho aparece.
 */

/**
 * Uma linha por waypoint, com a cota do terreno e o alerta de altura.
 *
 * As alturas acima do solo vem de fora ja calculadas: sao precisas noutros
 * sitios e nao vale a pena percorrer os waypoints duas vezes.
 */
export function linhasDaRota(
  rota: Rota,
  cotas: ReadonlyMap<string, number>,
  alturasAGL: readonly (number | null)[],
  fonteTerreno: FonteTerreno,
): LinhaWaypoint[] {
  return rota.waypoints.map((waypoint, i) => {
    const acimaDoSolo = alturasAGL[i] ?? null
    const cotaTerreno = cotas.get(chaveDaPosicao(waypoint)) ?? null

    return {
      waypoint,
      cotaTerreno,
      acimaDoSolo,
      alerta:
        acimaDoSolo !== null &&
        (acimaDoSolo < rota.alturaMinimaAcimaDoSolo || acimaDoSolo > AGL_MAXIMO),
      origemCota:
        cotaTerreno === null
          ? null
          : fonteTerreno instanceof FonteComposta
            ? fonteTerreno.origemEm(waypoint.lat, waypoint.lon)
            : 'terrarium',
    }
  })
}

/**
 * Os pontos que o mapa desenha em tres dimensoes.
 *
 * Um waypoint sem cota do terreno fica de fora: sem ela nao ha altura de voo que
 * se calcule, e desenha-lo ao nivel do mar era pior do que nao o desenhar.
 *
 * Os angulos vem do modo de camara da rota, e nao so do que esta gravado no
 * waypoint. E o que faz o aparelho desenhado no mapa mostrar o que a camara vai
 * mesmo fazer quando se escolhe seguir o proximo waypoint ou olhar para o
 * terreno.
 *
 * O aparelho so se desenha onde o utilizador escolheu. Em todos os waypoints
 * enchia o mapa: numa rota de cobertura sao dezenas, sobrepostos, e o que se via
 * era um tapete de aparelhos em vez do terreno que se anda a estudar.
 */
export function pontos3DdaRota(
  rota: Rota,
  linhas: readonly LinhaWaypoint[],
  seleccionados: ReadonlySet<string>,
): PontoRota3D[] {
  const pontos: PontoRota3D[] = []

  for (const [i, linha] of linhas.entries()) {
    if (linha.cotaTerreno === null) continue
    const atitude = atitudeNoWaypoint(rota, i)
    const escolhido = seleccionados.has(linha.waypoint.id)

    pontos.push({
      lat: linha.waypoint.lat,
      lon: linha.waypoint.lon,
      alturaVoo: paraASL(linha.waypoint.altura, rota.modoAltitude, {
        cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
        cotaTerreno: linha.cotaTerreno,
      }),
      cotaTerreno: linha.cotaTerreno,
      guinada: atitude.guinada,
      gimbalPitch: atitude.gimbalPitch,
      gimbalYaw: atitude.gimbalYaw,
      seleccionado: escolhido,
      alerta: linha.alerta,
      comAparelho: escolhido,
    })
  }

  return pontos
}
