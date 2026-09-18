import type { Area, LatLon } from './tipos.ts'

/**
 * Zonas por onde a rota nao pode passar.
 *
 * Numa central ha sitios que nao se sobrevoam: o posto de transformacao, a
 * parcela do vizinho que nao autorizou, o corredor de uma linha de media
 * tensao. Sao limites como os outros - entram pelo mesmo caminho, um KML ou um
 * KMZ com poligonos - e a diferenca e o que se faz com eles.
 *
 * A verificacao e feita em planta e nao em volume. Uma zona interdita por causa
 * de uma linha aerea seria uma caixa com altura; aqui basta o chao, porque quem
 * a marca esta a dizer "nao passes por cima disto" e nao "nao passes abaixo de
 * tantos metros". Se algum dia fizer falta a altura, acrescenta-se ao tipo.
 *
 * As contas correm em graus e nao em metros. A menos de um grau de distancia, e
 * a estas latitudes, a diferenca entre um plano e a esfera nao chega para mudar
 * de que lado de uma linha um ponto esta - e o que se decide aqui e so isso.
 */

/** Se um ponto cai dentro de um contorno, por lancamento de raio. */
export function dentroDoContorno(ponto: LatLon, contorno: readonly LatLon[]): boolean {
  if (contorno.length < 3) return false

  /*
   * Conta-se quantas vezes um raio para leste atravessa o contorno. Impar, o
   * ponto esta dentro; par, esta fora. Funciona com poligonos concavos e com
   * buracos, ao contrario de somar angulos.
   */
  let dentro = false
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const a = contorno[i]
    const b = contorno[j]
    if (!a || !b) continue

    const atravessa = a.lat > ponto.lat !== b.lat > ponto.lat
    if (!atravessa) continue

    const lonNoCruzamento =
      ((b.lon - a.lon) * (ponto.lat - a.lat)) / (b.lat - a.lat) + a.lon
    if (ponto.lon < lonNoCruzamento) dentro = !dentro
  }

  return dentro
}

/** Se dois segmentos se cruzam. Serve para saber se um troco entra numa zona. */
export function segmentosCruzam(
  a1: LatLon,
  a2: LatLon,
  b1: LatLon,
  b2: LatLon,
): boolean {
  const lado = (p: LatLon, q: LatLon, r: LatLon): number =>
    (q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon)

  const d1 = lado(b1, b2, a1)
  const d2 = lado(b1, b2, a2)
  const d3 = lado(a1, a2, b1)
  const d4 = lado(a1, a2, b2)

  /*
   * O caso geral: cada segmento tem as pontas do outro de lados opostos.
   *
   * Os casos degenerados - pontas exactamente em cima da outra linha - ficam de
   * fora de proposito. Um waypoint a assentar no milimetro sobre o limite de uma
   * zona nao acontece com coordenadas vindas de um KML, e trata-lo obrigava a
   * escolher se o limite conta como dentro ou como fora, que e uma decisao que
   * ninguem tomou.
   */
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Se um troco entre dois waypoints toca numa zona: entra, sai, ou atravessa. */
export function trocoTocaNaZona(de: LatLon, para: LatLon, contorno: readonly LatLon[]): boolean {
  if (contorno.length < 3) return false
  if (dentroDoContorno(de, contorno) || dentroDoContorno(para, contorno)) return true

  // Um troco pode atravessar de lado a lado sem que nenhuma ponta caia dentro.
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]
    const b = contorno[(i + 1) % contorno.length]
    if (a && b && segmentosCruzam(de, para, a, b)) return true
  }

  return false
}

export type Incursao = {
  /** Indice do waypoint onde comeca o troco que entra na zona. */
  indice: number
  nomeDaZona: string
}

/**
 * Onde e que a rota entra em zonas interditas.
 *
 * Devolve uma entrada por troco e por zona. Um troco que atravesse duas zonas
 * da duas entradas, de proposito: sao dois problemas e resolvem-se em separado.
 *
 * O ultimo waypoint conta tambem, sozinho: uma rota que acabe dentro de uma
 * zona e um problema mesmo sem troco a seguir.
 */
export function incursoes(
  waypoints: readonly LatLon[],
  zonas: readonly Area[],
): Incursao[] {
  const encontradas: Incursao[] = []
  if (zonas.length === 0 || waypoints.length === 0) return encontradas

  for (const zona of zonas) {
    for (let i = 0; i < waypoints.length; i++) {
      const aqui = waypoints[i]
      const seguinte = waypoints[i + 1]
      if (!aqui) continue

      const toca = seguinte
        ? trocoTocaNaZona(aqui, seguinte, zona.contorno)
        : dentroDoContorno(aqui, zona.contorno)

      if (toca) encontradas.push({ indice: i, nomeDaZona: zona.nome })
    }
  }

  return encontradas
}

/** As areas que sao zonas interditas. As outras sao so referencia. */
export function zonasInterditas(areas: readonly Area[] | undefined): Area[] {
  return (areas ?? []).filter((area) => area.tipo === 'exclusao')
}

/** As areas de referencia, que e o que uma area e quando nao se diz o contrario. */
export function areasDeReferencia(areas: readonly Area[] | undefined): Area[] {
  return (areas ?? []).filter((area) => area.tipo !== 'exclusao')
}
