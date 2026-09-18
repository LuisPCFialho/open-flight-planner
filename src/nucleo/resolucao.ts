import type { Camara } from './tipos.ts'

/**
 * Resolucao no terreno: quantos centimetros de chao cabem num pixel da foto.
 *
 * E este o numero que decide se um levantamento serve, e nao a altura de voo.
 * Duas camaras a oitenta metros dao a mesma faixa e resolucoes muito
 * diferentes; e a mesma camara a oitenta metros da metade da resolucao que da a
 * quarenta. Quem escreve um caderno de encargos escreve centimetros por pixel.
 *
 * Fica a parte do modulo da cobertura de proposito: depende da camara e da
 * faixa, e nao do tracado das passagens.
 */

/**
 * Largura do sensor em pixeis, a partir dos megapixeis e da proporcao.
 *
 * Os catalogos dao megapixeis e proporcao, nao a contagem por lado. Com uma
 * area de `MP` e uma razao `p` entre os lados, a largura e a raiz de `MP x p` -
 * cinquenta megapixeis em 4:3 dao 8165 por 6124.
 *
 * `null` quando a camara nao traz os megapixeis. E o caso da maior parte dos
 * aparelhos desta lista, e vale mais nao dizer nada do que dizer um numero
 * inventado.
 */
export function pixeisNaLargura(camara: Camara): number | null {
  const megapixeis = camara.megapixeis
  const proporcao = camara.proporcao
  if (!(megapixeis !== undefined && megapixeis > 0)) return null
  if (!(proporcao !== undefined && proporcao > 0)) return null

  return Math.round(Math.sqrt(megapixeis * 1e6 * proporcao))
}

/**
 * Centimetros de terreno por pixel, dada a largura que a foto cobre.
 *
 * `null` quando a camara nao permite a conta - sem megapixeis nao ha resolucao
 * que se calcule.
 */
export function resolucaoNoTerreno(camara: Camara, larguraDaFaixa: number): number | null {
  const pixeis = pixeisNaLargura(camara)
  if (pixeis === null || !(larguraDaFaixa > 0)) return null

  return (larguraDaFaixa / pixeis) * 100
}

/**
 * Altura acima do solo que da uma resolucao pedida, em metros.
 *
 * E a pergunta ao contrario, e e a que se faz primeiro: o caderno de encargos
 * diz os centimetros por pixel e o que falta saber e a que altura se voa.
 */
export function alturaParaResolucao(
  camara: Camara,
  centimetrosPorPixel: number,
  fovGraus: number,
): number | null {
  const pixeis = pixeisNaLargura(camara)
  if (pixeis === null || !(centimetrosPorPixel > 0)) return null
  if (!(fovGraus > 0) || fovGraus >= 180) return null

  const larguraDesejada = (centimetrosPorPixel / 100) * pixeis
  return larguraDesejada / (2 * Math.tan((fovGraus * Math.PI) / 360))
}
