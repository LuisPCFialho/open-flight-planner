import type { LatLon } from './tipos.ts'
import { deslocar, distancia } from './geodesia.ts'

/**
 * Geometria da camara: o que e que a foto vai apanhar.
 *
 * Trabalha em coordenadas locais ENU, Este Norte Cima, com origem na aeronave.
 * Cada raio e marchado contra o terreno ate o cortar, o que da o poligono que a
 * foto vai cobrir. Projectar sobre um plano horizontal seria muito mais simples
 * e estaria errado em qualquer encosta, que e onde isto interessa.
 */

const GRAUS = Math.PI / 180

export type ParametrosCamara = {
  posicao: LatLon
  /** Altura de voo ortometrica. */
  alturaASL: number
  /** Rumo da aeronave em graus, 0 a norte. */
  guinada: number
  /** Inclinacao do gimbal em graus, negativa para baixo. */
  gimbalPitch: number
  /** Campo de visao horizontal em graus. */
  fovHorizontal: number
  /** Largura a dividir pela altura do sensor. 4:3 na maioria das camaras DJI. */
  proporcao: number
}

export type PontoVisado = {
  ponto: LatLon
  cotaTerreno: number
  /** Distancia obliqua da aeronave ao ponto, em metros. */
  distancia: number
}

export type Enquadramento = {
  centro: PontoVisado | null
  /** Cantos pela ordem: cima-esquerda, cima-direita, baixo-direita, baixo-esquerda. */
  cantos: (PontoVisado | null)[]
  /**
   * Direccao de cada raio de canto, em ENU e normalizada, pela mesma ordem.
   *
   * Vao a parte dos cantos porque um raio que nao corte o terreno continua a
   * ter direccao. Com o gimbal pouco inclinado - doze ou treze graus, que e o
   * que uma rota de inspeccao usa - os raios de cima passam mais de vinte graus
   * acima do horizonte e nunca tocam no chao: nao ha canto, mas ha para onde se
   * olha, e e disso que a piramide precisa.
   */
  direccoesDosCantos: Vector3[]
  /**
   * Direccao do raio central, em ENU e normalizada.
   *
   * Existe mesmo quando o centro nao acerta em terreno nenhum - camara acima do
   * horizonte - e e o que permite a vista de camara continuar a apontar para
   * onde a camara aponta em vez de ficar parada no ultimo sitio que viu.
   */
  direccaoDoCentro: Vector3
  /** Largura do terreno coberta na horizontal media, em metros. */
  larguraCoberta: number | null
  /** Profundidade coberta entre o bordo proximo e o distante, em metros. */
  profundidadeCoberta: number | null
  /** Campo de visao vertical em graus, derivado do horizontal e da proporcao. */
  fovVertical: number
}

export type AmostradorTerreno = (ponto: LatLon) => number

/** Campo de visao vertical em graus, a partir do horizontal e da proporcao do sensor. */
export function fovVerticalDe(fovHorizontal: number, proporcao: number): number {
  return (2 * Math.atan(Math.tan((fovHorizontal * GRAUS) / 2) / proporcao)) / GRAUS
}

export type Vector3 = { este: number; norte: number; cima: number }

/**
 * Base da camara em ENU.
 *
 * Com a aeronave a norte e o gimbal na horizontal, `frente` aponta a norte,
 * `direita` a este e `cima` para cima. Com o gimbal a 90 graus para baixo,
 * `frente` aponta ao solo e `cima` da imagem passa a ser o norte, que e o que
 * acontece numa foto nadiral.
 */
export function baseDaCamara(guinada: number, gimbalPitch: number): {
  frente: Vector3
  direita: Vector3
  cima: Vector3
} {
  const g = guinada * GRAUS
  const p = gimbalPitch * GRAUS

  const frente: Vector3 = {
    este: Math.sin(g) * Math.cos(p),
    norte: Math.cos(g) * Math.cos(p),
    cima: Math.sin(p),
  }
  const direita: Vector3 = { este: Math.cos(g), norte: -Math.sin(g), cima: 0 }
  const cima = produtoExterno(direita, frente)

  return { frente, direita, cima }
}

function produtoExterno(a: Vector3, b: Vector3): Vector3 {
  return {
    este: a.norte * b.cima - a.cima * b.norte,
    norte: a.cima * b.este - a.este * b.cima,
    cima: a.este * b.norte - a.norte * b.este,
  }
}

function normalizar(v: Vector3): Vector3 {
  const comprimento = Math.hypot(v.este, v.norte, v.cima)
  if (comprimento === 0) return v
  return { este: v.este / comprimento, norte: v.norte / comprimento, cima: v.cima / comprimento }
}

/**
 * Marcha um raio contra o terreno.
 *
 * Avanca em passos grosseiros ate passar para baixo do terreno e depois afina
 * por bisseccao. Devolve `null` quando o raio sobe, ou quando nao encontra o
 * terreno dentro do alcance, que e o caso de uma camara apontada ao horizonte.
 */
/**
 * Onde um raio esta, a uma dada distancia da origem.
 *
 * Serve para desenhar a direccao de um raio que nunca corta o terreno. Nao e
 * uma medicao - e um ponto arbitrario ao longo da linha de vista - e por isso
 * nao entra em nada que se leia como numero.
 */
export function pontoAoLongoDoRaio(
  origem: LatLon,
  alturaASL: number,
  direccao: Vector3,
  distancia: number,
): { ponto: LatLon; altura: number } {
  const horizontal = Math.hypot(direccao.este, direccao.norte)
  const rumo = (Math.atan2(direccao.este, direccao.norte) / GRAUS + 360) % 360

  return {
    ponto: horizontal < 1e-12 ? origem : deslocar(origem, rumo, horizontal * distancia),
    altura: alturaASL + direccao.cima * distancia,
  }
}

export function marcharRaio(
  origem: LatLon,
  alturaASL: number,
  direccao: Vector3,
  terreno: AmostradorTerreno,
  opcoes: { alcance?: number; passo?: number } = {},
): PontoVisado | null {
  const alcance = opcoes.alcance ?? 4000
  const passo = opcoes.passo ?? 10

  const horizontal = Math.hypot(direccao.este, direccao.norte)
  // Um raio que suba, ou perfeitamente horizontal, nunca corta o terreno a frente.
  if (direccao.cima >= 0) return null

  /*
   * Raio vertical: a foto nadiral, que e o caso mais comum de todos. Sem este
   * ramo funcionaria na mesma, mas so por acaso: `cos(-90 graus)` nao da zero
   * exacto em virgula flutuante, e a marcha andaria uns femtometros para o lado.
   * Depender disso e pedir que um dia deixe de funcionar.
   */
  if (horizontal < 1e-12) {
    const cota = terreno(origem)
    return { ponto: origem, cotaTerreno: cota, distancia: Math.max(0, alturaASL - cota) }
  }

  const rumo = (Math.atan2(direccao.este, direccao.norte) / GRAUS + 360) % 360

  const emT = (t: number): { ponto: LatLon; alturaRaio: number; cota: number } => {
    const ponto = deslocar(origem, rumo, horizontal * t)
    return { ponto, alturaRaio: alturaASL + direccao.cima * t, cota: terreno(ponto) }
  }

  let anterior = emT(0)
  if (anterior.alturaRaio <= anterior.cota) {
    return { ponto: anterior.ponto, cotaTerreno: anterior.cota, distancia: 0 }
  }

  for (let t = passo; t <= alcance; t += passo) {
    const actual = emT(t)
    if (actual.alturaRaio <= actual.cota) {
      // Bisseccao entre o ultimo ponto acima do terreno e este.
      let baixo = t - passo
      let alto = t
      for (let i = 0; i < 24; i++) {
        const meio = (baixo + alto) / 2
        const amostra = emT(meio)
        if (amostra.alturaRaio <= amostra.cota) alto = meio
        else baixo = meio
      }
      const corte = emT(alto)
      // A direccao e unitaria, portanto o parametro `alto` ja e a distancia obliqua.
      return { ponto: corte.ponto, cotaTerreno: corte.cota, distancia: alto }
    }
    anterior = actual
  }

  return null
}

export function projectarEnquadramento(
  parametros: ParametrosCamara,
  terreno: AmostradorTerreno,
  opcoes: { alcance?: number; passo?: number } = {},
): Enquadramento {
  const { frente, direita, cima } = baseDaCamara(parametros.guinada, parametros.gimbalPitch)
  const fovVertical = fovVerticalDe(parametros.fovHorizontal, parametros.proporcao)

  const tx = Math.tan((parametros.fovHorizontal * GRAUS) / 2)
  const ty = Math.tan((fovVertical * GRAUS) / 2)

  const raio = (sx: number, sy: number): Vector3 =>
    normalizar({
      este: frente.este + sx * tx * direita.este + sy * ty * cima.este,
      norte: frente.norte + sx * tx * direita.norte + sy * ty * cima.norte,
      cima: frente.cima + sx * tx * direita.cima + sy * ty * cima.cima,
    })

  const lancar = (sx: number, sy: number): PontoVisado | null =>
    marcharRaio(parametros.posicao, parametros.alturaASL, raio(sx, sy), terreno, opcoes)

  const centro = lancar(0, 0)
  const direccaoDoCentro = raio(0, 0)
  // Cima-esquerda, cima-direita, baixo-direita, baixo-esquerda.
  const escalas: readonly [number, number][] = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]
  const cantos = escalas.map(([sx, sy]) => lancar(sx, sy))
  const direccoesDosCantos = escalas.map(([sx, sy]) => raio(sx, sy))

  return {
    centro,
    direccaoDoCentro,
    direccoesDosCantos,
    cantos,
    larguraCoberta: larguraMedia(cantos),
    profundidadeCoberta: profundidade(cantos),
    fovVertical,
  }
}

/** Media das larguras do bordo distante e do bordo proximo. */
function larguraMedia(cantos: readonly (PontoVisado | null)[]): number | null {
  const [cimaEsq, cimaDir, baixoDir, baixoEsq] = cantos
  const distante = cimaEsq && cimaDir ? distancia(cimaEsq.ponto, cimaDir.ponto) : null
  const proximo = baixoEsq && baixoDir ? distancia(baixoEsq.ponto, baixoDir.ponto) : null

  if (distante !== null && proximo !== null) return (distante + proximo) / 2
  return distante ?? proximo
}

function profundidade(cantos: readonly (PontoVisado | null)[]): number | null {
  const [cimaEsq, , , baixoEsq] = cantos
  if (!cimaEsq || !baixoEsq) return null
  return distancia(cimaEsq.ponto, baixoEsq.ponto)
}

/**
 * A mesma direccao, garantidamente abaixo do horizonte.
 *
 * A camara do mapa nao sabe olhar para cima: a inclinacao maxima do MapLibre
 * poe-na a rasar o horizonte e mais nada. Com o gimbal apontado ao ceu nao ha
 * ponto no terreno para onde mirar, e a vista de camara ficava parada no ultimo
 * sitio que tinha visto - mexia a altitude e mais nada, como se tivesse
 * encravado.
 *
 * Baixando o raio o minimo necessario, a vista continua a rodar com o gimbal e
 * a acompanhar a aeronave. O que ela mostra deixa de ser exacto em inclinacao,
 * e o ecra di-lo por palavras - mas uma vista que responde e mais util do que
 * uma vista exacta que congela.
 */
export function abaixoDoHorizonte(direccao: Vector3, minimoGraus = 6): Vector3 {
  const minimo = -Math.sin(minimoGraus * GRAUS)
  if (direccao.cima <= minimo) return direccao

  const horizontal = Math.hypot(direccao.este, direccao.norte)
  // Um raio exactamente vertical nao tem direccao no plano que se possa manter.
  if (horizontal < 1e-12) return { este: 0, norte: 1, cima: minimo }

  const escala = Math.sqrt(1 - minimo * minimo) / horizontal
  return {
    este: direccao.este * escala,
    norte: direccao.norte * escala,
    cima: minimo,
  }
}
