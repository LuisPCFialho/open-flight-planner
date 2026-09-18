import type { LatLon, Rota, Waypoint } from '../nucleo/tipos.ts'
import { deslocar, paraASL } from '../nucleo/geodesia.ts'
import { guinadaEfectiva } from '../nucleo/camara-trajecto.ts'
import type { EstadoReplay } from '../nucleo/replay.ts'
import type { EstadoVoo } from '../nucleo/voo.ts'
import type { Perfil } from '../nucleo/perfil.ts'
import type { Alvo } from './useEnquadramento.ts'
import { pontoAoLongoDoRaio, type Enquadramento } from '../nucleo/camara.ts'
import type { Segmento3D } from '../mapa/camada-rota-3d.ts'
import type { Cor } from '../mapa/cores-rota.ts'
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
 * Comprimento dos raios da camara, em metros.
 *
 * Fixo de proposito. Proporcional a distancia visada, a figura ficava enorme
 * quando o gimbal estava quase na horizontal e minuscula a olhar para baixo -
 * duas leituras diferentes da mesma coisa, e nenhuma delas util.
 */
export const ALCANCE_DOS_RAIOS = 60

/** Comprimento da seta que diz para onde aponta o nariz, em metros. */
const COMPRIMENTO_DA_SETA = 26
/** Quanto as farpas da ponta abrem, em graus para cada lado. */
const ABERTURA_DA_SETA = 28

/** Um canto do enquadramento, e se ele chegou mesmo ao terreno. */
export type PontaDoEnquadramento = {
  lat: number
  lon: number
  alt: number
  /** `false` quando o raio nunca cortou o terreno e a ponta foi projectada. */
  noTerreno: boolean
}

/**
 * Os quatro cantos do enquadramento, no terreno quando la chegam e na propria
 * linha de vista quando nao chegam.
 *
 * E a unica conta: a piramide em 3D e o poligono no chao saem os dois daqui. O
 * poligono tinha conta propria, que exigia tres cantos no terreno, e por isso
 * as duas figuras discordavam - com o gimbal pouco inclinado aparecia a
 * piramide e nao aparecia a mancha, e quem estava a ver nao tinha como saber
 * porque e que a mesma coisa umas vezes se via e outras nao.
 *
 * Exigir que os cantos tocassem no chao era o que os fazia desaparecer
 * precisamente nas rotas de inspeccao: com o gimbal a doze graus e um campo de
 * visao de oitenta e quatro, os dois raios de cima apontam mais de vinte graus
 * acima do horizonte e nunca cortam o terreno.
 */
export function pontasDoEnquadramento(
  alvo: Alvo,
  enquadramento: Pick<Enquadramento, 'cantos' | 'centro' | 'direccoesDosCantos'> | null | undefined,
): PontaDoEnquadramento[] {
  if (!enquadramento) return []

  const direccoes = enquadramento.direccoesDosCantos
  if (direccoes.length < 4) return []

  /*
   * Ate onde se estende um raio que nao chega ao chao.
   *
   * Era proporcional a distancia ao centro visado, e com o gimbal quase na
   * horizontal essa distancia sao centenas de metros: a figura disparava para
   * fora do mapa e tapava a rota. Passa a ser um comprimento fixo - a mancha no
   * chao continua a dizer o que a foto cobre, e esta figura so tem de dizer
   * para onde a camara aponta.
   */
  const alcance = ALCANCE_DOS_RAIOS

  return direccoes.map((direccao, i) => {
    const canto = enquadramento.cantos[i]
    if (canto) {
      return { lat: canto.ponto.lat, lon: canto.ponto.lon, alt: canto.cotaTerreno, noTerreno: true }
    }
    const longe = pontoAoLongoDoRaio(alvo.posicao, alvo.alturaASL, direccao, alcance)
    return { lat: longe.ponto.lat, lon: longe.ponto.lon, alt: longe.altura, noTerreno: false }
  })
}

/**
 * As arestas da piramide que sai da camara.
 *
 * Quatro do aparelho, uma por canto do enquadramento, mais a base que as une.
 * Diz para onde a camara aponta e com que inclinacao - um poligono igual no
 * chao pode vir de um voo rasante ou de um voo alto a olhar para baixo.
 *
 * **Nao assenta no terreno, e e de proposito.** Cada aresta tem o mesmo
 * comprimento, sempre. Assente no terreno, a figura crescia com o que estava a
 * ser visto: com o gimbal quase na horizontal os cantos de baixo caem a
 * centenas de metros e a piramide disparava para fora do mapa, tapando a rota.
 *
 * O que continua a dizer o que a foto cobre e a mancha no chao, essa calculada
 * contra o terreno a serio. Esta figura e o cone da camara, e um cone de
 * tamanho fixo le-se sempre da mesma maneira.
 */
export function arestasDoEnquadramento(
  alvo: Alvo,
  enquadramento: Pick<Enquadramento, 'cantos' | 'centro' | 'direccoesDosCantos'> | null | undefined,
): Segmento3D[] {
  const direccoes = enquadramento?.direccoesDosCantos ?? []
  if (direccoes.length < 4) return []

  const pontas = direccoes.map((direccao) => {
    const longe = pontoAoLongoDoRaio(alvo.posicao, alvo.alturaASL, direccao, ALCANCE_DOS_RAIOS)
    return { lat: longe.ponto.lat, lon: longe.ponto.lon, alt: longe.altura }
  })

  const aparelho = { lat: alvo.posicao.lat, lon: alvo.posicao.lon, alt: alvo.alturaASL }
  const arestas: Segmento3D[] = pontas.map((ponta) => ({ de: aparelho, para: ponta }))

  // A base fecha-se: e ela que faz a figura ler-se como piramide e nao como leque.
  for (const [i, ponta] of pontas.entries()) {
    const seguinte = pontas[(i + 1) % pontas.length]
    if (seguinte) arestas.push({ de: ponta, para: seguinte })
  }

  return arestas
}

/** Branco-azulado, para nao se confundir com o ambar da camara nem com a rota. */
const COR_RUMO: Cor = [0.88, 0.95, 1, 0.95]

/**
 * A seta que diz para onde aponta o nariz da aeronave.
 *
 * Existe porque o modelo, sozinho, nao chega: um quadricoptero visto de cima e
 * quase simetrico a quatro voltas, e a que altura de voo se ve no mapa, a
 * diferenca entre rumo 0 e rumo 90 sao uns pixeis de camara do gimbal. Quem
 * pilotava nao via o aparelho rodar, e como o W leva a aeronave para onde o
 * nariz aponta, o que se via era o aparelho a deslizar de lado sem razao.
 *
 * E uma marca de rumo e nao parte do modelo: nao estraga a fidelidade do
 * aparelho, e le-se a qualquer escala porque tem comprimento proprio, fixo.
 *
 * Nao se confunde com a piramide da camara. Esta diz onde esta a frente, aquela
 * diz para onde a camara olha - e com o gimbal rodado sao direccoes diferentes,
 * que e precisamente quando isto faz falta.
 */
export function setaDoRumo(alvo: Alvo): Segmento3D[] {
  const altura = alvo.alturaASL
  const noAr = (ponto: LatLon): { lat: number; lon: number; alt: number } => ({
    lat: ponto.lat,
    lon: ponto.lon,
    alt: altura,
  })

  const aparelho = noAr(alvo.posicao)
  const ponta = noAr(deslocar(alvo.posicao, alvo.guinada, COMPRIMENTO_DA_SETA))

  // As farpas nascem na ponta e voltam para tras, uma para cada lado.
  const farpa = (lado: number): Segmento3D => ({
    de: ponta,
    para: noAr(
      deslocar(
        deslocar(alvo.posicao, alvo.guinada, COMPRIMENTO_DA_SETA * 0.62),
        alvo.guinada + lado * 90,
        COMPRIMENTO_DA_SETA * Math.tan((ABERTURA_DA_SETA * Math.PI) / 180) * 0.62,
      ),
    ),
    cor: COR_RUMO,
  })

  return [{ de: aparelho, para: ponta, cor: COR_RUMO }, farpa(-1), farpa(1)]
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
