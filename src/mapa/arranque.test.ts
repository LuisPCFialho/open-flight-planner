import { describe, it, expect } from 'vitest'
import { EVENTOS_DE_ESTILO, ligarEstilo, type MapaDoArranque } from './arranque.ts'

/** Mapa de mentira que regista a ordem das chamadas e dispara eventos a pedido. */
function mapaFalso() {
  const ordem: string[] = []
  const ouvintes = new Map<string, (() => void)[]>()

  const mapa: MapaDoArranque = {
    on(evento, ouvinte) {
      ordem.push(`on:${evento}`)
      ouvintes.set(evento, [...(ouvintes.get(evento) ?? []), ouvinte])
    },
    setStyle() {
      ordem.push('setStyle')
    },
  }

  return {
    mapa,
    ordem,
    disparar(evento: string) {
      for (const ouvinte of ouvintes.get(evento) ?? []) ouvinte()
    },
  }
}

describe('arranque do estilo', () => {
  it('subscreve antes de aplicar o estilo', () => {
    /*
     * Este e o defeito que fez a versao construida nascer com o mapa vazio. O
     * `load` de um mapa a que se troca o estilo logo a seguir pode passar antes
     * de alguem estar a ouvir, e nao volta.
     */
    const { mapa, ordem } = mapaFalso()
    ligarEstilo(mapa, {}, () => {})

    const aplicou = ordem.indexOf('setStyle')
    for (const evento of EVENTOS_DE_ESTILO) {
      expect(ordem.indexOf(`on:${evento}`)).toBeLessThan(aplicou)
    }
  })

  it('nao instala nada so por ligar', () => {
    let vezes = 0
    const { mapa } = mapaFalso()
    ligarEstilo(mapa, {}, () => vezes++)
    expect(vezes).toBe(0)
  })

  it('instala quando o estilo chega', () => {
    let vezes = 0
    const { mapa, disparar } = mapaFalso()
    ligarEstilo(mapa, {}, () => vezes++)

    disparar('load')
    expect(vezes).toBe(1)
  })

  it('o styledata tambem serve, e e ele que salva quando o load ja passou', () => {
    let vezes = 0
    const { mapa, disparar } = mapaFalso()
    ligarEstilo(mapa, {}, () => vezes++)

    disparar('styledata')
    expect(vezes).toBe(1)
  })

  it('instala uma so vez, por mais avisos que venham', () => {
    let vezes = 0
    const { mapa, disparar } = mapaFalso()
    ligarEstilo(mapa, {}, () => vezes++)

    disparar('load')
    disparar('styledata')
    disparar('styledata')
    expect(vezes).toBe(1)
  })

  it('uma tentativa que rebenta nao sai daqui para fora', () => {
    /*
     * `addSource` atira "Style is not done loading" enquanto o estilo nao esta
     * pronto. Se a excepcao sobe, o React desmonta o componente e fica-se sem
     * mapa nenhum - pior do que com um mapa incompleto.
     */
    const { mapa, disparar } = mapaFalso()
    ligarEstilo(mapa, {}, () => {
      throw new Error('Style is not done loading.')
    })
    expect(() => disparar('styledata')).not.toThrow()
  })

  it('tenta outra vez depois de rebentar, e acaba por instalar', () => {
    let tentativas = 0
    const { mapa, disparar } = mapaFalso()
    ligarEstilo(mapa, {}, () => {
      tentativas++
      if (tentativas < 3) throw new Error('Style is not done loading.')
    })

    disparar('styledata')
    disparar('styledata')
    disparar('styledata')
    disparar('styledata')

    // Tres tentativas ate passar, e nem mais uma depois de ter passado.
    expect(tentativas).toBe(3)
  })
})
