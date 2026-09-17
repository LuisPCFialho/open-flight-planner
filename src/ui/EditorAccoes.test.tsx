import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Accao, Waypoint } from '../nucleo/tipos.ts'
import { droneComId } from '../drones.ts'
import { waypointNovo } from '../nucleo/operacoes-rota.ts'
import { EditorAccoes } from './EditorAccoes.tsx'

/**
 * A lista de accoes de um waypoint.
 *
 * E a parte da interface que decide o que o aparelho faz quando la chega, e a
 * que tem mais maneiras de sair errada em silencio: uma accao que o aparelho nao
 * suporta, uma ordem trocada, um parametro fora dos limites que o exportador
 * aceita e o aparelho recusa.
 */

const MINI = droneComId('mini5pro')
const MAVIC = droneComId('mavic3t')

function waypointCom(acoes: Accao[]): Waypoint {
  return {
    ...waypointNovo({ lat: 40.746552, lon: -8.41061, altura: 60, index: 0 }),
    acoes,
  }
}

function montar(sobrepor: Partial<Parameters<typeof EditorAccoes>[0]> = {}) {
  const aoAcrescentar = vi.fn()
  const aoAlterar = vi.fn()
  const aoRemover = vi.fn()
  const aoMover = vi.fn()

  render(
    <EditorAccoes
      drone={MINI}
      waypoint={waypointCom([])}
      numeroSeleccionados={1}
      aoAcrescentar={aoAcrescentar}
      aoAlterar={aoAlterar}
      aoRemover={aoRemover}
      aoMover={aoMover}
      {...sobrepor}
    />,
  )

  return { aoAcrescentar, aoAlterar, aoRemover, aoMover }
}

/** As linhas da lista de accoes, pela ordem em que estao. */
const linhas = () => screen.getAllByRole('listitem')

/**
 * O campo numerico de um parametro.
 *
 * O titulo esta na etiqueta e nao no campo - `getByTitle` devolve a etiqueta, e
 * escrever numa etiqueta nao faz nada.
 */
const campo = (titulo: string): HTMLElement =>
  within(screen.getByTitle(titulo)).getByRole('spinbutton')

/**
 * O editor com estado, como ele vive na aplicacao.
 *
 * Os campos sao controlados: sem alguem a devolver o valor alterado, escrever
 * "180" da tres chamadas e o campo fica a mostrar o ultimo algarismo. O ensaio
 * so diz alguma coisa se o ciclo se fechar, e e isso que este invólucro faz.
 */
function montarComEstado(inicial: Accao) {
  const alteracoes: Accao[] = []

  function Anfitriao() {
    const [accao, setAccao] = useState<Accao>(inicial)
    return (
      <EditorAccoes
        drone={MAVIC}
        waypoint={waypointCom([accao])}
        numeroSeleccionados={1}
        aoAcrescentar={() => {}}
        aoAlterar={(_, nova) => {
          alteracoes.push(nova)
          setAccao(nova)
        }}
        aoRemover={() => {}}
        aoMover={() => {}}
      />
    )
  }

  render(<Anfitriao />)
  return { alteracoes, ultima: () => alteracoes.at(-1) }
}

describe('accoes que o aparelho suporta', () => {
  it('uma accao que o aparelho nao faz aparece travada', () => {
    /*
     * O Mini nao tem zoom. Deixar o botao carregavel punha no ficheiro uma
     * accao que o aparelho ignora em silencio - a rota voa e nao faz o que se
     * lhe pediu.
     */
    montar({ drone: MINI })
    expect(screen.getByRole('button', { name: 'Zoom' })).toBeDisabled()
  })

  it('no aparelho que a faz, a mesma accao esta disponivel', () => {
    montar({ drone: MAVIC })
    expect(screen.getByRole('button', { name: 'Zoom' })).toBeEnabled()
  })

  it('o aviso diz qual e o aparelho que nao suporta', () => {
    montar({ drone: MINI })
    expect(screen.getByRole('button', { name: 'Zoom' })).toHaveAttribute(
      'title',
      expect.stringContaining(MINI.nome),
    )
  })

  it('sem waypoints seleccionados nao ha nada a que acrescentar', () => {
    montar({ numeroSeleccionados: 0, waypoint: null })
    for (const nome of ['Tirar foto', 'Rodar gimbal', 'Pairar']) {
      expect(screen.getByRole('button', { name: nome })).toBeDisabled()
    }
  })

  it('acrescentar pede o tipo escolhido', async () => {
    const { aoAcrescentar } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar foto' }))
    expect(aoAcrescentar).toHaveBeenCalledWith('tirarFoto')
  })
})

describe('lista de accoes', () => {
  it('com varios waypoints so se acrescenta, nao se edita', () => {
    /*
     * Editar a lista de varios ao mesmo tempo nao quer dizer nada: cada um tem
     * a sua. Acrescentar a todos quer.
     */
    montar({ waypoint: null, numeroSeleccionados: 3 })
    expect(screen.getByText(/só é possível acrescentar ações a todos/)).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toEqual([])
  })

  it('um waypoint sem accoes di-lo', () => {
    montar({ waypoint: waypointCom([]) })
    expect(screen.getByText('Sem acções neste waypoint.')).toBeInTheDocument()
  })

  it('as accoes aparecem numeradas pela ordem de execucao', () => {
    // A ordem e o que o aparelho vai seguir, e por isso tem de se ler.
    montar({
      waypoint: waypointCom([
        { tipo: 'rodarGimbal', pitch: -90, yaw: 0 },
        { tipo: 'tirarFoto' },
        { tipo: 'pairar', segundos: 3 },
      ]),
    })

    const todas = linhas()
    expect(todas).toHaveLength(3)
    expect(todas[0]).toHaveTextContent('1')
    expect(todas[0]).toHaveTextContent('Rodar gimbal')
    expect(todas[1]).toHaveTextContent('Tirar foto')
    expect(todas[2]).toHaveTextContent('Pairar')
  })

  it('a primeira nao sobe e a ultima nao desce', () => {
    montar({
      waypoint: waypointCom([{ tipo: 'tirarFoto' }, { tipo: 'pairar', segundos: 2 }]),
    })

    const [primeira, ultima] = linhas()
    expect(within(primeira!).getByTitle('Subir')).toBeDisabled()
    expect(within(primeira!).getByTitle('Descer')).toBeEnabled()
    expect(within(ultima!).getByTitle('Subir')).toBeEnabled()
    expect(within(ultima!).getByTitle('Descer')).toBeDisabled()
  })

  it('subir e descer dizem de onde para onde', async () => {
    const { aoMover } = montar({
      waypoint: waypointCom([
        { tipo: 'tirarFoto' },
        { tipo: 'pairar', segundos: 2 },
        { tipo: 'pararGravacao' },
      ]),
    })

    await userEvent.click(within(linhas()[1]!).getByTitle('Subir'))
    expect(aoMover).toHaveBeenCalledWith(1, 0)

    await userEvent.click(within(linhas()[1]!).getByTitle('Descer'))
    expect(aoMover).toHaveBeenCalledWith(1, 2)
  })

  it('remover diz qual', async () => {
    const { aoRemover } = montar({
      waypoint: waypointCom([{ tipo: 'tirarFoto' }, { tipo: 'pairar', segundos: 2 }]),
    })

    await userEvent.click(within(linhas()[1]!).getByTitle('Remover'))
    expect(aoRemover).toHaveBeenCalledWith(1)
  })

  it('uma accao sem parametros nao mostra campos', () => {
    montar({ waypoint: waypointCom([{ tipo: 'tirarFoto' }]) })
    expect(within(linhas()[0]!).queryByRole('spinbutton')).toBeNull()
  })
})

describe('parametros das accoes', () => {
  it('o gimbal tem inclinacao e guinada', () => {
    montar({ waypoint: waypointCom([{ tipo: 'rodarGimbal', pitch: -45, yaw: 10 }]) })

    expect(campo('Inclinação do gimbal, graus')).toHaveValue(-45)
    expect(campo('Guinada do gimbal, graus')).toHaveValue(10)
  })

  it('alterar um parametro devolve a accao inteira, e nao so o campo', async () => {
    // Devolver so o campo perdia o outro, e o gimbal ficava com metade da ordem.
    const ensaio = montarComEstado({ tipo: 'rodarGimbal', pitch: -45, yaw: 10 })

    const entrada = campo('Inclinação do gimbal, graus')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '-60')

    expect(ensaio.ultima()).toEqual({ tipo: 'rodarGimbal', pitch: -60, yaw: 10 })
  })

  it('um valor fora dos limites fica preso ao limite', async () => {
    /*
     * O exportador aceita o que lhe derem: um gimbal a -200 graus saia no
     * ficheiro e era o aparelho a recusar a rota, ja no campo.
     */
    const ensaio = montarComEstado({ tipo: 'rodarGimbal', pitch: -45, yaw: 0 })

    const entrada = campo('Inclinação do gimbal, graus')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '-200')

    expect(ensaio.ultima()).toMatchObject({ pitch: -90 })
  })

  it('a paragem conta-se em segundos e nao desce abaixo de zero', async () => {
    const ensaio = montarComEstado({ tipo: 'pairar', segundos: 5 })
    expect(campo('Segundos')).toHaveValue(5)

    const entrada = campo('Segundos')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '-3')

    expect(ensaio.ultima()).toMatchObject({ tipo: 'pairar', segundos: 0 })
  })

  it('o zoom nao desce abaixo de um: menos do que isso nao e zoom', async () => {
    const ensaio = montarComEstado({ tipo: 'zoom', fator: 4 })

    const entrada = campo('Factor de zoom')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '0')

    expect(ensaio.ultima()).toMatchObject({ tipo: 'zoom', fator: 1 })
  })

  it('o rumo da aeronave aceita a volta toda', async () => {
    const ensaio = montarComEstado({ tipo: 'rodarAeronave', heading: 0 })

    const entrada = campo('Rumo, graus')
    await userEvent.clear(entrada)
    await userEvent.type(entrada, '180')

    expect(ensaio.ultima()).toEqual({ tipo: 'rodarAeronave', heading: 180 })
  })

  it('texto que nao e numero nao altera nada', async () => {
    const ensaio = montarComEstado({ tipo: 'pairar', segundos: 5 })
    await userEvent.clear(campo('Segundos'))
    expect(ensaio.alteracoes).toEqual([])
  })

  it('da para escrever um negativo por cima do que la esta', async () => {
    /*
     * Este foi o defeito que estes testes encontraram.
     *
     * O campo so mostrava valores confirmados, e um `-` sozinho nao e numero:
     * seleccionar tudo e carregar em `-` deixava o campo com `-`, a alteracao
     * era ignorada e o React repunha o valor antigo - o sinal desaparecia
     * debaixo dos dedos. Num campo que vai de -90 a 45, o negativo e o caso
     * normal, e nao havia maneira de la chegar sem ser pelas setas.
     */
    const ensaio = montarComEstado({ tipo: 'rodarGimbal', pitch: 30, yaw: 0 })
    const entrada = campo('Inclinação do gimbal, graus')

    await userEvent.clear(entrada)
    await userEvent.type(entrada, '-45')

    expect(ensaio.ultima()).toMatchObject({ pitch: -45 })
  })

  it('o campo volta ao ultimo valor bom quando se sai dele a meio', async () => {
    const ensaio = montarComEstado({ tipo: 'pairar', segundos: 8 })
    const entrada = campo('Segundos')

    await userEvent.clear(entrada)
    await userEvent.tab()

    expect(entrada).toHaveValue(8)
    expect(ensaio.alteracoes).toEqual([])
  })
})
