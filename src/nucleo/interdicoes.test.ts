import { describe, it, expect } from 'vitest'
import type { Area, LatLon } from './tipos.ts'
import {
  areasDeReferencia,
  dentroDoContorno,
  incursoes,
  segmentosCruzam,
  trocoTocaNaZona,
  zonasInterditas,
} from './interdicoes.ts'

/**
 * Zonas por onde a rota nao pode passar.
 *
 * A geometria e simples e engana-se facil: um troco pode atravessar uma zona de
 * lado a lado sem que nenhum dos seus waypoints caia la dentro, e testar so os
 * waypoints deixava passar exactamente o caso que interessa.
 *
 * Um quadrado de um centesimo de grau de lado serve de zona - uns 800 por 1100
 * metros nestas latitudes, que e a ordem de grandeza de um posto de
 * transformacao com a sua envolvente.
 */

const QUADRADO: LatLon[] = [
  { lat: 40.75, lon: -8.41 },
  { lat: 40.75, lon: -8.4 },
  { lat: 40.76, lon: -8.4 },
  { lat: 40.76, lon: -8.41 },
]

const zona = (nome: string, contorno: LatLon[]): Area => ({
  id: nome,
  nome,
  contorno,
  tipo: 'exclusao',
})

describe('ponto dentro do contorno', () => {
  it('o centro esta dentro', () => {
    expect(dentroDoContorno({ lat: 40.755, lon: -8.405 }, QUADRADO)).toBe(true)
  })

  it('um ponto ao lado esta fora, dos quatro lados', () => {
    expect(dentroDoContorno({ lat: 40.755, lon: -8.42 }, QUADRADO)).toBe(false)
    expect(dentroDoContorno({ lat: 40.755, lon: -8.39 }, QUADRADO)).toBe(false)
    expect(dentroDoContorno({ lat: 40.74, lon: -8.405 }, QUADRADO)).toBe(false)
    expect(dentroDoContorno({ lat: 40.77, lon: -8.405 }, QUADRADO)).toBe(false)
  })

  /*
   * Um contorno em C: o vao da letra esta fora, apesar de ficar entre os bracos.
   * Somar angulos em vez de lancar um raio dava aqui a resposta errada.
   */
  it('acerta num contorno concavo', () => {
    const emC: LatLon[] = [
      { lat: 40.75, lon: -8.41 },
      { lat: 40.75, lon: -8.4 },
      { lat: 40.752, lon: -8.4 },
      { lat: 40.752, lon: -8.405 },
      { lat: 40.758, lon: -8.405 },
      { lat: 40.758, lon: -8.4 },
      { lat: 40.76, lon: -8.4 },
      { lat: 40.76, lon: -8.41 },
    ]
    expect(dentroDoContorno({ lat: 40.755, lon: -8.408 }, emC)).toBe(true)
    expect(dentroDoContorno({ lat: 40.755, lon: -8.402 }, emC)).toBe(false)
  })

  it('um contorno com menos de tres pontos nao contem nada', () => {
    expect(dentroDoContorno({ lat: 40.755, lon: -8.405 }, QUADRADO.slice(0, 2))).toBe(false)
  })
})

describe('cruzamento de segmentos', () => {
  it('dois que se cruzam em cruz', () => {
    expect(
      segmentosCruzam(
        { lat: 0, lon: -1 },
        { lat: 0, lon: 1 },
        { lat: -1, lon: 0 },
        { lat: 1, lon: 0 },
      ),
    ).toBe(true)
  })

  it('dois paralelos nao se cruzam', () => {
    expect(
      segmentosCruzam(
        { lat: 0, lon: -1 },
        { lat: 0, lon: 1 },
        { lat: 1, lon: -1 },
        { lat: 1, lon: 1 },
      ),
    ).toBe(false)
  })

  it('dois que so se cruzariam se fossem mais compridos nao contam', () => {
    expect(
      segmentosCruzam(
        { lat: 0, lon: -1 },
        { lat: 0, lon: -0.5 },
        { lat: -1, lon: 0 },
        { lat: 1, lon: 0 },
      ),
    ).toBe(false)
  })
})

describe('troco a tocar na zona', () => {
  it('com uma ponta dentro, toca', () => {
    expect(
      trocoTocaNaZona({ lat: 40.755, lon: -8.405 }, { lat: 40.755, lon: -8.38 }, QUADRADO),
    ).toBe(true)
  })

  /*
   * O caso que justifica tudo isto. Testar so os waypoints deixava passar um
   * troco de um quilometro a atravessar a zona pelo meio, que e precisamente o
   * que acontece numa transicao entre passagens de cobertura.
   */
  it('a atravessar de lado a lado sem nenhuma ponta dentro, toca na mesma', () => {
    expect(
      trocoTocaNaZona({ lat: 40.755, lon: -8.43 }, { lat: 40.755, lon: -8.38 }, QUADRADO),
    ).toBe(true)
  })

  it('a passar ao lado, nao toca', () => {
    expect(
      trocoTocaNaZona({ lat: 40.73, lon: -8.43 }, { lat: 40.73, lon: -8.38 }, QUADRADO),
    ).toBe(false)
  })
})

describe('incursoes na rota', () => {
  const dentro = { lat: 40.755, lon: -8.405 }
  const fora = { lat: 40.72, lon: -8.405 }
  const outroFora = { lat: 40.72, lon: -8.39 }

  it('sem zonas nao ha incursoes', () => {
    expect(incursoes([fora, dentro], [])).toHaveLength(0)
  })

  it('uma rota que passa ao lado nao acusa nada', () => {
    expect(incursoes([fora, outroFora], [zona('posto', QUADRADO)])).toHaveLength(0)
  })

  it('aponta o troco onde a rota entra', () => {
    const achadas = incursoes([fora, dentro, outroFora], [zona('posto', QUADRADO)])
    expect(achadas.length).toBeGreaterThan(0)
    expect(achadas[0]?.indice).toBe(0)
    expect(achadas[0]?.nomeDaZona).toBe('posto')
  })

  /*
   * Uma rota que acaba dentro da zona e um problema mesmo sem troco a seguir -
   * o aparelho fica la a pairar, ou pousa la.
   */
  it('o ultimo waypoint conta sozinho', () => {
    expect(incursoes([dentro], [zona('posto', QUADRADO)])).toHaveLength(1)
  })

  it('duas zonas atravessadas pelo mesmo troco dao duas entradas', () => {
    const aoLado: LatLon[] = QUADRADO.map((p) => ({ ...p, lat: p.lat }))
    const achadas = incursoes([fora, dentro], [zona('posto', QUADRADO), zona('vizinho', aoLado)])
    expect(new Set(achadas.map((i) => i.nomeDaZona))).toEqual(new Set(['posto', 'vizinho']))
  })
})

describe('separar referencia de interdicao', () => {
  const referencia: Area = { id: 'r', nome: 'parcela', contorno: QUADRADO }
  const interdita = zona('posto', QUADRADO)

  /*
   * Sem `tipo` e referencia. E o que faz as rotas gravadas antes disto
   * continuarem a ler-se sem migracao nenhuma.
   */
  it('uma area sem tipo e de referencia', () => {
    expect(areasDeReferencia([referencia])).toHaveLength(1)
    expect(zonasInterditas([referencia])).toHaveLength(0)
  })

  it('separa as duas', () => {
    const todas = [referencia, interdita]
    expect(areasDeReferencia(todas).map((a) => a.nome)).toEqual(['parcela'])
    expect(zonasInterditas(todas).map((a) => a.nome)).toEqual(['posto'])
  })

  it('sem areas nenhumas, nao rebenta', () => {
    expect(areasDeReferencia(undefined)).toEqual([])
    expect(zonasInterditas(undefined)).toEqual([])
  })
})
