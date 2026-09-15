import { useEffect, useRef, useState } from 'react'
import type { LatLon } from '../nucleo/tipos.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'

/**
 * Resolve as cotas do terreno na vertical de cada ponto.
 *
 * As cotas chegam de forma assincrona e ficam em cache por posicao, com seis
 * casas decimais, que sao cerca de 10 cm. Enquanto uma cota nao chegar o ponto
 * nao aparece em 3D, o que e preferivel a mostra-lo na cota errada.
 */
export function chaveDaPosicao(ponto: LatLon): string {
  return `${ponto.lat.toFixed(6)},${ponto.lon.toFixed(6)}`
}

export function useCotasTerreno(
  pontos: readonly LatLon[],
  fonte: FonteTerreno,
): { cotas: ReadonlyMap<string, number>; aCarregar: boolean; erro: string | null } {
  const [cotas, setCotas] = useState<ReadonlyMap<string, number>>(new Map())
  const [emCurso, setEmCurso] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  /** Posicoes ja pedidas, para nao repetir enquanto a resposta nao chega. */
  const pedidas = useRef(new Set<string>())
  /**
   * O cancelamento e por desmontagem do componente, nao por execucao do efeito.
   * Cancelar a cada execucao descartaria as cotas de um pedido em curso sempre
   * que se acrescentasse um waypoint, e como as posicoes ja estavam marcadas
   * como pedidas nunca mais seriam resolvidas.
   */
  const montado = useRef(true)
  /**
   * Conta as trocas de fonte.
   *
   * Importar topografia enquanto os mosaicos publicos ainda estao a responder
   * punha a resposta antiga, de dezenas de metros de resolucao, a escrever por
   * cima da cota do levantamento que acabara de chegar. Nada aparecia errado no
   * ecra: a cota ficava so silenciosamente pior, e e dela que dependem o AGL e a
   * deteccao de colisao.
   */
  const geracao = useRef(0)
  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  /*
   * Trocar de fonte, por exemplo ao importar topografia, invalida tudo o que ja
   * foi lido: as mesmas coordenadas passam a ter outra cota, mais precisa. Sem
   * isto a rota ficava com as cotas antigas ate alguem lhe mexer.
   */
  useEffect(() => {
    geracao.current += 1
    pedidas.current.clear()
    setCotas(new Map())
  }, [fonte])

  useEffect(() => {
    const emFalta = new Map<string, LatLon>()
    for (const ponto of pontos) {
      const chave = chaveDaPosicao(ponto)
      if (!pedidas.current.has(chave)) emFalta.set(chave, ponto)
    }
    if (emFalta.size === 0) return

    for (const chave of emFalta.keys()) pedidas.current.add(chave)
    const chaves = [...emFalta.keys()]
    const minhaGeracao = geracao.current
    setEmCurso((n) => n + 1)

    Promise.all([...emFalta.values()].map((p) => fonte.cota(p.lat, p.lon)))
      .then((valores) => {
        if (!montado.current || geracao.current !== minhaGeracao) return
        setCotas((anteriores) => {
          const novas = new Map(anteriores)
          for (const [i, chave] of chaves.entries()) {
            const valor = valores[i]
            if (valor !== undefined) novas.set(chave, valor)
          }
          return novas
        })
        setErro(null)
      })
      .catch((causa: unknown) => {
        // Sem cache do falhanco: uma quebra de rede nao pode deixar o ponto sem cota para sempre.
        if (geracao.current === minhaGeracao) {
          for (const chave of chaves) pedidas.current.delete(chave)
        }
        if (!montado.current || geracao.current !== minhaGeracao) return
        setErro(causa instanceof Error ? causa.message : 'falha a obter cotas do terreno')
      })
      .finally(() => {
        if (montado.current) setEmCurso((n) => n - 1)
      })
  }, [pontos, fonte])

  return { cotas, aCarregar: emCurso > 0, erro }
}
