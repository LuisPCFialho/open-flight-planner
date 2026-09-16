import type { LatLon, Rota, Waypoint } from '../nucleo/tipos.ts'
import { paraASL } from '../nucleo/geodesia.ts'
import { guinadaEfectiva } from '../nucleo/camara-trajecto.ts'
import type { EstadoReplay } from '../nucleo/replay.ts'
import type { EstadoVoo } from '../nucleo/voo.ts'
import type { Perfil } from '../nucleo/perfil.ts'
import type { Alvo } from './useEnquadramento.ts'
import { chaveDaPosicao } from './useCotasTerreno.ts'
import type { DroneNoMapa } from '../mapa/camada-drones.ts'

/**
 * Para onde a camara esta a olhar, e onde a aeronave esta desenhada.
 *
 * Sao contas puras. Vivem fora da aplicacao porque decidem o que a
 * pre-visualizacao do enquadramento mostra, e essa e a parte que ja saiu errada
 * duas vezes sem ninguem dar por isso - uma por se ler a guinada gravada em vez
 * da efectiva, outra por se ignorar a rotacao do gimbal.
 */

/** Quem manda na camara, por ordem. */
export type Comando = {
  /** O leitor a percorrer a rota, se estiver aberto e a mostrar alguma coisa. */
  replay: EstadoReplay | null
  /** O voo virtual, se estiver ligado. */
  voo: EstadoVoo | null
  /** O waypoint seleccionado, quando for so um. */
  seleccionado: Waypoint | null
}

/**
 * Alvo da vista de camara, por ordem de quem manda: a aeronave do leitor, a do
 * voo virtual, ou o waypoint seleccionado.
 */
export function alvoDaCamara(
  rota: Rota,
  cotas: ReadonlyMap<string, number>,
  comando: Comando,
): Alvo | null {
  const paraCimaDoTerreno = (altura: number, cotaTerreno: number): number =>
    paraASL(altura, rota.modoAltitude, {
      cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
      cotaTerreno,
    })

  if (comando.replay) {
    const estado = comando.replay
    return {
      posicao: estado.posicao,
      alturaASL: paraCimaDoTerreno(estado.altura, cotaSobAeronave(rota, cotas, estado)),
      guinada: estado.atitude.guinada,
      gimbalPitch: estado.atitude.gimbalPitch,
      gimbalYaw: estado.atitude.gimbalYaw,
    }
  }

  if (comando.voo) {
    const estado = comando.voo
    const cota = cotaEm(cotas, estado.posicao) ?? rota.pontoDescolagem.cotaTerreno
    return {
      posicao: estado.posicao,
      alturaASL: paraCimaDoTerreno(estado.altura, cota),
      guinada: estado.guinada,
      gimbalPitch: estado.gimbalPitch,
      gimbalYaw: estado.gimbalYaw,
    }
  }

  const waypoint = comando.seleccionado
  if (!waypoint) return null

  // Sem cota nao ha altura ASL que se calcule, e a marcha dos raios partiria de
  // um sitio que nao e o certo.
  const cota = cotaEm(cotas, waypoint)
  if (cota === undefined) return null

  return {
    posicao: { lat: waypoint.lat, lon: waypoint.lon },
    alturaASL: paraCimaDoTerreno(waypoint.altura, cota),
    /*
     * O rumo sai do modo de guinada, e nao do campo: em `followWayline` o campo
     * esta por preencher e lia-se zero, ou seja a previsao mostrava o que estava
     * a norte em vez do que a foto ia apanhar.
     */
    guinada: guinadaEfectiva(rota, waypoint.index),
    gimbalPitch: waypoint.gimbalPitch,
    /*
     * A previsao de um waypoint ignorava a rotacao do gimbal e mostrava o que a
     * aeronave tinha pela frente, que nao e o que a foto vai apanhar.
     */
    gimbalYaw: waypoint.gimbalYaw,
  }
}

/**
 * A aeronave do leitor, desenhada em 3D a percorrer a rota.
 *
 * Vem a parte dos waypoints: metida nos pontos da rota, o troco de voo passaria
 * por ela e a linha ficava com um desvio que nao existe.
 */
export function aeronaveDoReplay(estado: EstadoReplay, alturaASL: number): DroneNoMapa {
  return {
    lat: estado.posicao.lat,
    lon: estado.posicao.lon,
    alturaVoo: alturaASL,
    guinada: estado.atitude.guinada,
    gimbalPitch: estado.atitude.gimbalPitch,
    gimbalYaw: estado.atitude.gimbalYaw,
    seleccionado: false,
    alerta: false,
    comAparelho: true,
    // Maior e pintada de verde, para nao se confundir com os waypoints por onde passa.
    aumento: 1.7,
    tinta: [0.31, 0.85, 0.45, 0.55],
  }
}

/**
 * Onde a aeronave do leitor cai no corte do terreno.
 *
 * O percurso sai do proprio perfil, e nao de uma conta paralela: o troco e
 * percorrido a velocidade constante, portanto a fraccao de tempo dentro dele e a
 * mesma fraccao de distancia.
 */
export function aeronaveNoPerfil(
  perfil: Perfil,
  estado: EstadoReplay,
  alturaASL: number,
): { percurso: number; aslVoo: number } | null {
  const daqui = perfil.waypoints.find((m) => m.indice === estado.indice)
  if (!daqui) return null
  const ali = perfil.waypoints.find((m) => m.indice === estado.indice + 1)

  const percurso =
    ali && !estado.parada
      ? daqui.percurso + (ali.percurso - daqui.percurso) * estado.fraccao
      : daqui.percurso

  return { percurso, aslVoo: alturaASL }
}

function cotaEm(cotas: ReadonlyMap<string, number>, ponto: LatLon): number | undefined {
  return cotas.get(chaveDaPosicao(ponto))
}

/**
 * A cota sob a aeronave do leitor, interpolada entre a dos dois waypoints.
 *
 * As cotas conhecidas sao as dos waypoints, e a meio do caminho nao ha nenhuma.
 * O erro e o desvio do terreno em relacao a recta que os une, e para saber para
 * onde a camara olha isso chega.
 */
function cotaSobAeronave(
  rota: Rota,
  cotas: ReadonlyMap<string, number>,
  estado: EstadoReplay,
): number {
  const daqui = rota.waypoints[estado.indice]
  const ali = rota.waypoints[estado.indice + 1]
  const cotaDaqui = daqui ? cotaEm(cotas, daqui) : undefined
  const cotaAli = ali ? cotaEm(cotas, ali) : undefined

  if (cotaDaqui === undefined) return rota.pontoDescolagem.cotaTerreno
  if (cotaAli === undefined) return cotaDaqui
  return cotaDaqui + (cotaAli - cotaDaqui) * estado.fraccao
}
