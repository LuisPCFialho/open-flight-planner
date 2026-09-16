import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Area } from '../nucleo/tipos.ts'
import type { Cobertura, OpcoesCobertura } from '../nucleo/cobertura.ts'
import { droneComId } from '../drones.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { PainelCobertura } from './PainelCobertura.tsx'

/**
 * A cobertura e a unica parte da aplicacao que gera centenas de waypoints de uma
 * so vez. Um engano aqui nao se ve no ecra - ve-se no campo, com a bateria
 * gasta, quando o cartao vem vazio.
 */

const CANTO = { lat: 40.746552, lon: -8.41061 }

/** Um rectangulo de 400 x 300 m, com o lado longo a apontar para leste. */
function parcela(): Area {
  const nordeste = deslocar(deslocar(CANTO, 90, 400), 0, 300)
  return {
    id: 'a1',
    nome: 'Parcela',
    contorno: [
      CANTO,
      deslocar(CANTO, 90, 400),
      nordeste,
      deslocar(CANTO, 0, 300),
    ],
  }
}

function montar(sobrepor: Partial<Parameters<typeof PainelCobertura>[0]> = {}) {
  const aoGerar = vi.fn()
  const aoMudarParaAGL = vi.fn()
  render(
    <PainelCobertura
      areas={[parcela()]}
      drone={droneComId('mini5pro')}
      waypointsExistentes={0}
      modoAltitude="AGL"
      aoMudarParaAGL={aoMudarParaAGL}
      aoGerar={aoGerar}
      aoFechar={() => {}}
      {...sobrepor}
    />,
  )
  return { aoGerar, aoMudarParaAGL }
}

/** O botao que gera, seja qual for o numero que ele traz no nome. */
const botaoDeGerar = () => screen.getByRole('button', { name: /waypoints/ })

/** A n-esima chamada ao gerador, ja sem o `undefined` que o indice traz. */
function chamada(aoGerar: ReturnType<typeof vi.fn>, n: number) {
  const args = aoGerar.mock.calls[n]
  if (!args) throw new Error(`o gerador nao foi chamado ${n + 1} vezes`)
  return { cobertura: args[0] as Cobertura, opcoes: args[1] as OpcoesCobertura }
}

describe('painel de cobertura', () => {
  it('nasce a tirar uma foto por waypoint', async () => {
    /*
     * Desligado, o ficheiro exportado nao leva accao de foto nenhuma: a rota
     * voava e nao trazia nada. Ja aconteceu uma vez, e e por isso que isto tem
     * teste.
     */
    const { aoGerar } = montar()
    expect(screen.getByLabelText('Um waypoint por foto')).toBeChecked()

    await userEvent.click(botaoDeGerar())
    const { cobertura, opcoes } = chamada(aoGerar, 0)
    expect(opcoes.umPontoPorFoto).toBe(true)
    expect(cobertura.numeroDeFotos).toBeGreaterThan(0)
  })

  it('o rumo nasce pelo lado mais longo da parcela', () => {
    // Numa central e a direccao das filas, e e por ali que se voa.
    montar()
    expect(screen.getByLabelText('Rumo das passagens')).toHaveValue('90.0')
  })

  it('subir a altura tira passagens e tira fotos', async () => {
    const { aoGerar } = montar()

    await userEvent.click(botaoDeGerar())
    const baixo = chamada(aoGerar, 0).cobertura

    const altura = screen.getByLabelText('Altura acima do solo')
    await userEvent.clear(altura)
    await userEvent.type(altura, '120{Enter}')

    await userEvent.click(botaoDeGerar())
    const alto = chamada(aoGerar, 1).cobertura

    expect(alto.passagens.length).toBeLessThan(baixo.passagens.length)
    expect(alto.numeroDeFotos).toBeLessThan(baixo.numeroDeFotos)
    expect(alto.espacamento).toBeGreaterThan(baixo.espacamento)
  })

  it('fora de AGL nao gera nada, e oferece passar a rota para AGL', async () => {
    /*
     * O espacamento sai da altura acima do solo. Em cota absoluta, sobre relevo,
     * cada passagem cobria uma largura diferente e ficavam buracos entre elas.
     */
    const { aoMudarParaAGL } = montar({ modoAltitude: 'ASL' })

    expect(botaoDeGerar()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Passar a rota para AGL' }))
    expect(aoMudarParaAGL).toHaveBeenCalled()
  })

  it('avisa quando a rota fica com waypoints a mais para o aparelho', async () => {
    montar({ waypointsExistentes: 0 })

    const altura = screen.getByLabelText('Altura acima do solo')
    await userEvent.clear(altura)
    await userEvent.type(altura, '20{Enter}')

    expect(screen.getByText(/waypoints\. Sobe a altura/)).toBeInTheDocument()
  })

  it('o botao diz se cria a rota ou se acrescenta a que ja ha', () => {
    const { unmount } = render(
      <PainelCobertura
        areas={[parcela()]}
        drone={droneComId('mini5pro')}
        waypointsExistentes={0}
        modoAltitude="AGL"
        aoMudarParaAGL={() => {}}
        aoGerar={() => {}}
        aoFechar={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /^Criar a rota com/ })).toBeInTheDocument()
    unmount()

    render(
      <PainelCobertura
        areas={[parcela()]}
        drone={droneComId('mini5pro')}
        waypointsExistentes={12}
        modoAltitude="AGL"
        aoMudarParaAGL={() => {}}
        aoGerar={() => {}}
        aoFechar={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /^Acrescentar/ })).toBeInTheDocument()
  })

  it('as passagens saem sempre dentro do limite da parcela', async () => {
    /*
     * Numa parcela concava uma passagem vem partida em varios trocos. Tratar o
     * corte como um so faria a aeronave atravessar o que nao e para cobrir - num
     * sitio a serio, a central do vizinho.
     */
    const { aoGerar } = montar()
    await userEvent.click(botaoDeGerar())
    const { cobertura } = chamada(aoGerar, 0)

    const lats = cobertura.passagens.flat().map((p) => p.lat)
    const lons = cobertura.passagens.flat().map((p) => p.lon)
    const limite = parcela().contorno
    const folga = 0.0002 // ~20 m, que e a margem de meia faixa

    expect(Math.min(...lats)).toBeGreaterThan(Math.min(...limite.map((p) => p.lat)) - folga)
    expect(Math.max(...lats)).toBeLessThan(Math.max(...limite.map((p) => p.lat)) + folga)
    expect(Math.min(...lons)).toBeGreaterThan(Math.min(...limite.map((p) => p.lon)) - folga)
    expect(Math.max(...lons)).toBeLessThan(Math.max(...limite.map((p) => p.lon)) + folga)
  })
})
