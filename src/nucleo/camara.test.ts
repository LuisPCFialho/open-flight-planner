import { describe, it, expect } from 'vitest'
import type { LatLon } from './tipos.ts'
import { distancia, rumo } from './geodesia.ts'
import {
  baseDaCamara,
  fovVerticalDe,
  marcharRaio,
  projectarEnquadramento,
  type AmostradorTerreno,
} from './camara.ts'

const AERONAVE: LatLon = { lat: 40.75, lon: -8.41 }
const plano = (cota: number): AmostradorTerreno => () => cota

describe('base da camara', () => {
  it('aponta a norte com a aeronave a norte e o gimbal na horizontal', () => {
    const { frente, direita, cima } = baseDaCamara(0, 0)

    expect(frente.norte).toBeCloseTo(1, 9)
    expect(frente.este).toBeCloseTo(0, 9)
    expect(frente.cima).toBeCloseTo(0, 9)
    expect(direita.este).toBeCloseTo(1, 9)
    expect(cima.cima).toBeCloseTo(1, 9)
  })

  it('aponta a este com a aeronave a 90 graus', () => {
    const { frente, direita } = baseDaCamara(90, 0)
    expect(frente.este).toBeCloseTo(1, 9)
    expect(frente.norte).toBeCloseTo(0, 9)
    // A direita de quem olha para este e o sul.
    expect(direita.norte).toBeCloseTo(-1, 9)
  })

  it('numa foto nadiral o cima da imagem e o rumo da aeronave', () => {
    const { frente, cima } = baseDaCamara(0, -90)
    expect(frente.cima).toBeCloseTo(-1, 9)
    expect(cima.norte).toBeCloseTo(1, 9)

    const virado = baseDaCamara(90, -90)
    expect(virado.cima.este).toBeCloseTo(1, 9)
  })

  it('a base e ortonormada em qualquer atitude', () => {
    for (const guinada of [0, 37, 128, 305]) {
      for (const pitch of [0, -15, -45, -90]) {
        const { frente, direita, cima } = baseDaCamara(guinada, pitch)
        const escalar = (a: typeof frente, b: typeof frente) =>
          a.este * b.este + a.norte * b.norte + a.cima * b.cima

        expect(escalar(frente, frente)).toBeCloseTo(1, 9)
        expect(escalar(direita, direita)).toBeCloseTo(1, 9)
        expect(escalar(cima, cima)).toBeCloseTo(1, 9)
        expect(escalar(frente, direita)).toBeCloseTo(0, 9)
        expect(escalar(frente, cima)).toBeCloseTo(0, 9)
        expect(escalar(direita, cima)).toBeCloseTo(0, 9)
      }
    }
  })
})

describe('fov vertical', () => {
  it('reduz na proporcao do sensor', () => {
    // 2 * atan(tan(42 graus) / 1,333) = 68,1 graus.
    expect(fovVerticalDe(84, 4 / 3)).toBeCloseTo(68.1, 1)
    // Num sensor quadrado os dois campos coincidem.
    expect(fovVerticalDe(60, 1)).toBeCloseTo(60, 6)
  })
})

describe('marcha do raio', () => {
  it('nao encontra terreno quando o raio sobe', () => {
    const subir = { este: 0, norte: 0.7, cima: 0.7 }
    expect(marcharRaio(AERONAVE, 300, subir, plano(200))).toBeNull()
  })

  it('corta o terreno a distancia certa com o gimbal a 45 graus', () => {
    // A 100 m do solo, a 45 graus, o corte fica a 100 m na horizontal.
    const meio = Math.SQRT1_2
    const raio = { este: 0, norte: meio, cima: -meio }
    const visado = marcharRaio(AERONAVE, 300, raio, plano(200), { passo: 5 })

    if (!visado) throw new Error('o raio devia ter cortado o terreno')
    expect(distancia(AERONAVE, visado.ponto)).toBeCloseTo(100, 0)
    expect(visado.distancia).toBeCloseTo(Math.hypot(100, 100), 0)
    expect(visado.cotaTerreno).toBe(200)
    expect(rumo(AERONAVE, visado.ponto)).toBeCloseTo(0, 1)
  })

  it('cai na vertical com o gimbal a apontar para baixo', () => {
    const visado = marcharRaio(AERONAVE, 300, { este: 0, norte: 0, cima: -1 }, plano(200))

    if (!visado) throw new Error('o raio vertical devia cortar o terreno por baixo')
    expect(visado.ponto).toEqual(AERONAVE)
    expect(visado.distancia).toBeCloseTo(100, 6)
    expect(visado.cotaTerreno).toBe(200)
  })

  it('para mais cedo quando o terreno sobe ao encontro do raio', () => {
    const meio = Math.SQRT1_2
    const raio = { este: 0, norte: meio, cima: -meio }
    const encosta: AmostradorTerreno = (p) => 200 + distancia(AERONAVE, p) * 0.5

    const visado = marcharRaio(AERONAVE, 300, raio, encosta, { passo: 5 })
    if (!visado) throw new Error('o raio devia ter cortado a encosta')

    // Com o raio a descer 1 m por metro e o terreno a subir 0,5, encontram-se aos ~67 m.
    expect(distancia(AERONAVE, visado.ponto)).toBeCloseTo(66.7, 0)
    expect(visado.cotaTerreno).toBeGreaterThan(200)
  })

  it('devolve null quando o terreno fica fora de alcance', () => {
    const quaseHorizontal = { este: 0, norte: 0.9999, cima: -0.0141 }
    expect(marcharRaio(AERONAVE, 300, quaseHorizontal, plano(200), { alcance: 500 })).toBeNull()
  })
})

describe('enquadramento', () => {
  const base = {
    posicao: AERONAVE,
    alturaASL: 300,
    guinada: 0,
    gimbalPitch: -90,
    fovHorizontal: 84,
    proporcao: 4 / 3,
  }

  it('numa foto nadiral cobre a largura que a trigonometria manda', () => {
    // Nadiral a 100 m: largura = 2 * 100 * tan(42 graus) = 180,0 m.
    const enquadramento = projectarEnquadramento({ ...base }, plano(200), { passo: 2 })

    // Numa foto nadiral o centro cai na vertical da aeronave, a altura do voo.
    expect(enquadramento.centro?.distancia).toBeCloseTo(100, 6)
    expect(enquadramento.cantos.every((c) => c !== null)).toBe(true)
    expect(enquadramento.larguraCoberta).toBeCloseTo(2 * 100 * Math.tan((42 * Math.PI) / 180), 0)
  })

  it('o enquadramento cresce com a altura', () => {
    const baixo = projectarEnquadramento({ ...base, alturaASL: 250 }, plano(200), { passo: 2 })
    const alto = projectarEnquadramento({ ...base, alturaASL: 400 }, plano(200), { passo: 2 })

    expect(alto.larguraCoberta ?? 0).toBeGreaterThan((baixo.larguraCoberta ?? 0) * 3)
  })

  it('com o gimbal inclinado o centro cai a frente da aeronave', () => {
    const inclinado = projectarEnquadramento(
      { ...base, gimbalPitch: -45 },
      plano(200),
      { passo: 2 },
    )

    const centro = inclinado.centro
    if (!centro) throw new Error('o centro devia ter cortado o terreno')
    expect(distancia(AERONAVE, centro.ponto)).toBeCloseTo(100, 0)
    expect(rumo(AERONAVE, centro.ponto)).toBeCloseTo(0, 1)
  })

  it('a guinada roda o enquadramento sem lhe mudar o tamanho', () => {
    const norte = projectarEnquadramento({ ...base, gimbalPitch: -45 }, plano(200), { passo: 2 })
    const este = projectarEnquadramento(
      { ...base, gimbalPitch: -45, guinada: 90 },
      plano(200),
      { passo: 2 },
    )

    expect(este.larguraCoberta ?? 0).toBeCloseTo(norte.larguraCoberta ?? 0, 0)
    const centro = este.centro
    if (!centro) throw new Error('o centro devia ter cortado o terreno')
    expect(rumo(AERONAVE, centro.ponto)).toBeCloseTo(90, 1)
  })

  it('numa encosta o enquadramento fica assimetrico, ao contrario do que daria um plano', () => {
    const encosta: AmostradorTerreno = (p) => {
      // Terreno que sobe para norte.
      const norte = (p.lat - AERONAVE.lat) * 111000
      return 200 + norte * 0.4
    }
    const enquadramento = projectarEnquadramento(
      { ...base, gimbalPitch: -45 },
      encosta,
      { passo: 2 },
    )

    const [cimaEsq, cimaDir, baixoDir, baixoEsq] = enquadramento.cantos
    if (!cimaEsq || !cimaDir || !baixoDir || !baixoEsq) throw new Error('canto em falta')

    const larguraDistante = distancia(cimaEsq.ponto, cimaDir.ponto)
    const larguraProxima = distancia(baixoEsq.ponto, baixoDir.ponto)
    // A subir ao encontro da camara, o bordo distante fica mais perto e mais estreito.
    expect(larguraDistante).toBeGreaterThan(larguraProxima)
    expect(cimaEsq.cotaTerreno).toBeGreaterThan(baixoEsq.cotaTerreno)
  })

  it('deixa cantos por cortar quando a camara aponta ao horizonte', () => {
    const horizonte = projectarEnquadramento(
      { ...base, gimbalPitch: 0 },
      plano(200),
      { alcance: 1500, passo: 5 },
    )
    expect(horizonte.cantos.some((c) => c === null)).toBe(true)
  })
})
