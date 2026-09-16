import { describe, it, expect } from 'vitest'
import { MercatorCoordinate } from 'maplibre-gl'
import { construirInstancias, PASSO_INSTANCIA, type DroneNoMapa } from './camada-drones.ts'

function ponto(alteracoes: Partial<DroneNoMapa> = {}): DroneNoMapa {
  return {
    lon: -8.41061,
    lat: 40.746552,
    alturaVoo: 416,
    guinada: 0,
    gimbalPitch: 0,
    gimbalYaw: 0,
    seleccionado: false,
    alerta: false,
    ...alteracoes,
  }
}

/** Le os onze flutuantes da instancia `i`, com nome. */
function instancia(dados: Float32Array, i: number) {
  const b = i * PASSO_INSTANCIA
  return {
    centro: [dados[b], dados[b + 1], dados[b + 2]] as const,
    azimuteAeronave: dados[b + 3] ?? 0,
    inclinacaoAeronave: dados[b + 4] ?? 0,
    azimuteCamara: dados[b + 5] ?? 0,
    inclinacaoCamara: dados[b + 6] ?? 0,
    tinta: [dados[b + 7], dados[b + 8], dados[b + 9], dados[b + 10]] as const,
  }
}

const GRAU = Math.PI / 180

describe('instancias dos drones', () => {
  it('uma rota vazia nao produz instancias', () => {
    const { dados, metro } = construirInstancias([])
    expect(dados.length).toBe(0)
    expect(metro).toBe(0)
  })

  it('leva onze flutuantes por waypoint', () => {
    const { dados } = construirInstancias([ponto(), ponto(), ponto()])
    expect(dados.length).toBe(3 * PASSO_INSTANCIA)
  })

  it('o primeiro waypoint e a origem, e fica no zero', () => {
    // E o que mantem os vertices em valores pequenos: em Mercator as
    // coordenadas rondam 0,5 e um float32 nao tem digitos para isso.
    const { dados, origem } = construirInstancias([ponto(), ponto({ lon: -8.4 })])
    const primeira = instancia(dados, 0)

    expect(primeira.centro[0]).toBe(0)
    expect(primeira.centro[1]).toBe(0)
    expect(primeira.centro[2]).toBe(0)
    expect(origem[0]).toBeGreaterThan(0)
  })

  it('andar para leste aumenta o x e nao mexe no y', () => {
    const { dados } = construirInstancias([ponto(), ponto({ lon: -8.4 })])
    const segunda = instancia(dados, 1)
    expect(segunda.centro[0]).toBeGreaterThan(0)
    expect(segunda.centro[1]).toBeCloseTo(0, 9)
  })

  it('andar para norte diminui o y, porque em Mercator o y cresce para sul', () => {
    const { dados } = construirInstancias([ponto(), ponto({ lat: 40.75 })])
    expect(instancia(dados, 1).centro[1]).toBeLessThan(0)
  })

  it('subir aumenta o z', () => {
    const { dados } = construirInstancias([ponto(), ponto({ alturaVoo: 516 })])
    expect(instancia(dados, 1).centro[2]).toBeGreaterThan(0)
  })

  it('o metro sai da latitude da origem', () => {
    const esperado = MercatorCoordinate.fromLngLat(
      [-8.41061, 40.746552],
      416,
    ).meterInMercatorCoordinateUnits()
    expect(construirInstancias([ponto()]).metro).toBeCloseTo(esperado, 15)
  })

  it('os angulos vao em radianos', () => {
    const { dados } = construirInstancias([ponto({ guinada: 90 })])
    expect(instancia(dados, 0).azimuteAeronave).toBeCloseTo(90 * GRAU, 6)
  })

  it('a aeronave paira direita: nunca leva inclinacao', () => {
    const { dados } = construirInstancias([ponto({ guinada: 30, gimbalPitch: -60 })])
    expect(instancia(dados, 0).inclinacaoAeronave).toBe(0)
  })

  it('a camara soma a rotacao do gimbal a guinada da aeronave', () => {
    /*
     * O `gimbalYaw` e relativo ao nariz, nao ao norte: e o mesmo criterio do
     * `gimbalHeadingYawBase` a `aircraft` que vai para o ficheiro. Se aqui se
     * usasse o valor em bruto, o mapa mostraria uma coisa e o drone faria
     * outra.
     */
    const { dados } = construirInstancias([ponto({ guinada: 100, gimbalYaw: 35 })])
    expect(instancia(dados, 0).azimuteCamara).toBeCloseTo(135 * GRAU, 6)
  })

  it('a camara leva a inclinacao do gimbal, com o sinal de quem olha para baixo', () => {
    const { dados } = construirInstancias([ponto({ gimbalPitch: -90 })])
    expect(instancia(dados, 0).inclinacaoCamara).toBeCloseTo(-90 * GRAU, 6)
  })

  it('sem seleccao nem alerta nao se mistura tinta nenhuma', () => {
    const { dados } = construirInstancias([ponto()])
    expect(instancia(dados, 0).tinta[3]).toBe(0)
  })

  it('o waypoint seleccionado leva tinta', () => {
    const { dados } = construirInstancias([ponto({ seleccionado: true })])
    expect(instancia(dados, 0).tinta[3]).toBeGreaterThan(0)
  })

  it('o alerta manda sobre a seleccao: um ponto perigoso le-se sempre a vermelho', () => {
    const { dados } = construirInstancias([ponto({ seleccionado: true, alerta: true })])
    const tinta = instancia(dados, 0).tinta
    expect(tinta[0]).toBeGreaterThan(tinta[2] ?? 0)
  })

  it('nao gera nenhum numero invalido', () => {
    const { dados } = construirInstancias([
      ponto(),
      ponto({ lon: -8.3, lat: 40.8, alturaVoo: 0, guinada: 359, gimbalPitch: -90, gimbalYaw: -90 }),
    ])
    for (const valor of dados) expect(Number.isFinite(valor)).toBe(true)
  })
})
