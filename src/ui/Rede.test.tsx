import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Rede } from './Rede.tsx'

/*
 * O React escreve a excepcao na consola por si, alem do que o
 * `componentDidCatch` la poe. Silencia-se, senao o relatorio dos testes fica
 * cheio de rastos de erros que sao o proprio caso de ensaio a correr bem.
 */
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Rebenta(): never {
  throw new Error('o mapa nao levantou')
}

describe('a rede por baixo da aplicacao', () => {
  it('deixa passar o que nao rebenta', () => {
    render(
      <Rede>
        <p>a aplicação</p>
      </Rede>,
    )
    expect(screen.getByText('a aplicação')).toBeTruthy()
  })

  /*
   * A frase que importa.
   *
   * Diante de um ecra branco, "perdi o trabalho todo" e a conclusao natural e
   * esta errada: os projetos estao na IndexedDB e nao foram tocados. Se algum
   * dia alguem reescrever este ecra, este teste diz que essa frase tem de la
   * continuar.
   */
  it('diz que o trabalho nao se perdeu', () => {
    render(
      <Rede>
        <Rebenta />
      </Rede>,
    )
    expect(screen.getByRole('alert').textContent).toContain('O teu trabalho não se perdeu')
  })

  it('mostra a mensagem da excepcao, para se poder contar', () => {
    render(
      <Rede>
        <Rebenta />
      </Rede>,
    )
    expect(screen.getByRole('alert').textContent).toContain('o mapa nao levantou')
  })

  it('deixa uma copia na consola', () => {
    render(
      <Rede>
        <Rebenta />
      </Rede>,
    )
    const chamadas = vi.mocked(console.error).mock.calls
    expect(chamadas.some((c) => String(c[0]).includes('Open Flight Planner'))).toBe(true)
  })

  it('oferece recarregar', () => {
    render(
      <Rede>
        <Rebenta />
      </Rede>,
    )
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeTruthy()
  })
})
