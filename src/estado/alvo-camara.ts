import type { LatLon, Rota, Waypoint } from '../nucleo/tipos.ts'
import { paraASL } from '../nucleo/geodesia.ts'
import { guinadaEfectiva } from '../nucleo/camara-trajecto.ts'
import type { EstadoReplay } from '../nucleo/replay.ts'
import type { EstadoVoo } from '../nucleo/voo.ts'
import type { Perfil } from '../nucleo/perfil.ts'
import type { Alvo } from './useEnquadramento.ts'
import { pontoAoLongoDoRaio, type Enquadramento } from '../nucleo/camara.ts'
import type { Segmento3D } from '../mapa/camada-rota-3d.ts'
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
    /*
     * Maior, e com um toque de verde para nao se confundir com o aparelho
     * seleccionado, que leva um toque de azul.
     *
     * O verde estava em 0,55 - mais de metade da cor do modelo era substituida,
     * e o que se via no mapa era uma mancha verde com forma de drone em vez de
     * um aparelho. E o tamanho que ja o distingue; a cor so tem de confirmar.
     */
    aumento: 1.6,
    tinta: [0.35, 0.85, 0.5, 0.3],
  }
}

/**
 * A aeronave do voo virtual, desenhada onde ela esta e virada para onde aponta.
 *
 * Faltava: em voo virtual o mapa acompanhava a aeronave mas nao a desenhava, e
 * quem estava a pilotar via o terreno a passar sem ver o aparelho nem para onde
 * a camara estava voltada. Pilotar as cegas e o contrario do que o voo virtual
 * serve.
 *
 * Vai com a guinada da aeronave e os dois angulos do gimbal, que e o que faz o
 * desenho dizer alguma coisa - sem eles era um aparelho sempre virado a norte.
 */
export function aeronaveDoVoo(estado: EstadoVoo, alturaASL: number): DroneNoMapa {
  return {
    lat: estado.posicao.lat,
    lon: estado.posicao.lon,
    alturaVoo: alturaASL,
    guinada: estado.guinada,
    gimbalPitch: estado.gimbalPitch,
    gimbalYaw: estado.gimbalYaw,
    seleccionado: false,
    alerta: false,
    comAparelho: true,
    /*
     * Maior do que um waypoint e com um toque de ambar: e a aeronave que se
     * esta a pilotar naquele instante, e tem de se distinguir de relance dos
     * pontos ja gravados por onde ela passa.
     */
    aumento: 1.6,
    tinta: [1, 0.72, 0.25, 0.3],
  }
}

/**
 * As arestas da piramide que a camara projecta no terreno.
 *
 * Quatro do aparelho ate aos cantos que ele apanha, mais a base que os une.
 * Desenhada assim, ela diz duas coisas que o poligono no chao nao diz: de que
 * altura se esta a olhar, e com que inclinacao - um poligono igual pode vir de
 * um voo rasante ou de um voo alto a olhar para baixo.
 *
 * Com menos de tres cantos nao ha piramide: acontece quando os raios saem do
 * terreno carregado, e um triangulo solto nao quer dizer nada.
 */
export function arestasDoEnquadramento(
  alvo: Alvo,
  enquadramento: Pick<Enquadramento, 'cantos' | 'centro' | 'direccoesDosCantos'> | null | undefined,
): Segmento3D[] {
  if (!enquadramento) return []

  const direccoes = enquadramento.direccoesDosCantos
  if (direccoes.length < 4) return []

  /*
   * Ate onde se estende um raio que nao chega ao chao.
   *
   * Uma vez e meia a distancia ao centro do enquadramento: assim a piramide
   * cresce com o que se esta a ver, em vez de ter um tamanho fixo que fica
   * enorme de perto e minusculo de longe. Sem centro visado - camara toda acima
   * do horizonte - usa-se uma distancia de recurso.
   */
  const alcance = enquadramento.centro ? enquadramento.centro.distancia * 1.5 : 400

  const aparelho = { lat: alvo.posicao.lat, lon: alvo.posicao.lon, alt: alvo.alturaASL }

  /*
   * Cada canto vem do terreno quando o raio la chega, e da propria linha de
   * vista quando nao chega.
   *
   * Exigir que os quatro tocassem no chao era o que fazia a piramide nao
   * aparecer quase nunca: com o gimbal a doze graus e um campo de visao de
   * oitenta e quatro, os dois raios de cima apontam mais de vinte graus acima
   * do horizonte e nunca cortam o terreno. A figura ficava por desenhar
   * precisamente nas rotas de inspeccao, que sao as que mais precisam dela.
   */
  const pontas = direccoes.map((direccao, i) => {
    const canto = enquadramento.cantos[i]
    if (canto) {
      return { lat: canto.ponto.lat, lon: canto.ponto.lon, alt: canto.cotaTerreno }
    }
    const longe = pontoAoLongoDoRaio(alvo.posicao, alvo.alturaASL, direccao, alcance)
    return { lat: longe.ponto.lat, lon: longe.ponto.lon, alt: longe.altura }
  })

  const arestas: Segmento3D[] = pontas.map((ponta) => ({ de: aparelho, para: ponta }))

  // A base fecha-se: e ela que faz a figura ler-se como piramide e nao como leque.
  for (const [i, ponta] of pontas.entries()) {
    const seguinte = pontas[(i + 1) % pontas.length]
    if (seguinte) arestas.push({ de: ponta, para: seguinte })
  }

  return arestas
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
