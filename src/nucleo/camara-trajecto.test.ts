import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { deslocar } from './geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from './operacoes-rota.ts'
import {
  aplicarModoAosWaypoints,
  atitudeNoTroco,
  atitudeNoWaypoint,
  atitudeParaOAlvo,
  interpolarAngulo,
  posicaoNoTroco,
} from './camara-trajecto.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Rota em linha recta para leste, com `troco` metros entre pontos. */
function rotaRecta(alturas: readonly number[], troco = 200): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (const [i, altura] of alturas.entries()) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura, index: i }))
    ponto = deslocar(ponto, 90, troco)
  }
  return rota
}

describe('interpolacao de angulos', () => {
  it('vai pelo lado curto do circulo', () => {
    // O erro classico daria 180: meia volta onde a aeronave faz vinte graus.
    expect(interpolarAngulo(350, 10, 0.5)).toBeCloseTo(0, 6)
  })

  it('tambem pelo lado curto no sentido contrario', () => {
    expect(interpolarAngulo(10, 350, 0.5)).toBeCloseTo(0, 6)
  })

  it('devolve os extremos tal e qual', () => {
    expect(interpolarAngulo(30, 200, 0)).toBeCloseTo(30, 6)
    expect(interpolarAngulo(30, 200, 1)).toBeCloseTo(200, 6)
  })

  it('nunca sai do intervalo de zero a 360', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const valor = interpolarAngulo(350, 30, t)
      expect(valor).toBeGreaterThanOrEqual(0)
      expect(valor).toBeLessThan(360)
    }
  })
})

describe('olhar para um alvo', () => {
  it('a mesma altura, olha-se na horizontal', () => {
    const rota = rotaRecta([60, 60])
    const [a, b] = rota.waypoints
    if (!a || !b) throw new Error('waypoints em falta')

    const atitude = atitudeParaOAlvo(a, b)
    expect(atitude.guinada).toBeCloseTo(90, 1)
    expect(atitude.gimbalPitch).toBeCloseTo(0, 3)
  })

  it('para um ponto mais baixo, olha-se para baixo', () => {
    const rota = rotaRecta([100, 0], 100)
    const [a, b] = rota.waypoints
    if (!a || !b) throw new Error('waypoints em falta')

    // Cem metros a descer em cem de percurso sao 45 graus.
    expect(atitudeParaOAlvo(a, b).gimbalPitch).toBeCloseTo(-45, 1)
  })

  it('dois pontos na mesma vertical nao tem rumo, e olha-se a prumo', () => {
    const rota = rotaRecta([60, 20], 0)
    const [a, b] = rota.waypoints
    if (!a || !b) throw new Error('waypoints em falta')
    expect(atitudeParaOAlvo(a, b).gimbalPitch).toBe(-90)
  })
})

describe('atitude em cada waypoint', () => {
  it('o modo manter devolve o que esta gravado', () => {
    let rota = rotaRecta([60, 60])
    rota = {
      ...rota,
      waypoints: rota.waypoints.map((w) => ({ ...w, gimbalPitch: -12, gimbalYaw: 25, guinada: 200 })),
    }
    expect(atitudeNoWaypoint(rota, 0, 'manter')).toEqual({
      guinada: 200,
      gimbalPitch: -12,
      gimbalYaw: 25,
    })
  })

  it('o modo terreno poe a camara a prumo', () => {
    const atitude = atitudeNoWaypoint(rotaRecta([60, 60]), 0, 'terreno')
    expect(atitude.gimbalPitch).toBe(-90)
    expect(atitude.gimbalYaw).toBe(0)
  })

  it('o modo proximoWaypoint aponta ao ponto seguinte', () => {
    const atitude = atitudeNoWaypoint(rotaRecta([60, 60]), 0, 'proximoWaypoint')
    expect(atitude.guinada).toBeCloseTo(90, 1)
    expect(atitude.gimbalPitch).toBeCloseTo(0, 2)
  })

  it('no ultimo ponto mantem-se a olhar como vinha, em vez de saltar', () => {
    const rota = rotaRecta([60, 60, 60])
    const ultimo = atitudeNoWaypoint(rota, 2, 'proximoWaypoint')
    const penultimo = atitudeNoWaypoint(rota, 1, 'proximoWaypoint')
    expect(ultimo.guinada).toBeCloseTo(penultimo.guinada, 1)
  })

  it('nao rebenta numa rota vazia', () => {
    const vazia = rotaRecta([])
    expect(() => atitudeNoWaypoint(vazia, 0, 'proximoWaypoint')).not.toThrow()
  })
})

describe('atitude ao longo do troco', () => {
  /** Rota que vira: primeiro para leste, depois para norte. */
  function rotaQueVira(): Rota {
    let rota = rotaVazia({
      nome: 'ensaio',
      projetoId: 'p',
      droneId: 'mini5pro',
      pontoDescolagem: DESCOLAGEM,
    })
    const a = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
    const b = deslocar(a, 90, 200)
    const c = deslocar(b, 0, 200)

    for (const [i, ponto] of [a, b, c].entries()) {
      rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: i }))
    }
    return rota
  }

  it('a meio do troco a camara esta a meio caminho entre as duas atitudes', () => {
    const rota = rotaQueVira()
    // No waypoint 1 olha-se a norte (0); no 0 olha-se a leste (90).
    const meio = atitudeNoTroco(rota, 0, 0.5, 'proximoWaypoint')
    expect(meio.guinada).toBeCloseTo(45, 0)
  })

  it('nos extremos bate certo com a atitude de cada waypoint', () => {
    const rota = rotaQueVira()
    expect(atitudeNoTroco(rota, 0, 0, 'proximoWaypoint').guinada).toBeCloseTo(
      atitudeNoWaypoint(rota, 0, 'proximoWaypoint').guinada,
      3,
    )
    expect(atitudeNoTroco(rota, 0, 1, 'proximoWaypoint').guinada).toBeCloseTo(
      atitudeNoWaypoint(rota, 1, 'proximoWaypoint').guinada,
      3,
    )
  })

  it('a transicao e continua, sem saltos pelo caminho', () => {
    const rota = rotaQueVira()
    let anterior = atitudeNoTroco(rota, 0, 0, 'proximoWaypoint').guinada

    for (let t = 0.05; t <= 1; t += 0.05) {
      const agora = atitudeNoTroco(rota, 0, t, 'proximoWaypoint').guinada
      const salto = Math.abs(((agora - anterior + 540) % 360) - 180)
      // Cinco por cento de um quarto de volta sao uns cinco graus.
      expect(salto).toBeLessThan(10)
      anterior = agora
    }
  })

  it('no ultimo troco nao ha para onde interpolar e fica-se pela atitude do ponto', () => {
    const rota = rotaQueVira()
    expect(atitudeNoTroco(rota, 2, 0.5, 'proximoWaypoint')).toEqual(
      atitudeNoWaypoint(rota, 2, 'proximoWaypoint'),
    )
  })
})

describe('posicao ao longo do troco', () => {
  it('a meio esta a meio, em posicao e em altura', () => {
    const rota = rotaRecta([60, 100], 200)
    const meio = posicaoNoTroco(rota, 0, 0.5)
    if (!meio) throw new Error('sem posicao')

    expect(meio.altura).toBeCloseTo(80, 6)
    const a = rota.waypoints[0]
    const b = rota.waypoints[1]
    if (!a || !b) throw new Error('waypoints em falta')
    expect(meio.posicao.lon).toBeCloseTo((a.lon + b.lon) / 2, 9)
  })

  it('nao inventa posicao onde nao ha waypoint', () => {
    expect(posicaoNoTroco(rotaRecta([]), 0, 0.5)).toBeNull()
  })
})

describe('fixar o modo nos waypoints', () => {
  it('escreve os angulos calculados e volta ao modo manter', () => {
    const rota = rotaRecta([60, 60, 60])
    const fixada = aplicarModoAosWaypoints(rota, 'terreno')

    expect(fixada.modoCamaraTrajecto).toBe('manter')
    for (const waypoint of fixada.waypoints) {
      expect(waypoint.gimbalPitch).toBe(-90)
      expect(waypoint.gimbalYaw).toBe(0)
    }
  })

  it('o modo manter nao mexe em nada', () => {
    const rota = rotaRecta([60, 60])
    expect(aplicarModoAosWaypoints(rota, 'manter')).toBe(rota)
  })

  it('fixar o rumo ao proximo ponto deixa a guinada fixa e nao herdada', () => {
    const fixada = aplicarModoAosWaypoints(rotaRecta([60, 60]), 'proximoWaypoint')
    expect(fixada.waypoints[0]?.modoGuinada).toBe('fixed')
    expect(fixada.waypoints[0]?.guinada).toBeCloseTo(90, 1)
  })
})
