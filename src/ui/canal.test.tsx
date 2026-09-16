import { describe, it, expect } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { criarCanal, useValorDoCanal, type Canal } from './canal.ts'

/**
 * O canal existe por uma razao so, e e esta: quem escreve nao renderiza a
 * arvore.
 *
 * O defeito que o motivou passou por todos os testes que havia porque nenhum
 * deles montava React nenhum. As coordenadas sob o cursor viviam em `useState`
 * na aplicacao, e cada movimento do rato renderizava o mapa, as listas, os
 * paineis e o perfil para actualizar tres numeros na barra de estado. Com 120
 * waypoints estavam-se a perder 24 fotogramas por segundo nisso.
 *
 * As contas de fotogramas nao se verificam aqui - precisam de um navegador a
 * serio, porque o `requestAnimationFrame` de uma janela tapada e travado a 1 Hz.
 * O que se verifica e a propriedade que as explica: o numero de renders.
 */

/** Um leitor do canal que conta quantas vezes foi renderizado. */
function contador(marca: string) {
  let renders = 0
  return {
    quantos: () => renders,
    Componente({ canal }: { canal: Canal<number> }) {
      renders++
      const valor = useValorDoCanal(canal)
      return <span data-testid={marca}>{valor}</span>
    },
  }
}

describe('canal dentro do React', () => {
  it('escrever renderiza quem le', () => {
    const canal = criarCanal(0)
    render(<Leitor canal={canal} />)

    act(() => canal.escrever(7))
    expect(screen.getByTestId('leitor')).toHaveTextContent('7')
  })

  it('escrever nao renderiza quem esta ao lado', () => {
    /*
     * Este e o defeito, reduzido ao minimo. Com o valor em `useState` do pai,
     * o vizinho renderizava tantas vezes quantas o cursor se mexia - e o vizinho
     * era o mapa.
     */
    const canal = criarCanal(0)
    const outroCanal = criarCanal(0)
    const vizinho = contador('vizinho')

    function Pai() {
      return (
        <>
          <Leitor canal={canal} />
          <vizinho.Componente canal={outroCanal} />
        </>
      )
    }

    render(<Pai />)
    const antes = vizinho.quantos()

    act(() => {
      for (let i = 1; i <= 50; i++) canal.escrever(i)
    })

    expect(vizinho.quantos()).toBe(antes)
    expect(screen.getByTestId('leitor')).toHaveTextContent('50')
  })

  it('um valor igual ao que la estava nao renderiza nada', () => {
    // O cursor parado sobre o mesmo pixel escreve o mesmo par de coordenadas.
    const canal = criarCanal(3)
    const leitor = contador('unico')
    render(<leitor.Componente canal={canal} />)

    const antes = leitor.quantos()
    act(() => canal.escrever(3))
    expect(leitor.quantos()).toBe(antes)
  })

  it('desmontar solta a subscricao', () => {
    /*
     * O canal vive o tempo da aplicacao e o componente monta e desmonta sempre
     * que o painel abre e fecha. Um ouvinte que nao se solta e uma fuga, e a
     * partir dai cada movimento do rato avisa componentes que ja nao existem.
     */
    const canal = criarCanal(0)
    let ouvintes = 0
    const subscreverContado = (aviso: () => void) => {
      ouvintes++
      const largar = canal.subscrever(aviso)
      return () => {
        ouvintes--
        largar()
      }
    }

    const { unmount } = render(
      <Leitor canal={{ ...canal, subscrever: subscreverContado }} />,
    )
    expect(ouvintes).toBe(1)

    unmount()
    expect(ouvintes).toBe(0)
  })

  it('o canal sobrevive ao render do pai', () => {
    /*
     * `useCanal` guarda o canal num `useMemo` sem dependencias de proposito. Um
     * canal substituido a meio deixava os subscritores ligados a um canal morto:
     * a leitura congelava e ninguem percebia porque.
     */
    const canal = criarCanal(0)
    function Pai() {
      const [n, setN] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>
            outra vez
          </button>
          <Leitor canal={canal} />
          <span data-testid="pai">{n}</span>
        </>
      )
    }

    render(<Pai />)
    act(() => canal.escrever(4))
    screen.getByRole('button').click()
    act(() => canal.escrever(5))

    expect(screen.getByTestId('leitor')).toHaveTextContent('5')
  })
})

function Leitor({ canal }: { canal: Canal<number> }) {
  return <span data-testid="leitor">{useValorDoCanal(canal)}</span>
}
