import { describe, it, expect } from 'vitest'
import type { Rota, Waypoint } from '../nucleo/tipos.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { calcularPerfil } from '../nucleo/perfil.ts'
import { chaveDaPosicao } from './useCotasTerreno.ts'
import { aeronaveDoReplay, aeronaveNoPerfil, alvoDaCamara, type Comando } from './alvo-camara.ts'

/**
 * O alvo da camara decide o que a pre-visualizacao do enquadramento mostra, e
 * essa e a parte que ja saiu errada duas vezes sem ninguem dar por isso.
 */

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 356 }

/** Uma rota para leste, em AGL. */
function rota(quantos = 3, altura = 60): Rota {
  let r = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  r = { ...r, modoAltitude: 'AGL' }

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < quantos; i++) {
    r = acrescentarWaypoint(r, waypointNovo({ ...ponto, altura, index: i }))
    ponto = deslocar(ponto, 90, 200)
  }
  return r
}

function cotasDe(r: Rota, valor = 400): Map<string, number> {
  return new Map(r.waypoints.map((w) => [chaveDaPosicao(w), valor]))
}

const semComando: Comando = { replay: null, voo: null, seleccionado: null }

/** Um waypoint que existe, sem o `!` a espalhar-se pelos testes. */
function wp(r: Rota, i: number): Waypoint {
  const encontrado = r.waypoints[i]
  if (!encontrado) throw new Error(`nao ha waypoint ${i}`)
  return encontrado
}

function estadoDeReplay(indice: number, fraccao: number, guinada = 90) {
  const r = rota()
  const w = wp(r, indice)
  return {
    indice,
    fraccao,
    parada: false,
    posicao: { lat: w.lat, lon: w.lon },
    altura: 60,
    atitude: { guinada, gimbalPitch: -30, gimbalYaw: 0 },
  }
}

describe('alvo da camara', () => {
  it('sem nada escolhido nao ha alvo', () => {
    const r = rota()
    expect(alvoDaCamara(r, cotasDe(r), semComando)).toBeNull()
  })

  it('um waypoint seleccionado da o alvo', () => {
    const r = rota()
    const alvo = alvoDaCamara(r, cotasDe(r), { ...semComando, seleccionado: wp(r, 0) })
    expect(alvo?.posicao).toEqual({ lat: wp(r, 0).lat, lon: wp(r, 0).lon })
  })

  it('em AGL a altura do alvo e a cota do terreno mais a altura', () => {
    const r = rota(3, 60)
    const alvo = alvoDaCamara(r, cotasDe(r, 400), { ...semComando, seleccionado: wp(r, 0) })
    expect(alvo?.alturaASL).toBe(460)
  })

  it('sem cota do terreno nao ha alvo', () => {
    /*
     * Sem cota nao ha altura ASL que se calcule, e a marcha dos raios partiria
     * de um sitio que nao e o certo.
     */
    const r = rota()
    expect(alvoDaCamara(r, new Map(), { ...semComando, seleccionado: wp(r, 0) })).toBeNull()
  })

  it('o rumo sai do modo de guinada, e nao do campo por preencher', () => {
    /*
     * Este e o primeiro dos dois defeitos. Em `followWayline` o campo esta por
     * preencher e lia-se zero: a previsao mostrava o que estava a norte em vez
     * do que a foto ia apanhar, numa rota que anda para leste.
     */
    const r = rota()
    expect(wp(r, 0).modoGuinada).toBe('followWayline')
    expect(wp(r, 0).guinada).toBeUndefined()

    const alvo = alvoDaCamara(r, cotasDe(r), { ...semComando, seleccionado: wp(r, 0) })
    expect(alvo?.guinada).toBeCloseTo(90, 1)
  })

  it('a rotacao do gimbal chega ao alvo', () => {
    /*
     * O segundo defeito. A previsao ignorava o `gimbalYaw` e mostrava o que a
     * aeronave tinha pela frente, que nao e o que a foto vai apanhar.
     */
    const r = rota()
    const virado: Waypoint = { ...wp(r, 0), gimbalYaw: 45, gimbalPitch: -20 }
    const alvo = alvoDaCamara(r, cotasDe(r), { ...semComando, seleccionado: virado })
    expect(alvo?.gimbalYaw).toBe(45)
    expect(alvo?.gimbalPitch).toBe(-20)
  })

  it('o leitor manda sobre a seleccao', () => {
    const r = rota()
    const alvo = alvoDaCamara(r, cotasDe(r), {
      replay: estadoDeReplay(1, 0, 123),
      voo: null,
      seleccionado: wp(r, 0),
    })
    expect(alvo?.guinada).toBe(123)
  })

  it('o voo virtual manda sobre a seleccao, e o leitor sobre o voo', () => {
    const r = rota()
    const voo = {
      posicao: { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon },
      altura: 90,
      guinada: 200,
      gimbalPitch: -45,
      gimbalYaw: 10,
    }

    expect(alvoDaCamara(r, cotasDe(r), { ...semComando, voo })?.guinada).toBe(200)
    expect(
      alvoDaCamara(r, cotasDe(r), { replay: estadoDeReplay(0, 0, 77), voo, seleccionado: null })
        ?.guinada,
    ).toBe(77)
  })

  it('a meio de um troco a cota interpola-se entre os dois waypoints', () => {
    /*
     * As cotas conhecidas sao as dos waypoints, e a meio do caminho nao ha
     * nenhuma. O erro e o desvio do terreno em relacao a recta que os une.
     */
    const r = rota()
    const cotas = new Map([
      [chaveDaPosicao(wp(r, 0)), 300],
      [chaveDaPosicao(wp(r, 1)), 500],
    ])

    const meio = alvoDaCamara(r, cotas, {
      ...semComando,
      replay: { ...estadoDeReplay(0, 0.5), altura: 0 },
    })
    expect(meio?.alturaASL).toBe(400)
  })

  it('sem cota do waypoint de onde se vem usa-se a cota da descolagem', () => {
    const r = rota()
    const alvo = alvoDaCamara(r, new Map(), {
      ...semComando,
      replay: { ...estadoDeReplay(0, 0.5), altura: 0 },
    })
    expect(alvo?.alturaASL).toBe(DESCOLAGEM.cotaTerreno)
  })

  it('no ultimo waypoint fica-se pela cota que se conhece', () => {
    const r = rota(2)
    const cotas = new Map([[chaveDaPosicao(wp(r, 1)), 500]])
    const alvo = alvoDaCamara(r, cotas, {
      ...semComando,
      replay: { ...estadoDeReplay(1, 0.7), altura: 0 },
    })
    expect(alvo?.alturaASL).toBe(500)
  })

  it('o voo virtual fora das cotas conhecidas cai na cota da descolagem', () => {
    const r = rota()
    const longe = deslocar(DESCOLAGEM, 0, 5000)
    const alvo = alvoDaCamara(r, cotasDe(r), {
      ...semComando,
      voo: { posicao: longe, altura: 0, guinada: 0, gimbalPitch: -30, gimbalYaw: 0 },
    })
    expect(alvo?.alturaASL).toBe(DESCOLAGEM.cotaTerreno)
  })
})

describe('aeronave do leitor no mapa', () => {
  it('vem maior e pintada, para nao se confundir com os waypoints', () => {
    const aeronave = aeronaveDoReplay(estadoDeReplay(0, 0), 460)
    expect(aeronave.aumento).toBeGreaterThan(1)
    expect(aeronave.tinta).toBeDefined()
    expect(aeronave.comAparelho).toBe(true)
  })

  it('nao vem seleccionada nem em alerta: nao e um waypoint', () => {
    const aeronave = aeronaveDoReplay(estadoDeReplay(0, 0), 460)
    expect(aeronave.seleccionado).toBe(false)
    expect(aeronave.alerta).toBe(false)
  })

  it('a altura e a que o alvo da camara calculou', () => {
    expect(aeronaveDoReplay(estadoDeReplay(0, 0), 512).alturaVoo).toBe(512)
  })

  it('leva a atitude do instante', () => {
    const aeronave = aeronaveDoReplay(estadoDeReplay(1, 0.5, 250), 460)
    expect(aeronave.guinada).toBe(250)
    expect(aeronave.gimbalPitch).toBe(-30)
  })
})

describe('aeronave no corte do terreno', () => {
  const r = rota(3)
  /* O corte amostrado entre waypoints: um ponto por waypoint chega para isto. */
  const amostrado = {
    pontos: r.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    cotas: r.waypoints.map(() => 400),
  }
  const perfil = calcularPerfil(r, amostrado, cotasDe(r), chaveDaPosicao)

  /** A marca do waypoint `indice` no perfil. */
  function marca(indice: number) {
    const encontrada = perfil.waypoints.find((m) => m.indice === indice)
    if (!encontrada) throw new Error(`o perfil nao tem o waypoint ${indice}`)
    return encontrada
  }

  it('no waypoint cai no percurso do waypoint', () => {
    const onde = aeronaveNoPerfil(perfil, { ...estadoDeReplay(1, 0), parada: true }, 460)
    expect(onde?.percurso).toBe(marca(1).percurso)
  })

  it('a meio do troco interpola pela fraccao de tempo', () => {
    /*
     * O troco e percorrido a velocidade constante, portanto a fraccao de tempo
     * dentro dele e a mesma fraccao de distancia.
     */
    const esperado = marca(0).percurso + (marca(1).percurso - marca(0).percurso) / 2
    expect(aeronaveNoPerfil(perfil, estadoDeReplay(0, 0.5), 460)?.percurso).toBeCloseTo(esperado, 6)
  })

  it('parada num waypoint nao avanca, mesmo com fraccao', () => {
    const onde = aeronaveNoPerfil(perfil, { ...estadoDeReplay(0, 0.9), parada: true }, 460)
    expect(onde?.percurso).toBe(marca(0).percurso)
  })

  it('no ultimo waypoint nao ha para onde interpolar', () => {
    expect(aeronaveNoPerfil(perfil, estadoDeReplay(2, 0.5), 460)?.percurso).toBe(marca(2).percurso)
  })

  it('a altura passa tal e qual', () => {
    expect(aeronaveNoPerfil(perfil, estadoDeReplay(0, 0), 777)?.aslVoo).toBe(777)
  })
})
