import { describe, expect, it } from 'vitest'
import {
  acrescentarOrbita,
  apontaMesmoAoCentro,
  gerarOrbita,
  inclinacaoParaOCentro,
  type OpcoesOrbita,
} from './orbita.ts'
import { PITCH_MAXIMO, PITCH_MINIMO } from './voo.ts'
import { distancia, rumo } from './geodesia.ts'
import { rotaVazia } from './operacoes-rota.ts'
import type { POI, Rota } from './tipos.ts'

const CENTRO: POI = { id: 'poi1', nome: 'Posto', lat: 40.746552, lon: -8.41061, altura: 0 }

function opcoes(alteracoes: Partial<OpcoesOrbita> = {}): OpcoesOrbita {
  return {
    centro: CENTRO,
    raio: 40,
    acimaDoPonto: 30,
    passoGraus: 30,
    rumoInicial: 0,
    horario: true,
    comFoto: true,
    ...alteracoes,
  }
}

function rotaDeEnsaio(): Rota {
  return rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: { lat: CENTRO.lat, lon: CENTRO.lon, cotaTerreno: 100 },
  })
}

describe('inclinacaoParaOCentro', () => {
  /*
   * Tres casos que se verificam de cabeca, e um triangulo conhecido.
   */
  it('a altura do proprio ponto, a camara olha a direito', () => {
    expect(inclinacaoParaOCentro(40, 0)).toBeCloseTo(0, 9)
  })

  it('tantos metros acima como ao lado da quarenta e cinco graus', () => {
    expect(inclinacaoParaOCentro(30, 30)).toBeCloseTo(-45, 9)
  })

  it('o triangulo 3-4-5 da os seus graus', () => {
    /* 30 acima e 40 ao lado: a tangente e 0,75. */
    expect(inclinacaoParaOCentro(40, 30)).toBeCloseTo(-36.8699, 3)
  })

  it('sem raio nenhum e a prumo', () => {
    expect(inclinacaoParaOCentro(0, 30)).toBe(-90)
  })

  it('nunca passa dos noventa', () => {
    for (const acima of [1, 10, 100, 10000]) {
      expect(inclinacaoParaOCentro(1, acima)).toBeGreaterThan(-90)
    }
  })
})

describe('gerarOrbita', () => {
  it('todos os pontos ficam a mesma distancia do centro', () => {
    const orbita = gerarOrbita(opcoes({ raio: 60 }))
    for (const ponto of orbita.pontos) {
      expect(distancia(CENTRO, ponto)).toBeCloseTo(60, 1)
    }
  })

  it('o passo pedido da o numero de pontos que divide a volta', () => {
    expect(gerarOrbita(opcoes({ passoGraus: 30 })).pontos).toHaveLength(12)
    expect(gerarOrbita(opcoes({ passoGraus: 45 })).pontos).toHaveLength(8)
    expect(gerarOrbita(opcoes({ passoGraus: 90 })).pontos).toHaveLength(4)
  })

  /*
   * 50 graus nao divide 360. Fechar a volta com um troco mais curto do que os
   * outros dava um salto visivel no ultimo waypoint, e por isso usa-se o passo
   * que divide - aqui 51,43 - em vez do que se pediu.
   */
  it('um passo que nao divide a volta e arredondado ao que divide', () => {
    const orbita = gerarOrbita(opcoes({ passoGraus: 50, raio: 100 }))
    expect(orbita.pontos).toHaveLength(7)

    const trocos = orbita.pontos.map((p, i) =>
      distancia(p, orbita.pontos[(i + 1) % orbita.pontos.length]!),
    )
    const maior = Math.max(...trocos)
    const menor = Math.min(...trocos)
    expect(maior - menor).toBeLessThan(0.5)
  })

  it('nunca desce abaixo de tres pontos', () => {
    expect(gerarOrbita(opcoes({ passoGraus: 720 })).pontos.length).toBeGreaterThanOrEqual(3)
  })

  it('comeca no rumo pedido', () => {
    const orbita = gerarOrbita(opcoes({ rumoInicial: 90 }))
    expect(rumo(CENTRO, orbita.pontos[0]!)).toBeCloseTo(90, 1)
  })

  it('o sentido horario cresce no rumo, o outro decresce', () => {
    const horaria = gerarOrbita(opcoes({ horario: true, rumoInicial: 0, passoGraus: 90 }))
    const anti = gerarOrbita(opcoes({ horario: false, rumoInicial: 0, passoGraus: 90 }))
    expect(rumo(CENTRO, horaria.pontos[1]!)).toBeCloseTo(90, 1)
    expect(rumo(CENTRO, anti.pontos[1]!)).toBeCloseTo(270, 1)
  })

  /*
   * O percurso e a soma das cordas e nao o perimetro do circulo. Sao coisas
   * diferentes, e com poucos pontos a diferenca passa dos cinco por cento: a
   * aeronave voa em linha recta de waypoint em waypoint.
   */
  it('o percurso e a soma das cordas, sempre menor do que a circunferencia', () => {
    const raio = 100
    const orbita = gerarOrbita(opcoes({ raio, passoGraus: 90 }))
    const circunferencia = 2 * Math.PI * raio

    expect(orbita.distancia).toBeLessThan(circunferencia)
    /* Quatro pontos: um quadrado inscrito, de lado raio*sqrt(2). */
    expect(orbita.distancia).toBeCloseTo(4 * raio * Math.SQRT2, 5)
  })

  it('com muitos pontos aproxima-se da circunferencia', () => {
    const raio = 100
    const orbita = gerarOrbita(opcoes({ raio, passoGraus: PASSO_FINO }))
    expect(orbita.distancia).toBeCloseTo(2 * Math.PI * raio, 0)
  })

  it('a altura conta-se a partir da do ponto', () => {
    const alto: POI = { ...CENTRO, altura: 50 }
    expect(gerarOrbita(opcoes({ centro: alto, acimaDoPonto: 30 })).altura).toBe(80)
  })

  it('sem raio nao ha orbita', () => {
    expect(gerarOrbita(opcoes({ raio: 0 })).pontos).toEqual([])
    expect(gerarOrbita(opcoes({ raio: 0 })).distancia).toBe(0)
  })
})

const PASSO_FINO = 5

describe('acrescentarOrbita', () => {
  it('os waypoints ficam presos ao ponto, e nao com o rumo escrito', () => {
    const o = opcoes()
    const rota = acrescentarOrbita(rotaDeEnsaio(), gerarOrbita(o), o)
    expect(rota.waypoints).toHaveLength(12)
    for (const w of rota.waypoints) {
      expect(w.modoGuinada).toBe('towardPOI')
      expect(w.poiId).toBe('poi1')
    }
  })

  it('todos levam a inclinacao que aponta ao centro', () => {
    const o = opcoes({ raio: 30, acimaDoPonto: 30 })
    const orbita = gerarOrbita(o)
    const rota = acrescentarOrbita(rotaDeEnsaio(), orbita, o)
    for (const w of rota.waypoints) expect(w.gimbalPitch).toBeCloseTo(-45, 9)
  })

  /*
   * Com foto, para no ponto. Uma foto tirada em movimento numa curva sai
   * arrastada, e uma orbita e toda ela curva.
   */
  it('com foto para no ponto, sem foto passa suave', () => {
    const comFoto = opcoes({ comFoto: true })
    const sem = opcoes({ comFoto: false })
    const a = acrescentarOrbita(rotaDeEnsaio(), gerarOrbita(comFoto), comFoto)
    const b = acrescentarOrbita(rotaDeEnsaio(), gerarOrbita(sem), sem)

    expect(a.waypoints.every((w) => w.tipoCurva === 'pararNoPonto')).toBe(true)
    expect(a.waypoints.every((w) => w.acoes.some((x) => x.tipo === 'tirarFoto'))).toBe(true)
    expect(b.waypoints.every((w) => w.tipoCurva === 'passarSuave')).toBe(true)
    expect(b.waypoints.every((w) => w.acoes.length === 0)).toBe(true)
  })

  it('vai para o fim do que ja la estava, e renumera', () => {
    const o = opcoes({ passoGraus: 120 })
    let rota = acrescentarOrbita(rotaDeEnsaio(), gerarOrbita(o), o)
    rota = acrescentarOrbita(rota, gerarOrbita(o), o)
    expect(rota.waypoints).toHaveLength(6)
    expect(rota.waypoints.map((w) => w.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('uma orbita vazia nao mexe na rota', () => {
    const o = opcoes({ raio: 0 })
    const antes = rotaDeEnsaio()
    expect(acrescentarOrbita(antes, gerarOrbita(o), o)).toBe(antes)
  })
})

describe('os limites do estabilizador', () => {
  /*
   * Uma rota que peca oitenta graus para cima nao e uma rota que enquadra mal:
   * e uma rota que o aparelho nao aceita. O resto da aplicacao trabalha entre
   * -90 e +45, e a orbita tem de trabalhar nos mesmos.
   */
  it('nunca sai do intervalo que o resto da aplicacao usa', () => {
    for (const raio of [1, 5, 40, 500]) {
      for (const acima of [-100, -40, -1, 0, 1, 40, 120]) {
        const pitch = inclinacaoParaOCentro(raio, acima)
        expect(pitch).toBeGreaterThanOrEqual(PITCH_MINIMO)
        expect(pitch).toBeLessThanOrEqual(PITCH_MAXIMO)
      }
    }
  })

  it('olhar para cima de muito perto bate no limite', () => {
    /* 40 abaixo do alvo e a 10 dele daria +76 graus, que nao existe. */
    expect(apontaMesmoAoCentro(10, -40)).toBe(false)
    expect(inclinacaoParaOCentro(10, -40)).toBe(PITCH_MAXIMO)
  })

  it('a 45 graus para cima ainda aponta ao centro', () => {
    expect(apontaMesmoAoCentro(30, -30)).toBe(true)
    expect(inclinacaoParaOCentro(30, -30)).toBeCloseTo(45, 9)
  })

  it('a olhar para baixo nunca bate: 90 e o proprio limite', () => {
    expect(apontaMesmoAoCentro(1, 1000)).toBe(true)
    expect(inclinacaoParaOCentro(1, 1000)).toBeGreaterThan(PITCH_MINIMO)
  })

  it('sem raio nao ha centro para onde apontar', () => {
    expect(apontaMesmoAoCentro(0, 30)).toBe(false)
  })

  it('a orbita gerada leva o angulo ja preso aos limites', () => {
    const o = opcoes({ raio: 10, acimaDoPonto: -40 })
    const rota = acrescentarOrbita(rotaDeEnsaio(), gerarOrbita(o), o)
    for (const w of rota.waypoints) expect(w.gimbalPitch).toBe(PITCH_MAXIMO)
  })
})
