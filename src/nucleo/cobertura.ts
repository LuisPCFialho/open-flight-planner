import type { LatLon, Rota, Waypoint } from './tipos.ts'
import { distancia, deslocamentoLocal, deslocar, rumo as rumoEntre } from './geodesia.ts'
import { centroDoContorno } from './areas.ts'
import { fovVerticalDe } from './camara.ts'
import { novoId } from './ids.ts'
import { renumerar, waypointNovo } from './operacoes-rota.ts'

/**
 * Cobrir uma area com passagens paralelas.
 *
 * Importar o limite da parcela e ficar a olhar para ele nao adianta nada: o que
 * se quer a seguir e a rota que o cobre. Fazer isso a mao sao dezenas de
 * waypoints alinhados a olho, com o espacamento certo, e depois outra vez para a
 * parcela do lado.
 *
 * O espacamento nao se escolhe: sai da camara e da altura. Uma foto a `h` metros
 * com campo de visao `f` cobre `2 h tan(f/2)` de terreno; a sobreposicao pedida
 * diz que fraccao dessa largura se anda antes da passagem seguinte. E por isso
 * que a altura e a sobreposicao sao os dois numeros que aqui interessam, e nao o
 * espacamento em si.
 */

export type OpcoesCobertura = {
  /** Altura de voo acima do solo, em metros. */
  alturaAcimaDoSolo: number
  fovHorizontalGraus: number
  /** Largura a dividir pela altura do sensor. */
  proporcao: number
  /** Sobreposicao entre passagens vizinhas, de 0 a 1. */
  sobreposicaoLateral: number
  /** Sobreposicao entre fotos seguidas na mesma passagem, de 0 a 1. */
  sobreposicaoFrontal: number
  /** Rumo das passagens, em graus. */
  rumoGraus: number
  /** Quanto se estende para fora do contorno, em metros. */
  margem: number
  /**
   * Partir cada passagem em pontos ao intervalo das fotos.
   *
   * Desligado, a rota leva dois waypoints por passagem e as fotos tiram-se por
   * intervalo no aparelho. Ligado, ha um waypoint por foto - o que da a rota que
   * se exporta com uma accao de foto em cada ponto, e enche depressa.
   */
  umPontoPorFoto: boolean
}

export type Cobertura = {
  /** Uma lista de pontos por passagem, ja na ordem de voo. */
  passagens: LatLon[][]
  /** Metros entre passagens vizinhas. */
  espacamento: number
  /** Metros entre fotos seguidas na mesma passagem. */
  intervaloEntreFotos: number
  /** Largura de terreno que uma foto cobre, em metros. */
  larguraDaFaixa: number
  /** Comprimento de terreno que uma foto cobre, no sentido do voo. */
  comprimentoDaFaixa: number
  /** Quantas fotos as passagens implicam, ao intervalo calculado. */
  numeroDeFotos: number
  /** Metros a percorrer, somando as passagens e os saltos entre elas. */
  distancia: number
}

const GRAUS = Math.PI / 180

/** Largura de terreno coberta por uma foto, em metros. */
export function larguraCoberta(alturaAcimaDoSolo: number, fovGraus: number): number {
  if (!(alturaAcimaDoSolo > 0) || !(fovGraus > 0) || fovGraus >= 180) return 0
  return 2 * alturaAcimaDoSolo * Math.tan((fovGraus * GRAUS) / 2)
}

/**
 * Avanco entre passagens, ou entre fotos, para a sobreposicao pedida.
 *
 * Uma sobreposicao de 1 nunca avanca, o que daria passagens infinitas; fica
 * limitada a 95%, que ja e mais do que qualquer levantamento pede.
 */
export function avancoPara(largura: number, sobreposicao: number): number {
  const util = 1 - Math.min(0.95, Math.max(0, sobreposicao))
  return largura * util
}

type Ponto = { x: number; y: number }

/** Roda um ponto do plano por `angulo` radianos. */
function rodar(p: Ponto, angulo: number): Ponto {
  const c = Math.cos(angulo)
  const s = Math.sin(angulo)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/**
 * Onde a recta horizontal `y` corta o poligono, em pares ordenados.
 *
 * Um poligono concavo - uma parcela em L, ou com um caminho a atravessa-la -
 * da mais do que um troco na mesma passagem, e sao todos devolvidos. Ignorar
 * isso faria a aeronave atravessar o que nao e para cobrir.
 */
function cortesNaLinha(poligono: readonly Ponto[], y: number): [number, number][] {
  const xs: number[] = []

  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i]
    const b = poligono[(i + 1) % poligono.length]
    if (!a || !b) continue
    // Meio aberto de proposito: um vertice em cima da linha conta uma so vez.
    if (a.y <= y === b.y <= y) continue
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
  }

  xs.sort((p, q) => p - q)
  const pares: [number, number][] = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const de = xs[i]
    const para = xs[i + 1]
    if (de !== undefined && para !== undefined) pares.push([de, para])
  }
  return pares
}

/** Divide um troco em pontos ao passo dado, sempre com as duas pontas. */
function repartir(de: Ponto, para: Ponto, passo: number): Ponto[] {
  const comprimento = Math.hypot(para.x - de.x, para.y - de.y)
  if (!(passo > 0) || comprimento <= passo) return [de, para]

  const quantos = Math.ceil(comprimento / passo)
  const pontos: Ponto[] = []
  for (let i = 0; i <= quantos; i++) {
    const t = i / quantos
    pontos.push({ x: de.x + (para.x - de.x) * t, y: de.y + (para.y - de.y) * t })
  }
  return pontos
}

/**
 * Gera as passagens que cobrem o contorno.
 *
 * As passagens alternam de sentido - o serpentear que qualquer levantamento faz -
 * porque voltar ao principio de cada uma seria andar duas vezes o mesmo caminho.
 */
export function gerarCobertura(
  contorno: readonly LatLon[],
  opcoes: OpcoesCobertura,
): Cobertura {
  const vazio: Cobertura = {
    passagens: [],
    espacamento: 0,
    intervaloEntreFotos: 0,
    larguraDaFaixa: 0,
    comprimentoDaFaixa: 0,
    numeroDeFotos: 0,
    distancia: 0,
  }

  const centro = centroDoContorno(contorno)
  if (!centro || contorno.length < 3) return vazio

  const larguraDaFaixa = larguraCoberta(opcoes.alturaAcimaDoSolo, opcoes.fovHorizontalGraus)
  const comprimentoDaFaixa = larguraCoberta(
    opcoes.alturaAcimaDoSolo,
    fovVerticalDe(opcoes.fovHorizontalGraus, opcoes.proporcao),
  )
  const espacamento = avancoPara(larguraDaFaixa, opcoes.sobreposicaoLateral)
  const intervaloEntreFotos = avancoPara(comprimentoDaFaixa, opcoes.sobreposicaoFrontal)
  if (!(espacamento > 0)) return vazio

  /*
   * Trabalha-se em metros num plano local e com as passagens na horizontal.
   *
   * Rodar o poligono pelo rumo pedido e mais simples do que rodar as rectas: com
   * as passagens horizontais, o corte com o poligono e uma conta de uma linha, e
   * a ordem sai sozinha.
   */
  /*
   * O menos noventa e o que faz `rumoGraus` querer dizer o que o nome diz.
   *
   * As passagens saem ao longo do eixo x do plano de trabalho. O rumo conta-se
   * do norte e cresce para leste, e o eixo x aponta a leste: sem o desconto, um
   * rumo de zero - que e norte - dava passagens a voar para leste.
   */
  const anguloDeTrabalho = (opcoes.rumoGraus - 90) * GRAUS
  const plano = contorno.map((p) => rodar(deslocamentoLocal(centro, p), anguloDeTrabalho))

  let yMin = Infinity
  let yMax = -Infinity
  for (const p of plano) {
    yMin = Math.min(yMin, p.y)
    yMax = Math.max(yMax, p.y)
  }
  yMin -= opcoes.margem
  yMax += opcoes.margem

  const passagens: LatLon[][] = []
  const quantasLinhas = Math.max(1, Math.ceil((yMax - yMin) / espacamento))
  // Centra as passagens na area em vez de as encostar a um dos lados.
  const sobra = quantasLinhas * espacamento - (yMax - yMin)
  const inicio = yMin - sobra / 2

  for (let i = 0; i <= quantasLinhas; i++) {
    const y = inicio + i * espacamento
    const trocos = cortesNaLinha(plano, y)
    if (trocos.length === 0) continue

    // Serpentear: as passagens pares vao num sentido, as impares no outro.
    const ordenados = i % 2 === 0 ? trocos : [...trocos].reverse()

    for (const [x1, x2] of ordenados) {
      const de = { x: i % 2 === 0 ? x1 - opcoes.margem : x2 + opcoes.margem, y }
      const para = { x: i % 2 === 0 ? x2 + opcoes.margem : x1 - opcoes.margem, y }

      const emMetros = opcoes.umPontoPorFoto
        ? repartir(de, para, intervaloEntreFotos)
        : [de, para]

      passagens.push(emMetros.map((p) => paraLatLon(centro, rodar(p, -anguloDeTrabalho))))
    }
  }

  return {
    passagens,
    espacamento,
    intervaloEntreFotos,
    larguraDaFaixa,
    comprimentoDaFaixa,
    numeroDeFotos: contarFotos(passagens, intervaloEntreFotos),
    distancia: percorrer(passagens),
  }
}

/** Converte um deslocamento local em metros de volta a coordenadas. */
function paraLatLon(centro: LatLon, p: Ponto): LatLon {
  const distancia = Math.hypot(p.x, p.y)
  if (distancia < 1e-9) return { lat: centro.lat, lon: centro.lon }
  // `deslocar` recebe o rumo, que se conta do norte e cresce para leste.
  const rumo = (Math.atan2(p.x, p.y) / GRAUS + 360) % 360
  return deslocar(centro, rumo, distancia)
}

/** Fotos que as passagens implicam ao intervalo dado. */
function contarFotos(passagens: readonly LatLon[][], intervalo: number): number {
  if (!(intervalo > 0)) return 0
  let total = 0
  for (const passagem of passagens) {
    total += Math.max(2, Math.floor(comprimentoDe(passagem) / intervalo) + 1)
  }
  return total
}

function comprimentoDe(pontos: readonly LatLon[]): number {
  let total = 0
  for (let i = 1; i < pontos.length; i++) {
    const de = pontos[i - 1]
    const para = pontos[i]
    if (de && para) total += distancia(de, para)
  }
  return total
}

/** Percurso total, contando os saltos de uma passagem para a seguinte. */
function percorrer(passagens: readonly LatLon[][]): number {
  let total = 0
  for (const [i, passagem] of passagens.entries()) {
    total += comprimentoDe(passagem)
    const anterior = passagens[i - 1]
    const fimAnterior = anterior?.at(-1)
    const inicio = passagem[0]
    if (fimAnterior && inicio) total += distancia(fimAnterior, inicio)
  }
  return total
}

/** Todos os pontos das passagens seguidos, que e a ordem em que se voa. */
export function pontosDaCobertura(cobertura: Cobertura): LatLon[] {
  return cobertura.passagens.flat()
}

/**
 * Rumo que alinha as passagens com o lado mais comprido do contorno.
 *
 * E o que da menos voltas: voar ao comprido faz passagens longas e poucas
 * inversoes, voar ao travez faz o contrario. Sai do lado mais longo do
 * poligono, que numa parcela de central e a direccao das filas.
 */
export function rumoDoLadoMaisLongo(contorno: readonly LatLon[]): number {
  let melhor = 0
  let maior = -1

  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]
    const b = contorno[(i + 1) % contorno.length]
    if (!a || !b) continue
    const { x, y } = deslocamentoLocal(a, b)
    const comprimento = Math.hypot(x, y)
    if (comprimento <= maior) continue
    maior = comprimento
    melhor = rumoEntre(a, b)
  }

  // O sentido nao importa: uma passagem a 200 graus e a mesma que a 20.
  return ((melhor % 180) + 180) % 180
}

/**
 * Acrescenta as passagens a rota, como waypoints.
 *
 * Vao para o fim e nao substituem o que la esta: quem gera uma cobertura por
 * cima de uma rota que ja tinha trabalho feito nao devia perde-lo por engano, e
 * desfazer resolve o resto.
 *
 * Os waypoints ficam com a camara a prumo e o rumo fixo no sentido da passagem,
 * que e como um levantamento se voa. Sem isso a aeronave rodava a cada ponto
 * para seguir a linha, e as fotos saiam com a orientacao a mudar de passagem
 * para passagem.
 */
export function acrescentarCobertura(
  rota: Rota,
  cobertura: Cobertura,
  opcoes: { alturaAcimaDoSolo: number; comFoto: boolean },
): Rota {
  const novos: Waypoint[] = []

  for (const passagem of cobertura.passagens) {
    const inicio = passagem[0]
    const fim = passagem.at(-1)
    const rumoDaPassagem = inicio && fim && distancia(inicio, fim) > 0.5 ? rumoEntre(inicio, fim) : 0

    for (const ponto of passagem) {
      novos.push({
        ...waypointNovo({
          lat: ponto.lat,
          lon: ponto.lon,
          altura: opcoes.alturaAcimaDoSolo,
          index: 0,
        }),
        id: novoId(),
        modoGuinada: 'fixed',
        guinada: rumoDaPassagem,
        gimbalPitch: -90,
        gimbalYaw: 0,
        // Passar suave: parar em cada ponto de uma cobertura duplicaria o tempo.
        tipoCurva: 'passarSuave',
        acoes: opcoes.comFoto ? [{ tipo: 'tirarFoto' }] : [],
      })
    }
  }

  if (novos.length === 0) return rota
  return { ...rota, waypoints: renumerar([...rota.waypoints, ...novos]) }
}
