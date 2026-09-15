import { useCallback, useMemo, useState } from 'react'
import type { Rota } from '../nucleo/tipos.ts'
import {
  desfazer as desfazerHistorico,
  historicoInicial,
  podeDesfazer as podeDesfazerHistorico,
  podeRefazer as podeRefazerHistorico,
  refazer as refazerHistorico,
  registar,
  substituir,
  type Historico,
} from './historico.ts'

/**
 * Estado da rota em edicao, com desfazer e refazer.
 *
 * `aplicar` com `comPasso` a falso substitui o presente sem criar um passo no
 * historico. E o que serve o arrastar continuo de um waypoint: o passo fica
 * registado quando o rato e largado, nao a cada pixel de movimento.
 */
export type EditorRota = {
  rota: Rota | null
  aplicar: (transformacao: (atual: Rota) => Rota, comPasso?: boolean) => void
  alterarRota: (alteracao: Partial<Rota>) => void
  carregar: (rota: Rota) => void
  desfazer: () => void
  refazer: () => void
  podeDesfazer: boolean
  podeRefazer: boolean
}

export function useEditorRota(): EditorRota {
  const [historico, setHistorico] = useState<Historico<Rota> | null>(null)

  const aplicar = useCallback((transformacao: (atual: Rota) => Rota, comPasso = true) => {
    setHistorico((anterior) => {
      if (!anterior) return anterior
      const nova = transformacao(anterior.presente)
      return comPasso ? registar(anterior, nova) : substituir(anterior, nova)
    })
  }, [])

  const alterarRota = useCallback(
    (alteracao: Partial<Rota>) => {
      aplicar((atual) => ({ ...atual, ...alteracao }))
    },
    [aplicar],
  )

  const carregar = useCallback((rota: Rota) => setHistorico(historicoInicial(rota)), [])
  const desfazer = useCallback(() => setHistorico((a) => (a ? desfazerHistorico(a) : a)), [])
  const refazer = useCallback(() => setHistorico((a) => (a ? refazerHistorico(a) : a)), [])

  /*
   * O objecto e memoizado de proposito. Devolver um literal novo a cada render
   * faz com que qualquer `useEffect` que dependa do editor volte a correr sempre,
   * e um efeito de arranque que carregue a rota da base de dados passa a apagar
   * todas as alteracoes assim que sao feitas.
   */
  return useMemo(
    () => ({
      rota: historico?.presente ?? null,
      aplicar,
      alterarRota,
      carregar,
      desfazer,
      refazer,
      podeDesfazer: historico ? podeDesfazerHistorico(historico) : false,
      podeRefazer: historico ? podeRefazerHistorico(historico) : false,
    }),
    [historico, aplicar, alterarRota, carregar, desfazer, refazer],
  )
}
