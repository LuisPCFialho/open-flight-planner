import { describe, it, expect } from 'vitest'
import { distancia } from '../nucleo/geodesia.ts'
import { ptTm06ParaWgs84, wgs84ParaPtTm06 } from './projeccao.ts'
import { lerDXF, escreverDXFdeEnsaio, DXFSemCotas } from './dxf.ts'
import { FonteTerrenoDXF, FonteComposta } from './fonte-dxf.ts'
import type { FonteTerreno } from './fonte.ts'

/** Origem do PT-TM06, que por definicao corresponde a (0, 0). */
const ORIGEM_PTTM06 = { lat: 39.6682583333333, lon: -8.13310833333333 }

describe('ETRS89 / PT-TM06', () => {
  it('poe a origem do sistema em zero', () => {
    const { x, y } = wgs84ParaPtTm06(ORIGEM_PTTM06)
    expect(x).toBeCloseTo(0, 3)
    expect(y).toBeCloseTo(0, 3)
  })

  it('e a sua propria inversa', () => {
    for (const ponto of [
      { lat: 40.746552, lon: -8.41061 },
      { lat: 38.6583, lon: -8.183 },
      { lat: 41.15, lon: -8.61 },
    ]) {
      const volta = ptTm06ParaWgs84(wgs84ParaPtTm06(ponto))
      expect(volta.lat).toBeCloseTo(ponto.lat, 9)
      expect(volta.lon).toBeCloseTo(ponto.lon, 9)
    }
  })

  it('anda metro a metro: mil metros a norte dao mil metros de distancia', () => {
    const base = wgs84ParaPtTm06({ lat: 40.75, lon: -8.41 })
    const norte = ptTm06ParaWgs84({ x: base.x, y: base.y + 1000 })
    expect(distancia(ptTm06ParaWgs84(base), norte)).toBeCloseTo(1000, 0)
  })
})

describe('leitura de DXF', () => {
  const base = wgs84ParaPtTm06({ lat: 40.75, lon: -8.41 })

  it('le superficies 3DFACE com as tres cotas', () => {
    const dxf = escreverDXFdeEnsaio([
      {
        a: { x: base.x, y: base.y, z: 300 },
        b: { x: base.x + 100, y: base.y, z: 310 },
        c: { x: base.x, y: base.y + 100, z: 320 },
      },
    ])
    const topografia = lerDXF(dxf)

    expect(topografia.triangulos).toHaveLength(1)
    expect(topografia.camadas).toEqual(['SUPERFICIE'])
    expect(topografia.triangulos[0]?.vertices.map((v) => v.cota)).toEqual([300, 310, 320])

    const primeiro = topografia.triangulos[0]?.vertices[0]
    expect(primeiro?.posicao.lat).toBeCloseTo(40.75, 6)
    expect(primeiro?.posicao.lon).toBeCloseTo(-8.41, 6)
  })

  it('le a cota das curvas de nivel na elevacao da polilinha', () => {
    const dxf = escreverDXFdeEnsaio(
      [],
      [
        { cota: 340, vertices: [{ x: base.x, y: base.y }, { x: base.x + 50, y: base.y }] },
        { cota: 350, vertices: [{ x: base.x, y: base.y + 50 }] },
      ],
    )
    const topografia = lerDXF(dxf)

    expect(topografia.pontos).toHaveLength(3)
    expect(topografia.pontos.map((p) => p.cota)).toEqual([340, 340, 350])
    expect(topografia.camadas).toEqual(['CURVAS_NIVEL'])
  })

  it('recusa um DXF sem cota nenhuma, em vez de devolver um terreno vazio', () => {
    expect(() => lerDXF(escreverDXFdeEnsaio([], []))).toThrow(DXFSemCotas)
  })

  it('calcula a envolvente do que leu', () => {
    const dxf = escreverDXFdeEnsaio([
      {
        a: { x: base.x, y: base.y, z: 300 },
        b: { x: base.x + 200, y: base.y, z: 310 },
        c: { x: base.x, y: base.y + 200, z: 320 },
      },
    ])
    const limites = lerDXF(dxf).limites
    if (!limites) throw new Error('sem envolvente')

    expect(limites.latMin).toBeCloseTo(40.75, 5)
    expect(limites.latMax).toBeGreaterThan(limites.latMin)
    expect(limites.lonMax).toBeGreaterThan(limites.lonMin)
  })
})

describe('cotas a partir da topografia', () => {
  const base = wgs84ParaPtTm06({ lat: 40.75, lon: -8.41 })

  /** Uma superficie plana e inclinada: sobe 0,1 m por metro para leste. */
  function rampa(): FonteTerrenoDXF {
    const dxf = escreverDXFdeEnsaio([
      {
        a: { x: base.x, y: base.y, z: 300 },
        b: { x: base.x + 200, y: base.y, z: 320 },
        c: { x: base.x, y: base.y + 200, z: 300 },
      },
      {
        a: { x: base.x + 200, y: base.y, z: 320 },
        b: { x: base.x + 200, y: base.y + 200, z: 320 },
        c: { x: base.x, y: base.y + 200, z: 300 },
      },
    ])
    return new FonteTerrenoDXF(lerDXF(dxf))
  }

  it('interpola exactamente dentro de um triangulo', () => {
    const fonte = rampa()
    // A meio da rampa, 100 m a leste, a cota tem de ser 310 ao centimetro.
    const meio = ptTm06ParaWgs84({ x: base.x + 100, y: base.y + 50 })
    expect(fonte.cotaSincrona(meio.lat, meio.lon)).toBeCloseTo(310, 2)

    const canto = ptTm06ParaWgs84({ x: base.x + 200, y: base.y + 100 })
    expect(fonte.cotaSincrona(canto.lat, canto.lon)).toBeCloseTo(320, 2)
  })

  it('devolve a cota medida quando se cai em cima de um ponto', () => {
    const dxf = escreverDXFdeEnsaio(
      [],
      [{ cota: 412.5, vertices: [{ x: base.x, y: base.y }] }],
    )
    const fonte = new FonteTerrenoDXF(lerDXF(dxf))
    expect(fonte.cotaSincrona(40.75, -8.41)).toBeCloseTo(412.5, 3)
  })

  it('interpola entre curvas de nivel pela distancia', () => {
    const dxf = escreverDXFdeEnsaio(
      [],
      [
        { cota: 300, vertices: [{ x: base.x - 50, y: base.y }, { x: base.x - 50, y: base.y + 50 }] },
        { cota: 400, vertices: [{ x: base.x + 50, y: base.y }, { x: base.x + 50, y: base.y + 50 }] },
      ],
    )
    const fonte = new FonteTerrenoDXF(lerDXF(dxf))
    const meio = ptTm06ParaWgs84({ x: base.x, y: base.y + 25 })
    const cota = fonte.cotaSincrona(meio.lat, meio.lon)

    if (cota === null) throw new Error('devia ter cota')
    expect(cota).toBeGreaterThan(300)
    expect(cota).toBeLessThan(400)
    expect(cota).toBeCloseTo(350, -1)
  })

  it('nao inventa cotas fora da area levantada', async () => {
    const fonte = rampa()
    const longe = ptTm06ParaWgs84({ x: base.x + 5000, y: base.y })
    expect(fonte.cotaSincrona(longe.lat, longe.lon)).toBeNull()
    expect(fonte.cobre(longe.lat, longe.lon)).toBe(false)
    await expect(fonte.cota(longe.lat, longe.lon)).rejects.toThrow(/fora da area/)
  })
})

describe('fonte composta', () => {
  const base = wgs84ParaPtTm06({ lat: 40.75, lon: -8.41 })

  const publica: FonteTerreno = {
    origem: 'terrarium',
    cobre: () => true,
    cota: async () => 999,
    cotas: async (pontos) => pontos.map(() => 999),
    perfil: async (pontos) => pontos.map(() => 999),
  }

  function composta(): FonteComposta {
    const dxf = escreverDXFdeEnsaio([
      {
        a: { x: base.x, y: base.y, z: 300 },
        b: { x: base.x + 100, y: base.y, z: 300 },
        c: { x: base.x, y: base.y + 100, z: 300 },
      },
    ])
    return new FonteComposta(new FonteTerrenoDXF(lerDXF(dxf)), publica)
  }

  it('prefere o levantamento dentro da area coberta', async () => {
    const dentro = ptTm06ParaWgs84({ x: base.x + 20, y: base.y + 20 })
    expect(await composta().cota(dentro.lat, dentro.lon)).toBeCloseTo(300, 2)
  })

  it('cai para os mosaicos publicos fora dela', async () => {
    const fora = ptTm06ParaWgs84({ x: base.x + 5000, y: base.y })
    expect(await composta().cota(fora.lat, fora.lon)).toBe(999)
  })

  it('diz de onde veio cada cota', () => {
    const fonte = composta()
    const dentro = ptTm06ParaWgs84({ x: base.x + 20, y: base.y + 20 })
    const fora = ptTm06ParaWgs84({ x: base.x + 5000, y: base.y })

    expect(fonte.origemEm(dentro.lat, dentro.lon)).toBe('dxf')
    expect(fonte.origemEm(fora.lat, fora.lon)).toBe('terrarium')
  })

  it('mistura as duas fontes ao longo de um percurso que sai da area', async () => {
    const dentro = ptTm06ParaWgs84({ x: base.x + 10, y: base.y + 10 })
    const fora = ptTm06ParaWgs84({ x: base.x + 3000, y: base.y + 10 })

    const cotas = await composta().perfil([dentro, fora], 100)
    expect(cotas[0]).toBeCloseTo(300, 2)
    expect(cotas.at(-1)).toBe(999)
    expect(new Set(cotas).size).toBeGreaterThan(1)
  })
})
