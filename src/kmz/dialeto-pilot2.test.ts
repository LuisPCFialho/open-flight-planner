import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { droneComId } from '../drones.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { gerarPilot2 } from './dialeto-pilot2.ts'
import { lerXML, filho, filhos, textoEm } from './parse-xml.ts'

/**
 * O dialeto do Pilot 2 nao tem ainda um ficheiro real de referencia, ao
 * contrario do dialeto Fly. A ordem dos elementos vem da especificacao publica e
 * so sera dada por fechada contra uma exportacao verdadeira do FlightHub 2.
 * O que se fixa aqui e o que nao depende disso: os valores do modelo chegarem ao
 * ficheiro, e o gerador recusar-se a escrever algo incoerente.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 355.9 }

function rotaBase(): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mavic3t',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, modoAltitude: 'ALT', velocidadeGlobal: 8 }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < 4; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, 120)
  }
  return rota
}

function pasta(xml: string) {
  return filho(filho(lerXML(xml), 'Document'), 'Folder')
}

describe('distancia de amortecimento das curvas', () => {
  const comAmortecimento = (): Rota => {
    const rota = rotaBase()
    return {
      ...rota,
      waypoints: rota.waypoints.map((w) => ({
        ...w,
        tipoCurva: 'passarSuave' as const,
        distanciaAmortecimento: 12,
      })),
    }
  }

  it('escreve o valor real e nao zero, no template', () => {
    // Estava preso a zero: uma rota de curvas suaves planeada para o Mavic 3T
    // saia sem suavizacao nenhuma e a aeronave virava apertada em cada ponto.
    const gerado = gerarPilot2(comAmortecimento(), droneComId('mavic3t'))
    const primeiro = filhos(pasta(gerado.template), 'Placemark')[0]
    expect(textoEm(primeiro, 'wpml:waypointTurnParam/wpml:waypointTurnDampingDist')).toBe('12')
  })

  it('escreve o valor real tambem nas waylines', () => {
    const gerado = gerarPilot2(comAmortecimento(), droneComId('mavic3t'))
    const primeiro = filhos(pasta(gerado.waylines), 'Placemark')[0]
    expect(textoEm(primeiro, 'wpml:waypointTurnParam/wpml:waypointTurnDampingDist')).toBe('12')
  })

  it('mantem zero em quem para no ponto', () => {
    const gerado = gerarPilot2(rotaBase(), droneComId('mavic3t'))
    const primeiro = filhos(pasta(gerado.template), 'Placemark')[0]
    expect(textoEm(primeiro, 'wpml:waypointTurnParam/wpml:waypointTurnDampingDist')).toBe('0')
  })
})

describe('coerencia do ficheiro gerado', () => {
  it('recusa um waypoint que aponte a um POI que nao existe', () => {
    const rota = rotaBase()
    const orfao: Rota = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) =>
        i === 2 ? { ...w, modoGuinada: 'towardPOI' as const, poiId: 'nao-existe' } : w,
      ),
    }

    // Antes saia `waypointHeadingMode` a dizer `towardPOI` com o alvo em
    // `0,0,0`: o aparelho aceita e a rota nao faz o que se desenhou.
    expect(() => gerarPilot2(orfao, droneComId('mavic3t'))).toThrow(/waypoint 3/)
  })

  it('escreve distancia e duracao como numeros finitos', () => {
    const gerado = gerarPilot2(rotaBase(), droneComId('mavic3t'))
    const folder = pasta(gerado.waylines)

    for (const campo of ['wpml:distance', 'wpml:duration']) {
      const lido = Number.parseFloat(textoEm(folder, campo) ?? '')
      expect(Number.isFinite(lido), campo).toBe(true)
      expect(lido).toBeGreaterThan(0)
    }
  })
})
