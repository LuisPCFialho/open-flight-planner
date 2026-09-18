import { describe, it, expect } from 'vitest'
import type { Rota, Waypoint } from '../nucleo/tipos.ts'
import { deslocar, distancia } from '../nucleo/geodesia.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { calcularPerfil } from '../nucleo/perfil.ts'
import { chaveDaPosicao } from './useCotasTerreno.ts'
import {
  aeronaveDoReplay,
  aeronaveNoPerfil,
  alvoDaCamara,
  ALCANCE_DOS_RAIOS,
  arestasDoEnquadramento,
  setaDoRumo,
  type Comando,
} from './alvo-camara.ts'

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

describe('piramide do enquadramento', () => {
  const canto = (lat: number, lon: number) => ({
    ponto: { lat, lon },
    cotaTerreno: 350,
    distancia: 100,
  })

  /*
   * Direccoes dos quatro raios de canto, unitarias como as que
   * `projectarEnquadramento` produz. Sem serem unitarias, o comprimento das
   * arestas sairia escalado e o ensaio media outra coisa.
   */
  const direccoes = [
    { este: -0.396491, norte: 0.792982, cima: 0.462573 },
    { este: 0.396491, norte: 0.792982, cima: 0.462573 },
    { este: 0.329293, norte: 0.548821, cima: -0.768350 },
    { este: -0.329293, norte: 0.548821, cima: -0.768350 },
  ]

  const alvo = {
    posicao: { lat: 40.755, lon: -8.405 },
    alturaASL: 420,
    guinada: 0,
    gimbalPitch: -13,
    gimbalYaw: 0,
  }

  /** Os quatro cantos no chao: a foto nadiral, em que todos os raios acertam. */
  const todosNoChao = {
    centro: canto(40.755, -8.405),
    direccoesDosCantos: direccoes,
    cantos: [canto(40.75, -8.41), canto(40.75, -8.4), canto(40.76, -8.4), canto(40.76, -8.41)],
  }

  /**
   * O caso real que estava a falhar: gimbal a treze graus, os dois raios de
   * cima acima do horizonte, so os dois de baixo a tocar no terreno.
   */
  const soOsDeBaixo = {
    centro: canto(40.756, -8.405),
    direccoesDosCantos: direccoes,
    cantos: [null, null, canto(40.76, -8.4), canto(40.76, -8.41)],
  }

  it('sem enquadramento nao ha piramide', () => {
    expect(arestasDoEnquadramento(alvo, null)).toEqual([])
    expect(arestasDoEnquadramento(alvo, undefined)).toEqual([])
  })

  it('com os quatro cantos no chao sao quatro arestas mais a base fechada', () => {
    expect(arestasDoEnquadramento(alvo, todosNoChao)).toHaveLength(4 + 4)
  })

  it('com o gimbal pouco inclinado a piramide aparece na mesma', () => {
    /*
     * Era este o defeito. Com o gimbal a doze ou treze graus - o que uma rota
     * de inspeccao usa - e um campo de visao de oitenta e quatro, os dois raios
     * de cima apontam mais de vinte graus acima do horizonte e nunca cortam o
     * terreno. Exigir que os quatro tocassem no chao fazia a figura nao
     * aparecer precisamente nas rotas que mais precisam dela.
     */
    expect(arestasDoEnquadramento(alvo, soOsDeBaixo)).toHaveLength(4 + 4)
  })

  it('sem canto nenhum no chao continua a haver piramide', () => {
    // Camara toda acima do horizonte: nao ha o que medir, mas ha para onde olha.
    const nenhum = { ...soOsDeBaixo, cantos: [null, null, null, null] }
    expect(arestasDoEnquadramento(alvo, nenhum)).toHaveLength(4 + 4)
  })

  it('as quatro primeiras partem todas do aparelho, a altura de voo', () => {
    for (const aresta of arestasDoEnquadramento(alvo, soOsDeBaixo).slice(0, 4)) {
      expect(aresta.de).toEqual({ lat: alvo.posicao.lat, lon: alvo.posicao.lon, alt: 420 })
    }
  })

  /*
   * O cone da camara nao assenta no terreno, e e de proposito. Assente, a
   * figura crescia com o que estava a ser visto: com o gimbal quase na
   * horizontal os cantos de baixo caem a centenas de metros e a piramide
   * disparava para fora do mapa. Quem continua a dizer o que a foto cobre e a
   * mancha no chao, que essa e calculada contra o terreno a serio.
   */
  it('todas as arestas tem o mesmo comprimento, toquem ou nao no chao', () => {
    const arestas = arestasDoEnquadramento(alvo, soOsDeBaixo)
    const comprimentos = arestas.slice(0, 4).map((aresta) => {
      const plano = distancia(alvo.posicao, { lat: aresta.para.lat, lon: aresta.para.lon })
      return Math.hypot(plano, aresta.para.alt - alvo.alturaASL)
    })

    for (const comprimento of comprimentos) {
      expect(comprimento).toBeCloseTo(ALCANCE_DOS_RAIOS, 0)
    }
  })

  it('nao usa a cota do terreno: dois cantos no chao nao a herdam', () => {
    const arestas = arestasDoEnquadramento(alvo, soOsDeBaixo)
    expect(arestas[2]?.para.alt).not.toBe(350)
    expect(arestas[3]?.para.alt).not.toBe(350)
  })

  it('um canto que nao toca no chao sobe, em vez de desaparecer', () => {
    // O raio aponta acima do horizonte: a ponta fica acima do aparelho.
    const arestas = arestasDoEnquadramento(alvo, soOsDeBaixo)
    expect(arestas[0]?.para.alt).toBeGreaterThan(alvo.alturaASL)
    expect(arestas[1]?.para.alt).toBeGreaterThan(alvo.alturaASL)
  })

  it('a base liga cantos seguidos e volta ao primeiro', () => {
    const base = arestasDoEnquadramento(alvo, todosNoChao).slice(4)
    expect(base).toHaveLength(4)
    expect(base[3]?.para).toEqual(base[0]?.de)
  })

  /*
   * Era proporcional a distancia ao centro visado, e com o gimbal quase na
   * horizontal essa distancia sao centenas de metros: a figura disparava para
   * fora do mapa e tapava a rota inteira. O tamanho passa a ser fixo, e a
   * mancha no chao e que continua a dizer o que a foto cobre.
   */
  it('a piramide tem sempre o mesmo tamanho, olhe-se de perto ou de longe', () => {
    const perto = arestasDoEnquadramento(alvo, {
      ...soOsDeBaixo,
      centro: { ...canto(40.756, -8.405), distancia: 50 },
    })
    const longe = arestasDoEnquadramento(alvo, {
      ...soOsDeBaixo,
      centro: { ...canto(40.756, -8.405), distancia: 500 },
    })

    expect(longe[0]?.para.alt).toBeCloseTo(perto[0]!.para.alt, 6)
    expect(longe[0]?.para.lat).toBeCloseTo(perto[0]!.para.lat, 9)
  })

  it('sem centro visado a piramide usa uma distancia de recurso', () => {
    const semCentro = { ...soOsDeBaixo, centro: null, cantos: [null, null, null, null] }
    const arestas = arestasDoEnquadramento(alvo, semCentro)

    expect(arestas).toHaveLength(8)
    for (const aresta of arestas) {
      expect(Number.isFinite(aresta.para.alt)).toBe(true)
    }
  })
})

describe('seta do rumo', () => {
  /*
   * A marca que diz onde esta a frente. O modelo sozinho nao chega: um
   * quadricoptero visto de cima e quase simetrico a quatro voltas, e a altura de
   * voo a diferenca entre rumo 0 e rumo 90 sao uns pixeis.
   */
  const aeronave = {
    posicao: { lat: 40.755, lon: -8.405 },
    alturaASL: 420,
    guinada: 0,
    gimbalPitch: -13,
    gimbalYaw: 0,
  }
  const emRumo = (guinada: number) => setaDoRumo({ ...aeronave, guinada })

  it('sao tres segmentos: a haste e duas farpas', () => {
    expect(emRumo(0)).toHaveLength(3)
  })

  it('parte sempre da aeronave', () => {
    const [haste] = emRumo(0)
    expect(haste?.de.lat).toBeCloseTo(aeronave.posicao.lat, 9)
    expect(haste?.de.lon).toBeCloseTo(aeronave.posicao.lon, 9)
  })

  it('com rumo a norte aponta a norte', () => {
    const [haste] = emRumo(0)
    expect(haste!.para.lat).toBeGreaterThan(aeronave.posicao.lat)
    expect(haste!.para.lon).toBeCloseTo(aeronave.posicao.lon, 6)
  })

  it('com rumo a leste aponta a leste', () => {
    const [haste] = emRumo(90)
    expect(haste!.para.lon).toBeGreaterThan(aeronave.posicao.lon)
    expect(haste!.para.lat).toBeCloseTo(aeronave.posicao.lat, 6)
  })

  it('com rumo a sul aponta a sul: nao ha simetria que a confunda', () => {
    const [haste] = emRumo(180)
    expect(haste!.para.lat).toBeLessThan(aeronave.posicao.lat)
  })

  it('tem sempre o mesmo comprimento, seja qual for o rumo', () => {
    const comprimento = (guinada: number): number => {
      const [haste] = emRumo(guinada)
      return distancia({ lat: haste!.de.lat, lon: haste!.de.lon }, haste!.para)
    }
    expect(comprimento(37)).toBeCloseTo(comprimento(213), 3)
  })

  it('fica toda a altura de voo: e uma marca no ar, nao no chao', () => {
    for (const segmento of emRumo(45)) {
      expect(segmento.de.alt).toBe(aeronave.alturaASL)
      expect(segmento.para.alt).toBe(aeronave.alturaASL)
    }
  })

  it('leva cor propria, para nao se confundir com a piramide da camara', () => {
    expect(emRumo(0).every((s) => s.cor !== undefined)).toBe(true)
  })
})
