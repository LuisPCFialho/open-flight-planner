import { describe, it, expect } from 'vitest'
import type { Rota } from './tipos.ts'
import { deslocar } from './geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from './operacoes-rota.ts'
import { calcularEstatisticas } from './estatisticas.ts'
import {
  degrauDaVelocidade,
  duracaoDoReplay,
  estadoNoInstante,
  formatarRelogio,
  formatarVelocidade,
  paragemNoWaypoint,
  trechosDoReplay,
  velocidadeNoDegrau,
  VELOCIDADE_REAL,
  VELOCIDADES_REPLAY,
} from './replay.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Rota em linha recta para leste, com `troco` metros entre pontos. */
function rotaRecta(quantos: number, troco = 200, velocidade = 10): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, velocidadeGlobal: velocidade }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: 60, index: i }))
    ponto = deslocar(ponto, 90, troco)
  }
  // Sem paragens, para os testes de percurso darem numeros redondos.
  return {
    ...rota,
    waypoints: rota.waypoints.map((w) => ({ ...w, tipoCurva: 'passarSuave' as const })),
  }
}

describe('trechos do replay', () => {
  it('uma rota vazia nao tem trechos nem duracao', () => {
    const vazia = rotaRecta(0)
    expect(trechosDoReplay(vazia)).toEqual([])
    expect(duracaoDoReplay(vazia)).toBe(0)
  })

  it('um so waypoint nao tem percurso nenhum', () => {
    expect(trechosDoReplay(rotaRecta(1))).toEqual([])
  })

  it('dois pontos a 200 m e 10 m/s dao 20 segundos', () => {
    const trechos = trechosDoReplay(rotaRecta(2, 200, 10))
    expect(trechos).toHaveLength(1)
    expect(trechos[0]?.duracao).toBeCloseTo(20, 1)
  })

  it('os trechos encaixam uns nos outros sem buracos', () => {
    const trechos = trechosDoReplay(rotaRecta(5))
    for (let i = 1; i < trechos.length; i++) {
      const anterior = trechos[i - 1]
      const actual = trechos[i]
      if (!anterior || !actual) throw new Error('trecho em falta')
      expect(actual.inicio).toBeCloseTo(anterior.inicio + anterior.duracao, 9)
    }
  })

  it('um troco a velocidade nula nao entra, em vez de dar duracao infinita', () => {
    /*
     * Dividir por zero punha um infinito a alastrar pelo relogio todo. E o
     * mesmo cuidado que `calcularEstatisticas` ja tem: quem reporta o problema
     * ao utilizador e a validacao de velocidades, pelo nome.
     */
    const rota = rotaRecta(3)
    const comZero: Rota = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) => (i === 1 ? { ...w, velocidade: 0 } : w)),
    }
    expect(Number.isFinite(duracaoDoReplay(comZero))).toBe(true)
  })

  it('o relogio do replay bate com a duracao da barra de estatisticas', () => {
    // Se discordassem, um dos dois estaria a mentir ao utilizador.
    const rota = rotaRecta(6, 250, 8)
    expect(duracaoDoReplay(rota)).toBeCloseTo(calcularEstatisticas(rota).duracao, 6)
  })

  it('o relogio bate tambem com paragens e fotos pelo meio', () => {
    const base = rotaRecta(4)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w, i) =>
        i === 1
          ? { ...w, tipoCurva: 'pararNoPonto' as const, acoes: [{ tipo: 'pairar', segundos: 5 }] }
          : w,
      ),
    }
    expect(duracaoDoReplay(rota)).toBeCloseTo(calcularEstatisticas(rota).duracao, 6)
  })
})

describe('paragem num waypoint', () => {
  it('sem accoes e a passar suave nao ha paragem', () => {
    expect(paragemNoWaypoint(rotaRecta(3), 1)).toBe(0)
  })

  it('o tempo a pairar conta', () => {
    const base = rotaRecta(3)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w, i) =>
        i === 1 ? { ...w, acoes: [{ tipo: 'pairar', segundos: 7 }] } : w,
      ),
    }
    expect(paragemNoWaypoint(rota, 1)).toBeCloseTo(7, 6)
  })

  it('parar no ponto custa velocidade a dividir pela aceleracao', () => {
    const base = rotaRecta(3, 200, 10)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w) => ({ ...w, tipoCurva: 'pararNoPonto' as const })),
    }
    expect(paragemNoWaypoint(rota, 1, 2)).toBeCloseTo(5, 6)
  })

  it('um waypoint que nao existe nao tem paragem', () => {
    expect(paragemNoWaypoint(rotaRecta(2), 99)).toBe(0)
  })
})

describe('estado num instante', () => {
  it('uma rota sem waypoints nao da estado nenhum', () => {
    expect(estadoNoInstante(rotaRecta(0), 0)).toBeNull()
  })

  it('no instante zero esta no primeiro waypoint', () => {
    const rota = rotaRecta(4)
    const estado = estadoNoInstante(rota, 0)
    expect(estado?.indice).toBe(0)
    expect(estado?.posicao.lat).toBeCloseTo(rota.waypoints[0]?.lat ?? 0, 9)
  })

  it('antes do inicio nao desaparece: fica no principio', () => {
    // A barra de progresso tem de poder ser arrastada ate a ponta.
    expect(estadoNoInstante(rotaRecta(4), -50)?.indice).toBe(0)
  })

  it('depois do fim fica no ultimo waypoint', () => {
    const rota = rotaRecta(4)
    const estado = estadoNoInstante(rota, duracaoDoReplay(rota) + 100)
    expect(estado?.indice).toBe(3)
    expect(estado?.posicao.lon).toBeCloseTo(rota.waypoints[3]?.lon ?? 0, 9)
  })

  it('a meio do primeiro troco esta a meio caminho', () => {
    const rota = rotaRecta(2, 200, 10)
    const estado = estadoNoInstante(rota, 10)
    const a = rota.waypoints[0]
    const b = rota.waypoints[1]
    if (!a || !b || !estado) throw new Error('rota incompleta')

    expect(estado.parada).toBe(false)
    expect(estado.posicao.lon).toBeCloseTo((a.lon + b.lon) / 2, 7)
  })

  it('a posicao avanca sempre, nunca recua', () => {
    const rota = rotaRecta(6, 180, 9)
    const total = duracaoDoReplay(rota)
    let anterior = -Infinity

    for (let t = 0; t <= total; t += total / 60) {
      const estado = estadoNoInstante(rota, t)
      if (!estado) throw new Error('sem estado')
      expect(estado.posicao.lon).toBeGreaterThanOrEqual(anterior - 1e-9)
      anterior = estado.posicao.lon
    }
  })

  it('numa paragem a aeronave fica no sitio e assinala que esta parada', () => {
    const base = rotaRecta(3, 200, 10)
    const rota: Rota = {
      ...base,
      waypoints: base.waypoints.map((w, i) =>
        i === 1 ? { ...w, acoes: [{ tipo: 'pairar', segundos: 10 }] } : w,
      ),
    }
    // 20 s ate ao waypoint 1, e dai 10 s parado.
    const estado = estadoNoInstante(rota, 25)
    expect(estado?.parada).toBe(true)
    expect(estado?.indice).toBe(1)
    expect(estado?.posicao.lon).toBeCloseTo(rota.waypoints[1]?.lon ?? 0, 9)
  })

  it('a camara roda sem saltos ao longo do voo', () => {
    // A transicao suave e o ponto de haver interpolacao; um salto a meio
    // apareceria de imediato em replay.
    const base = rotaRecta(3, 200, 10)
    const rota: Rota = { ...base, modoCamaraTrajecto: 'proximoWaypoint' }
    const total = duracaoDoReplay(rota)

    let anterior = estadoNoInstante(rota, 0)?.atitude.guinada ?? 0
    for (let t = total / 80; t <= total; t += total / 80) {
      const agora = estadoNoInstante(rota, t)?.atitude.guinada ?? 0
      const salto = Math.abs(((agora - anterior + 540) % 360) - 180)
      expect(salto).toBeLessThan(15)
      anterior = agora
    }
  })

  it('no modo terreno a camara esta sempre a prumo', () => {
    const rota: Rota = { ...rotaRecta(4), modoCamaraTrajecto: 'terreno' }
    for (const t of [0, 5, 20, 45]) {
      expect(estadoNoInstante(rota, t)?.atitude.gimbalPitch).toBeCloseTo(-90, 6)
    }
  })

  it('uma rota que nao anda fica parada no unico ponto que tem', () => {
    const estado = estadoNoInstante(rotaRecta(1), 30)
    expect(estado?.parada).toBe(true)
    expect(estado?.indice).toBe(0)
  })
})

describe('relogio', () => {
  it('escreve minutos e segundos com dois digitos', () => {
    expect(formatarRelogio(0)).toBe('0:00')
    expect(formatarRelogio(7)).toBe('0:07')
    expect(formatarRelogio(67)).toBe('1:07')
    expect(formatarRelogio(600)).toBe('10:00')
  })

  it('nao mostra tempo negativo', () => {
    expect(formatarRelogio(-5)).toBe('0:00')
  })
})

describe('degraus de velocidade do leitor', () => {
  it('a lista comeca abaixo do tempo real e vai ate 50x', () => {
    expect(VELOCIDADES_REPLAY[0]).toBe(0.25)
    expect(VELOCIDADES_REPLAY.at(-1)).toBe(50)
  })

  it('a lista sobe sempre, sem repetidos', () => {
    // Um degrau fora de ordem punha a barra a andar para tras a meio.
    for (let i = 1; i < VELOCIDADES_REPLAY.length; i++) {
      expect(VELOCIDADES_REPLAY[i]!).toBeGreaterThan(VELOCIDADES_REPLAY[i - 1]!)
    }
  })

  it('o tempo real esta na lista, e e onde o leitor abre', () => {
    // Sem isto nao havia maneira de voltar ao certo a velocidade verdadeira.
    expect(VELOCIDADES_REPLAY[VELOCIDADE_REAL]).toBe(1)
  })

  it('cada degrau da a sua velocidade', () => {
    for (const [i, v] of VELOCIDADES_REPLAY.entries()) {
      expect(velocidadeNoDegrau(i)).toBe(v)
    }
  })

  it('um degrau fora dos limites fica preso ao extremo', () => {
    expect(velocidadeNoDegrau(-5)).toBe(0.25)
    expect(velocidadeNoDegrau(999)).toBe(50)
  })

  it('o degrau e a velocidade sao um do outro', () => {
    for (const [i, v] of VELOCIDADES_REPLAY.entries()) {
      expect(degrauDaVelocidade(v)).toBe(i)
    }
  })

  it('uma velocidade fora da lista cai no degrau mais proximo', () => {
    // Acontece com um valor gravado de uma versao anterior da lista.
    expect(velocidadeNoDegrau(degrauDaVelocidade(3.5))).toBe(4)
    expect(velocidadeNoDegrau(degrauDaVelocidade(45))).toBe(40)
    expect(velocidadeNoDegrau(degrauDaVelocidade(100))).toBe(50)
  })

  it('a meio caminho entre dois degraus fica-se pelo mais lento', () => {
    // Uma escolha, e a prudente: entre 2x e 4x, o 3 da 2x.
    expect(velocidadeNoDegrau(degrauDaVelocidade(3))).toBe(2)
  })

  it('a velocidade escreve-se com virgula, que e como se le em portugues', () => {
    expect(formatarVelocidade(0.25)).toBe('0,25×')
    expect(formatarVelocidade(1)).toBe('1×')
    expect(formatarVelocidade(50)).toBe('50×')
  })
})
