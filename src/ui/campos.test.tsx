import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CampoNumerico } from './campos.tsx'
import { VARIOS } from '../nucleo/edicao-lote.ts'

/**
 * O campo numerico e o sitio por onde passa quase tudo o que se edita numa rota:
 * altura, velocidade, inclinacao, rumo. Os limites que ele impoe sao a ultima
 * defesa antes de um valor impossivel chegar ao ficheiro exportado.
 */

describe('campo numerico', () => {
  it('escrever um valor dentro dos limites passa tal e qual', async () => {
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Altura" valor={60} min={5} max={120} aoAlterar={aoAlterar} />)

    const entrada = screen.getByLabelText('Altura')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '90{Enter}')

    expect(aoAlterar).toHaveBeenCalledWith(90)
  })

  it('a virgula serve de separador decimal', async () => {
    /* O teclado portugues tem virgula no bloco numerico, e ninguem escreve ponto. */
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Velocidade" valor={5} casas={1} aoAlterar={aoAlterar} />)

    const entrada = screen.getByLabelText('Velocidade')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '7,5{Enter}')

    expect(aoAlterar).toHaveBeenCalledWith(7.5)
  })

  it('escrever acima do maximo fica pelo maximo', async () => {
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Altura" valor={60} min={5} max={120} aoAlterar={aoAlterar} />)

    const entrada = screen.getByLabelText('Altura')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '500{Enter}')

    expect(aoAlterar).toHaveBeenCalledWith(120)
  })

  it('os botoes de incremento tambem respeitam o minimo', async () => {
    /*
     * Este e o defeito que o comentario do componente descreve e que nunca teve
     * teste: com o minimo da velocidade em 0,5 m/s, bastava carregar em -10 duas
     * vezes para a por a zero. Dai em diante a duracao estimada saia infinita e
     * a exportacao para o dialeto Pilot 2 rebentava.
     */
    const aoAlterar = vi.fn()
    render(
      <CampoNumerico
        rotulo="Velocidade"
        valor={5}
        min={0.5}
        max={15}
        casas={1}
        incrementos={[10, 1]}
        aoAlterar={aoAlterar}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '-10' }))
    expect(aoAlterar).toHaveBeenCalledWith(0.5)
  })

  it('as setas do teclado tambem respeitam o maximo', async () => {
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Altura" valor={120} min={5} max={120} aoAlterar={aoAlterar} />)

    await userEvent.click(screen.getByLabelText('Altura'))
    await userEvent.keyboard('{ArrowUp}')

    expect(aoAlterar).toHaveBeenCalledWith(120)
  })

  it('texto que nao e numero nao altera nada e o campo volta ao que estava', async () => {
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Altura" valor={60} aoAlterar={aoAlterar} />)

    const entrada = screen.getByLabelText('Altura')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, 'abc{Enter}')

    expect(aoAlterar).not.toHaveBeenCalled()
    expect(entrada).toHaveValue('60')
  })

  it('com valores divergentes o campo aparece vazio e nao nivela ninguem', () => {
    /*
     * A regra vem do Pilot 2: com tres waypoints de alturas diferentes
     * seleccionados, um campo que mostrasse a altura do primeiro nivelava os
     * outros dois sem ninguem pedir.
     */
    const aoAlterar = vi.fn()
    render(<CampoNumerico rotulo="Altura" valor={VARIOS} aoAlterar={aoAlterar} />)

    expect(screen.getByLabelText(/Altura/)).toHaveValue('')
    expect(screen.getByText('Vários valores')).toBeInTheDocument()
    expect(aoAlterar).not.toHaveBeenCalled()
  })

  it('com valores divergentes o incremento soma a cada um em vez de igualar', async () => {
    const aoAlterar = vi.fn()
    const aoIncrementar = vi.fn()
    render(
      <CampoNumerico
        rotulo="Altura"
        valor={VARIOS}
        incrementos={[10]}
        aoAlterar={aoAlterar}
        aoIncrementar={aoIncrementar}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '+10' }))
    expect(aoIncrementar).toHaveBeenCalledWith(10)
    expect(aoAlterar).not.toHaveBeenCalled()
  })

  it('desactivado nao deixa mexer por caminho nenhum', async () => {
    const aoAlterar = vi.fn()
    render(
      <CampoNumerico
        rotulo="Altura"
        valor={60}
        incrementos={[10]}
        desactivado
        aoAlterar={aoAlterar}
      />,
    )

    expect(screen.getByLabelText('Altura')).toBeDisabled()
    expect(screen.getByRole('button', { name: '+10' })).toBeDisabled()
  })
})
