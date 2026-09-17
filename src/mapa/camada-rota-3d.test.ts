import { describe, it, expect } from 'vitest'
import { setaDoTroco } from './camada-rota-3d.ts'

/**
 * A seta de sentido de cada troco.
 *
 * Fica fora da camada, e exportada, porque e a unica parte do desenho que se
 * pode verificar sem placa grafica - e e onde os enganos custam caro: uma seta
 * ao contrario faz ler o plano ao contrario, e no ecra uma seta pequena e
 * parecida com a outra.
 *
 * Nas contas o metro vale um, para os numeros se lerem directamente em metros.
 * Em Mercator o x cresce para leste e o y para sul.
 */
const METRO = 1
const origem = { x: 0, y: 0, z: 0 }

describe('seta de sentido do troco', () => {
  it('aponta para onde se voa', () => {
    const seta = setaDoTroco(origem, { x: 100, y: 0, z: 0 }, METRO)
    expect(seta).not.toBeNull()
    if (!seta) return
    expect(seta.ponta.x).toBeGreaterThan(seta.esquerda.x)
    expect(seta.ponta.x).toBeGreaterThan(seta.direita.x)
  })

  it('assenta a meio do troco', () => {
    const seta = setaDoTroco(origem, { x: 100, y: 0, z: 0 }, METRO)
    if (!seta) throw new Error('esperava seta')
    // Ponta e asas equidistantes do meio: 20 m de lado, metade para cada lado.
    expect(seta.ponta.x).toBeCloseTo(60, 6)
    expect(seta.esquerda.x).toBeCloseTo(40, 6)
    expect(seta.direita.x).toBeCloseTo(40, 6)
  })

  it('as duas asas ficam simetricas em relacao ao eixo do troco', () => {
    const seta = setaDoTroco(origem, { x: 100, y: 0, z: 0 }, METRO)
    if (!seta) throw new Error('esperava seta')
    expect(seta.esquerda.y).toBeCloseTo(-seta.direita.y, 9)
    expect(seta.esquerda.y).not.toBeCloseTo(0, 3)
  })

  it('num troco a subir a seta inclina-se com ele', () => {
    const seta = setaDoTroco(origem, { x: 100, y: 0, z: 100 }, METRO)
    if (!seta) throw new Error('esperava seta')
    expect(seta.ponta.z).toBeGreaterThan(seta.esquerda.z)
    // A abertura e horizontal: as duas asas ficam a mesma altura.
    expect(seta.esquerda.z).toBeCloseTo(seta.direita.z, 9)
  })

  /*
   * Sem o limite de cima, uma perna de um quilometro levava uma seta de duzentos
   * metros e o que se via era a seta, nao a rota.
   */
  it('o tamanho esta limitado nos dois extremos', () => {
    const longo = setaDoTroco(origem, { x: 1000, y: 0, z: 0 }, METRO)
    if (!longo) throw new Error('esperava seta')
    expect(longo.ponta.x - 500).toBeCloseTo(10, 6)

    const curto = setaDoTroco(origem, { x: 10, y: 0, z: 0 }, METRO)
    if (!curto) throw new Error('esperava seta')
    expect(curto.ponta.x - 5).toBeCloseTo(1.5, 6)
  })

  it('o tamanho acompanha a escala do mundo', () => {
    const seta = setaDoTroco(origem, { x: 100, y: 0, z: 0 }, 2)
    if (!seta) throw new Error('esperava seta')
    // Com o metro a valer dois, os 22 m da fraccao ainda cabem no maximo de 30.
    expect(seta.ponta.x - 50).toBeCloseTo(11, 6)
  })

  it('um troco curto de mais nao leva seta: ela tapava-o todo', () => {
    expect(setaDoTroco(origem, { x: 5, y: 0, z: 0 }, METRO)).toBeNull()
  })

  it('um troco so de subida nao tem sentido de marcha que se desenhe', () => {
    expect(setaDoTroco(origem, { x: 0, y: 0, z: 50 }, METRO)).toBeNull()
  })

  it('dois waypoints no mesmo sitio nao dao seta', () => {
    expect(setaDoTroco(origem, { ...origem }, METRO)).toBeNull()
  })
})
