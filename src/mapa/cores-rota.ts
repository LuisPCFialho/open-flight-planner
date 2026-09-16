/**
 * A cor da rota diz a que altura do solo ela passa.
 *
 * Antes eram duas cores: verde, e vermelho quando algum ponto saia do
 * intervalo. Isso responde "ha problema ou nao", mas nao responde ao que se
 * pergunta a olhar para uma rota sobre relevo - de que lado do limite se esta, e
 * com quanta folga. Uma rota que passe a 32 m com o minimo em 30 esta legal e
 * esta a um metro de deixar de estar; a duas cores, lia-se igual a uma que
 * passasse a 80.
 *
 * O criterio: vermelho fora do intervalo, ambar junto a qualquer das pontas, e
 * verde no meio, que e onde se quer voar.
 */

export type Cor = readonly [number, number, number, number]

export const VERDE: Cor = [0.31, 0.85, 0.45, 1]
export const AMBAR: Cor = [0.94, 0.71, 0.16, 1]
export const VERMELHO: Cor = [0.95, 0.35, 0.3, 1]

/**
 * Que fraccao de cada ponta do intervalo se considera "junto ao limite".
 *
 * Com o intervalo habitual de 30 a 120 m, os 15% dao ambar abaixo dos 43 m e
 * acima dos 106 m. Sao folgas de uma dezena de metros, que e a ordem de grandeza
 * do erro do modelo de terreno: e mesmo ali que convem olhar duas vezes.
 */
const MARGEM = 0.15

function misturar(de: Cor, para: Cor, t: number): Cor {
  const f = Math.max(0, Math.min(1, t))
  return [
    de[0] + (para[0] - de[0]) * f,
    de[1] + (para[1] - de[1]) * f,
    de[2] + (para[2] - de[2]) * f,
    de[3] + (para[3] - de[3]) * f,
  ]
}

/**
 * Cor para uma altura acima do solo, dado o intervalo aceite.
 *
 * `null` e para quando a cota do terreno ainda nao chegou: nessa altura nao se
 * sabe a que altura do solo se esta, e dizer verde seria mentir.
 */
export function corPorAlturaAcimaDoSolo(
  acimaDoSolo: number | null,
  intervalo: { minimo: number; maximo: number },
): Cor {
  if (acimaDoSolo === null || !Number.isFinite(acimaDoSolo)) return AMBAR

  const { minimo, maximo } = intervalo
  if (acimaDoSolo < minimo || acimaDoSolo > maximo) return VERMELHO

  const largura = maximo - minimo
  // Um intervalo degenerado nao tem meio: fica-se pelo limite.
  if (!(largura > 0)) return AMBAR

  const t = (acimaDoSolo - minimo) / largura
  if (t < MARGEM) return misturar(AMBAR, VERDE, t / MARGEM)
  if (t > 1 - MARGEM) return misturar(VERDE, AMBAR, (t - (1 - MARGEM)) / MARGEM)
  return VERDE
}

/** Cor de um troço, que vale o pior dos seus dois extremos. */
export function corDoTroco(
  de: number | null,
  para: number | null,
  intervalo: { minimo: number; maximo: number },
): Cor {
  const corDe = corPorAlturaAcimaDoSolo(de, intervalo)
  const corPara = corPorAlturaAcimaDoSolo(para, intervalo)
  // Quanto mais vermelho, pior: basta um extremo mau para o troço merecer aviso.
  return gravidade(corDe) >= gravidade(corPara) ? corDe : corPara
}

/** Quao longe do verde esta uma cor, de 0 a 1. Serve para escolher a pior. */
function gravidade(cor: Cor): number {
  return Math.hypot(cor[0] - VERDE[0], cor[1] - VERDE[1], cor[2] - VERDE[2])
}
