import { describe, it, expect } from 'vitest'
import { amostrarPercurso, comprimento } from '../nucleo/geodesia.ts'
import { FonteTerrariumAWS } from './terrarium.ts'
import { descodificarPNGNode } from './png-node.ts'

/**
 * Testes contra os mosaicos reais da AWS. Dependem de rede, por isso ficam
 * separados dos testes de unidade e correm com `npm test`, nao com
 * `npm run test:unidade`.
 *
 * Servem dois propositos: confirmar que o descodificador de PNG le mesmo os
 * ficheiros que a AWS serve, e travar qualquer alteracao silenciosa na fonte de
 * dados. As tolerancias sao largas de proposito. O SRTM mede o topo do coberto
 * vegetal e tem erro vertical de uma ou duas dezenas de metros em terreno
 * acidentado, e isso e informacao a manter a vista, nao a esconder.
 */

function criarFonte(zoom = 14) {
  return new FonteTerrariumAWS({ descodificador: descodificarPNGNode, zoom })
}

/**
 * Cotas de terreno deduzidas do HUD do simulador do Pilot 2, subtraindo a altura
 * acima do solo a altura ASL. Ver docs/observacoes-pilot2-simulador.md.
 */
const PONTOS_SEVER_DO_VOUGA = [
  { nome: 'waypoint 54', lat: 40.751448, lon: -8.4066787, terreno: 293.7 },
  { nome: 'waypoint 57', lat: 40.75179939, lon: -8.4049744, terreno: 278.1 },
  { nome: 'waypoint 67', lat: 40.74707639, lon: -8.4121861, terreno: 360.9 },
  { nome: 'ponto de descolagem', lat: 40.746552, lon: -8.41061, terreno: 361.6 },
] as const

describe('mosaicos Terrarium reais', () => {
  it('le a Torre da Serra da Estrela, o ponto mais alto de Portugal continental', async () => {
    const cota = await criarFonte().cota(40.32194, -7.61361)
    // Cota oficial 1993 m. O modelo global fica sistematicamente uns metros abaixo.
    expect(cota).toBeGreaterThan(1960)
    expect(cota).toBeLessThan(2000)
  }, 30000)

  it('da zero no mar', async () => {
    expect(await criarFonte().cota(37.9, -9.3)).toBeCloseTo(0, 1)
  }, 30000)

  it('reproduz as cotas de terreno lidas no simulador em Sever do Vouga', async () => {
    const fonte = criarFonte()
    for (const ponto of PONTOS_SEVER_DO_VOUGA) {
      const cota = await fonte.cota(ponto.lat, ponto.lon)
      const desvio = Math.abs(cota - ponto.terreno)
      expect(
        desvio,
        `${ponto.nome}: mosaicos dao ${cota.toFixed(1)} m, simulador da ${ponto.terreno} m`,
      ).toBeLessThan(30)
    }
  }, 60000)

  it('le a zona do exemplo do Mini 5 Pro, em Alcacer do Sal', async () => {
    const cota = await criarFonte().cota(38.6583110005792, -8.18305089949604)
    expect(cota).toBeGreaterThan(200)
    expect(cota).toBeLessThan(270)
  }, 30000)

  it('produz um perfil continuo, sem saltos irreais entre amostras a 10 m', async () => {
    const percurso = [
      { lat: 40.74707639, lon: -8.4121861 },
      { lat: 40.75179939, lon: -8.4049744 },
      { lat: 40.751448, lon: -8.4066787 },
    ]
    const perfil = await criarFonte().perfil(percurso, 10)

    // Uma amostra por cada 10 m, mais as extremidades de cada troco.
    expect(perfil.length).toBeGreaterThanOrEqual(Math.floor(comprimento(percurso) / 10))
    expect(perfil).toHaveLength(amostrarPercurso(percurso, 10).length)
    expect(perfil.every((c) => Number.isFinite(c))).toBe(true)

    // Um declive de mais de 100% entre amostras a 10 m seria artefacto, nao terreno.
    for (let i = 1; i < perfil.length; i++) {
      const anterior = perfil[i - 1]
      const atual = perfil[i]
      if (anterior === undefined || atual === undefined) throw new Error('perfil incompleto')
      expect(Math.abs(atual - anterior)).toBeLessThan(10)
    }
  }, 60000)

  it('concorda consigo proprio entre zoom 13 e zoom 14', async () => {
    const ponto = { lat: 40.751448, lon: -8.4066787 }
    const z13 = await criarFonte(13).cota(ponto.lat, ponto.lon)
    const z14 = await criarFonte(14).cota(ponto.lat, ponto.lon)
    expect(Math.abs(z13 - z14)).toBeLessThan(15)
  }, 60000)
})
