import { useEffect, useRef, useState } from 'react'
import { aoMudar } from './mudancas.ts'

/**
 * Le do armazem e volta a ler quando alguma coisa muda.
 *
 * Substitui o `useLiveQuery` do Dexie, que so servia um dos dois armazens. A
 * consulta corre a montagem, sempre que as dependencias mudam, e sempre que uma
 * escrita se anuncia em `mudancas.ts`.
 *
 * As respostas fora de ordem sao descartadas. Sem isso, uma consulta lenta que
 * volte depois de uma rapida escreve por cima dela, e o ecra fica a mostrar o
 * estado anterior sem nada que o indique - o pior tipo de defeito, porque
 * parece que a escrita se perdeu.
 */
export function useConsulta<T>(
  consulta: () => Promise<T>,
  dependencias: readonly unknown[],
): { dados: T | undefined; erro: string | null } {
  const [dados, setDados] = useState<T | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)

  const actual = useRef(consulta)
  actual.current = consulta

  /** Numero do pedido em curso. Só o último manda no que fica no ecrã. */
  const pedido = useRef(0)

  useEffect(() => {
    let vivo = true

    const perguntar = (): void => {
      const meu = ++pedido.current
      actual
        .current()
        .then((resposta) => {
          if (!vivo || meu !== pedido.current) return
          setDados(resposta)
          setErro(null)
        })
        .catch((causa: unknown) => {
          if (!vivo || meu !== pedido.current) return
          setErro(causa instanceof Error ? causa.message : 'falha a ler os dados')
        })
    }

    perguntar()
    const largar = aoMudar(perguntar)

    return () => {
      vivo = false
      largar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)

  return { dados, erro }
}
