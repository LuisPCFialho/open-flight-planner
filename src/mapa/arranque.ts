/**
 * Ligar o estilo ao mapa, e instalar as nossas camadas quando ele estiver de pe.
 *
 * Isto vive fora do componente porque e a parte que ja falhou, e falhou de uma
 * maneira que nenhum teste apanhava: a versao construida nascia com a ortofoto e
 * mais nada - sem rota, sem areas, sem marcadores - e sem erro nenhum. Em
 * desenvolvimento nunca acontecia.
 *
 * Eram duas coisas, e as duas sao invariantes que se podem verificar sem mapa
 * nenhum:
 *
 * 1. **Subscrever antes de aplicar o estilo.** O `load` de um mapa a que se
 *    troca o estilo logo a seguir pode passar antes de alguem estar a ouvir, e
 *    nao volta. Sem minificacao a subscricao chegava sempre a tempo; construido,
 *    nao chegava.
 *
 * 2. **Nao deixar sair a excepcao.** Enquanto o estilo nao esta pronto,
 *    `addSource` atira "Style is not done loading". Se essa excepcao sobe, o
 *    React desmonta o componente e o que fica e a aplicacao sem mapa nenhum -
 *    pior do que com um mapa incompleto. Apanha-se e tenta-se no aviso seguinte.
 */

/** O pouco do mapa de que o arranque precisa. Serve para o poder verificar. */
export type MapaDoArranque = {
  on: (evento: string, ouvinte: () => void) => unknown
  setStyle: (estilo: never) => unknown
}

/** Eventos que podem trazer o estilo pronto. */
export const EVENTOS_DE_ESTILO = ['load', 'styledata'] as const

export function ligarEstilo<E>(
  mapa: MapaDoArranque,
  estilo: E,
  instalar: () => void,
): void {
  let instalado = false

  const tentar = (): void => {
    if (instalado) return
    try {
      instalar()
      instalado = true
    } catch {
      // O estilo ainda nao estava de pe. Tenta-se no aviso seguinte.
    }
  }

  for (const evento of EVENTOS_DE_ESTILO) mapa.on(evento, tentar)
  mapa.setStyle(estilo as never)
}
