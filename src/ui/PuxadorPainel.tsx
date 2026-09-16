import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A borda de um painel lateral, para se arrastar e mudar a largura.
 *
 * A largura fica guardada no posto de trabalho: quem trabalha com listas
 * grandes quer a lista larga, quem acerta ângulos quer as propriedades largas,
 * e ninguém quer voltar a arrastar de cada vez que abre a ferramenta.
 */

export const LARGURA_MINIMA = 160
export const LARGURA_MAXIMA = 620

function limitar(valor: number): number {
  return Math.max(LARGURA_MINIMA, Math.min(LARGURA_MAXIMA, Math.round(valor)))
}

/**
 * Largura guardada entre sessões.
 *
 * Em `localStorage` e não na base de dados: é uma preferência do posto de
 * trabalho, não do projeto, e uma leitura que falhe - janela privada, dados do
 * sítio bloqueados - só tem de devolver o valor de origem e seguir.
 */
export function useLarguraPersistida(
  chave: string,
  inicial: number,
): [number, (nova: number) => void] {
  const [largura, setLargura] = useState(() => {
    try {
      const guardado = window.localStorage.getItem(chave)
      const numero = guardado === null ? NaN : Number(guardado)
      return Number.isFinite(numero) ? limitar(numero) : inicial
    } catch {
      return inicial
    }
  })

  const alterar = useCallback(
    (nova: number) => {
      const limitada = limitar(nova)
      setLargura(limitada)
      try {
        window.localStorage.setItem(chave, String(limitada))
      } catch {
        // Sem espaço ou sem permissão: a largura vale para esta sessão e basta.
      }
    },
    [chave],
  )

  return [largura, alterar]
}

type Props = {
  /** De que lado do mapa está o painel, que decide o sentido do arrasto. */
  lado: 'esquerda' | 'direita'
  largura: number
  aoRedimensionar: (nova: number) => void
  rotulo: string
}

export function PuxadorPainel({ lado, largura, aoRedimensionar, rotulo }: Props) {
  const [aArrastar, setAArrastar] = useState(false)
  const inicio = useRef({ x: 0, largura: 0 })

  useEffect(() => {
    if (!aArrastar) return

    const mover = (evento: MouseEvent): void => {
      const andou = evento.clientX - inicio.current.x
      // À esquerda, arrastar para a direita alarga; à direita é ao contrário.
      aoRedimensionar(inicio.current.largura + (lado === 'esquerda' ? andou : -andou))
    }
    const largar = (): void => setAArrastar(false)

    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', largar)
    /*
     * Sem isto, arrastar por cima do mapa ou de uma lista selecciona texto e o
     * cursor fica a piscar entre a seta e a barra enquanto se puxa.
     */
    const estilo = document.body.style
    const cursorAnterior = estilo.cursor
    const seleccaoAnterior = estilo.userSelect
    estilo.cursor = 'col-resize'
    estilo.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', largar)
      estilo.cursor = cursorAnterior
      estilo.userSelect = seleccaoAnterior
    }
  }, [aArrastar, lado, aoRedimensionar])

  return (
    <div
      className={`puxador-painel puxador-${lado}${aArrastar ? ' a-arrastar' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={rotulo}
      aria-valuenow={largura}
      aria-valuemin={LARGURA_MINIMA}
      aria-valuemax={LARGURA_MAXIMA}
      tabIndex={0}
      onMouseDown={(evento) => {
        evento.preventDefault()
        inicio.current = { x: evento.clientX, largura }
        setAArrastar(true)
      }}
      onDoubleClick={() => aoRedimensionar(lado === 'esquerda' ? 240 : 300)}
      onKeyDown={(evento) => {
        // Pelo teclado também: as setas mexem, com shift a passos maiores.
        const passo = evento.shiftKey ? 40 : 8
        if (evento.key === 'ArrowLeft') {
          evento.preventDefault()
          aoRedimensionar(largura + (lado === 'esquerda' ? -passo : passo))
        } else if (evento.key === 'ArrowRight') {
          evento.preventDefault()
          aoRedimensionar(largura + (lado === 'esquerda' ? passo : -passo))
        }
      }}
      title="Arrasta para mudar a largura. Duplo clique repõe."
    />
  )
}
