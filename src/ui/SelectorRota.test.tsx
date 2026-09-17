import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Rota } from '../nucleo/tipos.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { SelectorRota } from './SelectorRota.tsx'

/**
 * Escolher a rota dentro do projeto.
 *
 * O que aqui importa nao e a consulta a base de dados - essa e do Dexie e ja se
 * verifica noutro sitio. E o resto: qual a rota que fica escolhida, quando e que
 * apagar esta ao alcance, e o que a pergunta de confirmacao diz. Apagar nao tem
 * desfazer, e e a unica coisa nesta ferramenta que nao tem.
 */

/*
 * A consulta a base de dados e substituida.
 *
 * Levantar uma IndexedDB de mentira so para o componente listar nomes trocava um
 * teste do componente por um teste do Dexie, mais lento e a dizer menos.
 */
const rotasDoProjeto = vi.hoisted(() => ({ actual: undefined as Rota[] | undefined }))

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => rotasDoProjeto.actual,
}))

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

function rota(nome: string, waypoints = 0): Rota {
  let r = rotaVazia({ nome, projetoId: 'p', droneId: 'mini5pro', pontoDescolagem: DESCOLAGEM })
  r = { ...r, id: nome }
  for (let i = 0; i < waypoints; i++) {
    r = acrescentarWaypoint(
      r,
      waypointNovo({ lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon, altura: 60, index: i }),
    )
  }
  return r
}

function montar(aberta: Rota, todas: Rota[] | undefined = [aberta]) {
  rotasDoProjeto.actual = todas

  const acoes = {
    aoAbrir: vi.fn<(id: string) => void>(),
    aoCriar: vi.fn<() => void>(),
    aoDuplicar: vi.fn<() => void>(),
    aoApagar: vi.fn<() => void>(),
    aoRenomear: vi.fn<(nome: string) => void>(),
  }

  render(<SelectorRota rota={aberta} {...acoes} />)
  return acoes
}

let confirmar: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  rotasDoProjeto.actual = undefined
})

describe('lista de rotas', () => {
  it('mostra as rotas do projeto, com a aberta escolhida', () => {
    const aberta = rota('campanha 2')
    montar(aberta, [rota('campanha 1'), aberta, rota('campanha 3')])

    const lista = screen.getByTitle('Rotas deste projeto')
    expect(lista).toHaveValue('campanha 2')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('cada rota diz quantos waypoints leva', () => {
    // E o que distingue uma rota trabalhada de uma que ainda esta vazia.
    montar(rota('com pontos', 12), [rota('com pontos', 12)])
    expect(screen.getByRole('option', { name: 'com pontos (12)' })).toBeInTheDocument()
  })

  it('uma rota vazia nao mostra contagem nenhuma', () => {
    // `(0)` seria ruido: o que interessa dizer e que ainda nao tem nada.
    montar(rota('vazia'), [rota('vazia')])
    expect(screen.getByRole('option', { name: 'vazia' })).toBeInTheDocument()
  })

  it('enquanto a consulta nao responde mostra-se a rota aberta', () => {
    /*
     * A consulta a base de dados demora um instante. Sem isto, a lista nascia
     * vazia e a caixa aparecia em branco a cada abertura de projeto.
     */
    const aberta = rota('unica')
    montar(aberta, undefined)

    expect(screen.getByTitle('Rotas deste projeto')).toHaveValue('unica')
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('escolher outra rota pede para a abrir', async () => {
    const aberta = rota('primeira')
    const { aoAbrir } = montar(aberta, [aberta, rota('segunda')])

    await userEvent.selectOptions(screen.getByTitle('Rotas deste projeto'), 'segunda')
    expect(aoAbrir).toHaveBeenCalledWith('segunda')
  })
})

describe('criar e duplicar', () => {
  it('os dois botoes pedem o que dizem', async () => {
    const { aoCriar, aoDuplicar } = montar(rota('a'))

    await userEvent.click(screen.getByRole('button', { name: 'Nova' }))
    expect(aoCriar).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Duplicar' }))
    expect(aoDuplicar).toHaveBeenCalledTimes(1)
  })
})

describe('apagar', () => {
  it('com uma rota so, apagar esta travado', () => {
    // Um projeto sem rota nenhuma nao e estado que valha a pena poder alcancar.
    montar(rota('unica'), [rota('unica')])
    expect(screen.getByTitle('Apagar esta rota')).toBeDisabled()
  })

  it('com duas ou mais ja se pode apagar', () => {
    const aberta = rota('a')
    montar(aberta, [aberta, rota('b')])
    expect(screen.getByTitle('Apagar esta rota')).toBeEnabled()
  })

  it('pergunta antes, e diz quantos waypoints leva', async () => {
    /*
     * Apagar uma rota nao tem desfazer, ao contrario de tudo o resto. A pergunta
     * tem de dizer o que se perde, e nao so o nome.
     */
    const aberta = rota('cobertura', 291)
    const { aoApagar } = montar(aberta, [aberta, rota('outra')])

    await userEvent.click(screen.getByTitle('Apagar esta rota'))

    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('291 waypoints'))
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Não há desfazer'))
    expect(aoApagar).toHaveBeenCalledTimes(1)
  })

  it('um waypoint so escreve-se no singular', async () => {
    const aberta = rota('quase vazia', 1)
    montar(aberta, [aberta, rota('outra')])

    await userEvent.click(screen.getByTitle('Apagar esta rota'))
    expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('1 waypoint.'))
  })

  it('uma rota vazia nao assusta ninguem com contagens', async () => {
    const aberta = rota('vazia')
    montar(aberta, [aberta, rota('outra')])

    await userEvent.click(screen.getByTitle('Apagar esta rota'))
    expect(confirmar).toHaveBeenCalledWith('Apagar "vazia"?')
  })

  it('dizer que nao deixa a rota em paz', async () => {
    confirmar.mockReturnValue(false)
    const aberta = rota('a', 5)
    const { aoApagar } = montar(aberta, [aberta, rota('b')])

    await userEvent.click(screen.getByTitle('Apagar esta rota'))
    expect(aoApagar).not.toHaveBeenCalled()
  })
})

describe('renomear', () => {
  it('abre um campo com o nome que la esta', async () => {
    montar(rota('nome antigo'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))

    expect(screen.getByRole('textbox')).toHaveValue('nome antigo')
  })

  it('Enter confirma o nome novo', async () => {
    const { aoRenomear } = montar(rota('antigo'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))

    const campo = screen.getByRole('textbox')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Sever do Vouga{Enter}')

    expect(aoRenomear).toHaveBeenCalledWith('Sever do Vouga')
  })

  it('Escape desiste sem mudar nada', async () => {
    const { aoRenomear } = montar(rota('antigo'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))

    const campo = screen.getByRole('textbox')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'a deitar fora{Escape}')

    expect(aoRenomear).not.toHaveBeenCalled()
    expect(screen.getByTitle('Rotas deste projeto')).toBeInTheDocument()
  })

  it('um nome so com espacos nao serve', async () => {
    // Uma rota sem nome nao se distingue das outras na lista.
    const { aoRenomear } = montar(rota('antigo'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))

    const campo = screen.getByRole('textbox')
    await userEvent.clear(campo)
    await userEvent.type(campo, '   ')
    await userEvent.tab()

    expect(aoRenomear).not.toHaveBeenCalled()
  })

  it('o mesmo nome nao gasta um passo do historico', async () => {
    const { aoRenomear } = montar(rota('igual'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    await userEvent.tab()

    expect(aoRenomear).not.toHaveBeenCalled()
  })

  it('os espacos das pontas somem', async () => {
    const { aoRenomear } = montar(rota('antigo'))
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }))

    const campo = screen.getByRole('textbox')
    await userEvent.clear(campo)
    await userEvent.type(campo, '  com espacos  {Enter}')

    expect(aoRenomear).toHaveBeenCalledWith('com espacos')
  })
})
