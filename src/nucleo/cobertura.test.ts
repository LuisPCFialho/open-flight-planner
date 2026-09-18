import { describe, it, expect } from 'vitest'
import type { LatLon, Rota } from './tipos.ts'
import { deslocamentoLocal, deslocar, distancia, rumo } from './geodesia.ts'
import { areaDoContorno } from './areas.ts'
import { acrescentarWaypoint, rotaVazia, waypointNovo } from './operacoes-rota.ts'
import {
  acrescentarCobertura,
  avancoPara,
  gerarCobertura,
  larguraCoberta,
  pontosDaCobertura,
  rumoDoLadoMaisLongo,
  type OpcoesCobertura,
} from './cobertura.ts'

const CENTRO: LatLon = { lat: 40.746552, lon: -8.41061 }

/** Rectangulo com `largura` a leste e `altura` a norte, centrado na origem. */
function rectangulo(largura: number, altura: number, rumoGraus = 0): LatLon[] {
  const sudoeste = deslocar(
    deslocar(CENTRO, 270 + rumoGraus, largura / 2),
    180 + rumoGraus,
    altura / 2,
  )
  const sudeste = deslocar(sudoeste, 90 + rumoGraus, largura)
  const nordeste = deslocar(sudeste, 0 + rumoGraus, altura)
  const noroeste = deslocar(sudoeste, 0 + rumoGraus, altura)
  return [sudoeste, sudeste, nordeste, noroeste]
}

function opcoes(alteracoes: Partial<OpcoesCobertura> = {}): OpcoesCobertura {
  return {
    alturaAcimaDoSolo: 60,
    fovHorizontalGraus: 84,
    proporcao: 4 / 3,
    sobreposicaoLateral: 0.7,
    sobreposicaoFrontal: 0.8,
    rumoGraus: 0,
    margem: 0,
    umPontoPorFoto: false,
    ...alteracoes,
  }
}

describe('largura coberta por uma foto', () => {
  it('sai da altura e do campo de visao', () => {
    // A 60 m com 84 graus: 2 * 60 * tan(42) = 108 m.
    expect(larguraCoberta(60, 84)).toBeCloseTo(108.05, 1)
  })

  it('duplicar a altura duplica a largura', () => {
    expect(larguraCoberta(120, 84)).toBeCloseTo(larguraCoberta(60, 84) * 2, 6)
  })

  it('no chao nao se cobre nada', () => {
    expect(larguraCoberta(0, 84)).toBe(0)
  })

  it('angulos impossiveis nao dao numeros impossiveis', () => {
    expect(larguraCoberta(60, 0)).toBe(0)
    expect(larguraCoberta(60, 180)).toBe(0)
    expect(larguraCoberta(-10, 84)).toBe(0)
  })
})

describe('avanco para a sobreposicao pedida', () => {
  it('sem sobreposicao anda-se a largura toda', () => {
    expect(avancoPara(100, 0)).toBe(100)
  })

  it('com 70% anda-se 30%', () => {
    expect(avancoPara(100, 0.7)).toBeCloseTo(30, 6)
  })

  it('sobreposicao total nao pararia nunca, e por isso e limitada', () => {
    // Sem limite, o avanco seria zero e o gerador nao acabava.
    expect(avancoPara(100, 1)).toBeGreaterThan(0)
  })

  it('valores fora da gama nao dao avanco negativo', () => {
    expect(avancoPara(100, -1)).toBe(100)
    expect(avancoPara(100, 5)).toBeGreaterThan(0)
  })
})

describe('cobertura de um rectangulo', () => {
  it('um contorno degenerado nao produz passagens', () => {
    expect(gerarCobertura([], opcoes()).passagens).toEqual([])
    expect(gerarCobertura([CENTRO, CENTRO], opcoes()).passagens).toEqual([])
  })

  it('o espacamento sai da camara, e nao de um numero escolhido', () => {
    // 108 m de faixa com 70% de sobreposicao dao 32,4 m entre passagens.
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes())
    expect(cobertura.espacamento).toBeCloseTo(32.4, 1)
  })

  it('cobre a area toda: a largura a dividir pelo espacamento da o numero de passagens', () => {
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes())
    // 300 m de altura a 32,4 m de espacamento sao 10 passagens, mais as pontas.
    expect(cobertura.passagens.length).toBeGreaterThanOrEqual(9)
    expect(cobertura.passagens.length).toBeLessThanOrEqual(12)
  })

  it('as passagens ficam dentro do contorno quando nao ha margem', () => {
    const contorno = rectangulo(400, 300)
    const cobertura = gerarCobertura(contorno, opcoes())

    for (const ponto of pontosDaCobertura(cobertura)) {
      // Nenhum ponto pode estar mais longe do centro do que o canto do rectangulo.
      expect(distancia(CENTRO, ponto)).toBeLessThanOrEqual(Math.hypot(200, 150) + 1)
    }
  })

  it('a margem estende as passagens para fora do contorno', () => {
    const semMargem = gerarCobertura(rectangulo(400, 300), opcoes())
    const comMargem = gerarCobertura(rectangulo(400, 300), opcoes({ margem: 25 }))
    expect(comMargem.distancia).toBeGreaterThan(semMargem.distancia)
  })

  it('serpenteia: cada passagem comeca onde a anterior acabou', () => {
    /*
     * Voltar ao principio de cada passagem seria andar duas vezes o mesmo
     * caminho. O salto entre passagens tem de ser da ordem do espacamento, e
     * nao do comprimento delas.
     */
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes())
    for (let i = 1; i < cobertura.passagens.length; i++) {
      const fimAnterior = cobertura.passagens[i - 1]?.at(-1)
      const inicio = cobertura.passagens[i]?.[0]
      if (!fimAnterior || !inicio) throw new Error('passagem vazia')
      expect(distancia(fimAnterior, inicio)).toBeLessThan(cobertura.espacamento * 2)
    }
  })

  it('duas passagens vizinhas ficam a distancia do espacamento', () => {
    /*
     * Mede-se em travez, e nao em linha recta: como serpenteia, o inicio da
     * segunda passagem esta na ponta oposta da primeira, e a distancia directa
     * entre os dois pontos e quase o comprimento da passagem.
     */
    const rumoGraus = 0
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes({ rumoGraus }))
    const primeira = cobertura.passagens[0]?.[0]
    const segunda = cobertura.passagens[1]?.[0]
    if (!primeira || !segunda) throw new Error('passagens em falta')

    const desvio = deslocamentoLocal(primeira, segunda)
    // Direccao perpendicular as passagens, em componentes leste e norte.
    const perpendicular = ((rumoGraus + 90) * Math.PI) / 180
    const separacao = Math.abs(
      desvio.x * Math.sin(perpendicular) + desvio.y * Math.cos(perpendicular),
    )
    expect(separacao).toBeCloseTo(cobertura.espacamento, 0)
  })

  it('sem pontos por foto sao dois waypoints por passagem', () => {
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes())
    for (const passagem of cobertura.passagens) expect(passagem).toHaveLength(2)
  })

  it('com pontos por foto a passagem parte-se ao intervalo calculado', () => {
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes({ umPontoPorFoto: true }))
    const passagem = cobertura.passagens[0]
    if (!passagem) throw new Error('sem passagens')

    expect(passagem.length).toBeGreaterThan(2)
    for (let i = 1; i < passagem.length; i++) {
      const de = passagem[i - 1]
      const para = passagem[i]
      if (!de || !para) throw new Error('ponto em falta')
      expect(distancia(de, para)).toBeLessThanOrEqual(cobertura.intervaloEntreFotos + 1)
    }
  })

  it('mais sobreposicao lateral da mais passagens', () => {
    const pouca = gerarCobertura(rectangulo(400, 300), opcoes({ sobreposicaoLateral: 0.4 }))
    const muita = gerarCobertura(rectangulo(400, 300), opcoes({ sobreposicaoLateral: 0.8 }))
    expect(muita.passagens.length).toBeGreaterThan(pouca.passagens.length)
  })

  it('voar mais alto da menos passagens, porque cada foto cobre mais', () => {
    const baixo = gerarCobertura(rectangulo(400, 300), opcoes({ alturaAcimaDoSolo: 40 }))
    const alto = gerarCobertura(rectangulo(400, 300), opcoes({ alturaAcimaDoSolo: 100 }))
    expect(alto.passagens.length).toBeLessThan(baixo.passagens.length)
  })

  it('o rumo roda as passagens', () => {
    const aNorte = gerarCobertura(rectangulo(400, 300), opcoes({ rumoGraus: 0 }))
    const aLeste = gerarCobertura(rectangulo(400, 300), opcoes({ rumoGraus: 90 }))

    const rumoDe = (cobertura: typeof aNorte): number => {
      const passagem = cobertura.passagens[0]
      const de = passagem?.[0]
      const para = passagem?.at(-1)
      if (!de || !para) throw new Error('sem passagem')
      return ((rumo(de, para) % 180) + 180) % 180
    }
    expect(Math.abs(rumoDe(aNorte) - rumoDe(aLeste))).toBeGreaterThan(45)
  })

  it('ao comprido da passagens mais longas e menos inversoes', () => {
    // 400 m a leste por 300 a norte: voar a 90 graus e voar ao comprido.
    const aoComprido = gerarCobertura(rectangulo(400, 300), opcoes({ rumoGraus: 90 }))
    const aoTravez = gerarCobertura(rectangulo(400, 300), opcoes({ rumoGraus: 0 }))
    expect(aoComprido.passagens.length).toBeLessThan(aoTravez.passagens.length)
  })

  it('o rumo pedido e mesmo o rumo a que se voa', () => {
    /*
     * As passagens saem ao longo do eixo x do plano de trabalho, e esse aponta
     * a leste. Sem o desconto de noventa graus, pedir rumo zero - que e norte -
     * dava passagens a voar para leste.
     */
    for (const pedido of [0, 45, 90, 135]) {
      const cobertura = gerarCobertura(rectangulo(500, 500), opcoes({ rumoGraus: pedido }))
      const passagem = cobertura.passagens[0]
      const de = passagem?.[0]
      const para = passagem?.at(-1)
      if (!de || !para) throw new Error('sem passagem')

      const obtido = ((rumo(de, para) % 180) + 180) % 180
      expect(obtido).toBeCloseTo(((pedido % 180) + 180) % 180, 0)
    }
  })

  it('nao gera coordenadas invalidas', () => {
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes({ umPontoPorFoto: true }))
    for (const ponto of pontosDaCobertura(cobertura)) {
      expect(Number.isFinite(ponto.lat)).toBe(true)
      expect(Number.isFinite(ponto.lon)).toBe(true)
      expect(Math.abs(ponto.lat)).toBeLessThan(90)
    }
  })

  it('conta as fotos e o percurso', () => {
    const cobertura = gerarCobertura(rectangulo(400, 300), opcoes())
    expect(cobertura.numeroDeFotos).toBeGreaterThan(0)
    // O percurso tem de ser pelo menos a soma das passagens.
    expect(cobertura.distancia).toBeGreaterThan(400 * cobertura.passagens.length * 0.8)
  })
})

describe('contorno concavo', () => {
  /** Parcela em L: um quadrado a que se tirou o quadrante nordeste. */
  function emL(lado: number): LatLon[] {
    const sudoeste = deslocar(deslocar(CENTRO, 270, lado / 2), 180, lado / 2)
    const sudeste = deslocar(sudoeste, 90, lado)
    const meioLeste = deslocar(sudeste, 0, lado / 2)
    const meio = deslocar(meioLeste, 270, lado / 2)
    const meioNorte = deslocar(meio, 0, lado / 2)
    const noroeste = deslocar(sudoeste, 0, lado)
    return [sudoeste, sudeste, meioLeste, meio, meioNorte, noroeste]
  }

  it('a parcela em L e mesmo concava', () => {
    // Um L de 400 tem tres quartos da area do quadrado.
    expect(areaDoContorno(emL(400))).toBeGreaterThan(400 * 400 * 0.6)
    expect(areaDoContorno(emL(400))).toBeLessThan(400 * 400 * 0.9)
  })

  it('as passagens param no recorte em vez de o atravessar', () => {
    /*
     * Numa parcela em L, as passagens que apanham a falta tem de vir em dois
     * trocos. Tratar o corte como um so faria a aeronave atravessar o que nao e
     * para cobrir - e num sitio a serio isso pode ser a central do vizinho.
     */
    const cobertura = gerarCobertura(emL(400), opcoes({ rumoGraus: 90 }))
    const comprimentos = cobertura.passagens.map((p) => {
      const de = p[0]
      const para = p.at(-1)
      return de && para ? distancia(de, para) : 0
    })

    const maisLonga = Math.max(...comprimentos)
    const maisCurta = Math.min(...comprimentos)
    expect(maisCurta).toBeLessThan(maisLonga * 0.75)
  })
})

describe('rumo do lado mais longo', () => {
  it('num rectangulo, alinha com o lado comprido', () => {
    // Lado de 400 a leste: o rumo e 90 graus.
    expect(rumoDoLadoMaisLongo(rectangulo(400, 200))).toBeCloseTo(90, 0)
  })

  it('num rectangulo rodado, acompanha a rotacao', () => {
    expect(rumoDoLadoMaisLongo(rectangulo(400, 200, 30))).toBeCloseTo(120, 0)
  })

  it('o sentido nao conta: fica sempre entre zero e 180', () => {
    const r = rumoDoLadoMaisLongo(rectangulo(400, 200))
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(180)
  })

  it('um contorno vazio nao rebenta', () => {
    expect(rumoDoLadoMaisLongo([])).toBe(0)
  })
})

describe('acrescentar a cobertura a rota', () => {
  function rotaVaziaDeEnsaio(): Rota {
    return rotaVazia({
      nome: 'ensaio',
      projetoId: 'p',
      droneId: 'mini5pro',
      pontoDescolagem: { lat: CENTRO.lat, lon: CENTRO.lon, cotaTerreno: 356 },
    })
  }

  const cobertura = () => gerarCobertura(rectangulo(400, 300), opcoes())

  it('os waypoints ficam todos na rota, pela ordem de voo', () => {
    const c = cobertura()
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), c, {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    expect(rota.waypoints).toHaveLength(c.passagens.length * 2)
    expect(rota.waypoints.map((w) => w.index)).toEqual(rota.waypoints.map((_, i) => i))
  })

  it('nao mexe no que a rota ja tinha', () => {
    // Quem gera por cima de trabalho feito nao devia perde-lo por engano.
    let rota = rotaVaziaDeEnsaio()
    rota = acrescentarWaypoint(rota, waypointNovo({ ...CENTRO, altura: 40, index: 0 }))
    const antes = rota.waypoints[0]

    const depois = acrescentarCobertura(rota, cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    expect(depois.waypoints[0]).toEqual(antes)
  })

  it('a camara fica a prumo, que e como um levantamento se voa', () => {
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    for (const waypoint of rota.waypoints) expect(waypoint.gimbalPitch).toBe(-90)
  })

  it('o rumo fica fixo no sentido da passagem', () => {
    /*
     * Sem rumo fixo a aeronave rodava a cada ponto para seguir a linha, e as
     * fotos saiam com a orientacao a mudar de passagem para passagem.
     */
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    for (const waypoint of rota.waypoints) expect(waypoint.modoGuinada).toBe('fixed')

    const primeiro = rota.waypoints[0]
    const segundo = rota.waypoints[1]
    if (!primeiro || !segundo) throw new Error('waypoints em falta')
    expect(primeiro.guinada).toBeCloseTo(rumo(primeiro, segundo), 0)
  })

  it('passa suave: parar em cada ponto duplicaria o tempo', () => {
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    for (const waypoint of rota.waypoints) expect(waypoint.tipoCurva).toBe('passarSuave')
  })

  it('com foto, cada waypoint leva a sua accao', () => {
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: true,
    })
    for (const waypoint of rota.waypoints) expect(waypoint.acoes).toEqual([{ tipo: 'tirarFoto' }])
  })

  it('as accoes sao de cada waypoint, e nao o mesmo objecto', () => {
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: true,
    })
    expect(rota.waypoints[0]?.acoes[0]).not.toBe(rota.waypoints[1]?.acoes[0])
  })

  it('os identificadores sao todos diferentes', () => {
    const rota = acrescentarCobertura(rotaVaziaDeEnsaio(), cobertura(), {
      alturaAcimaDoSolo: 60,
      comFoto: false,
    })
    expect(new Set(rota.waypoints.map((w) => w.id)).size).toBe(rota.waypoints.length)
  })

  it('uma cobertura vazia deixa a rota como estava', () => {
    const rota = rotaVaziaDeEnsaio()
    const nada = gerarCobertura([], opcoes())
    expect(acrescentarCobertura(rota, nada, { alturaAcimaDoSolo: 60, comFoto: false })).toBe(rota)
  })
})

describe('grelha cruzada', () => {
  const contorno = rectangulo(400, 300)

  it('desligada, nao muda nada do que ja havia', () => {
    const so = gerarCobertura(contorno, opcoes({ rumoGraus: 0 }))
    const explicito = gerarCobertura(contorno, opcoes({ rumoGraus: 0, cruzada: false }))
    expect(explicito.passagens).toEqual(so.passagens)
  })

  it('a segunda grelha vai a noventa graus da primeira', () => {
    const simples = gerarCobertura(contorno, opcoes({ rumoGraus: 0 }))
    const cruzada = gerarCobertura(contorno, opcoes({ rumoGraus: 0, cruzada: true }))
    const aos90 = gerarCobertura(contorno, opcoes({ rumoGraus: 90 }))

    expect(cruzada.passagens).toHaveLength(simples.passagens.length + aos90.passagens.length)
    /* A primeira metade e a grelha simples, ponto por ponto. */
    expect(cruzada.passagens.slice(0, simples.passagens.length)).toEqual(simples.passagens)
    expect(cruzada.passagens.slice(simples.passagens.length)).toEqual(aos90.passagens)
  })

  it('o espacamento e o mesmo nas duas: sai da camara e da altura', () => {
    const simples = gerarCobertura(contorno, opcoes({ rumoGraus: 0 }))
    const cruzada = gerarCobertura(contorno, opcoes({ rumoGraus: 0, cruzada: true }))
    expect(cruzada.espacamento).toBeCloseTo(simples.espacamento, 9)
    expect(cruzada.intervaloEntreFotos).toBeCloseTo(simples.intervaloEntreFotos, 9)
  })

  /*
   * O que custa, dito por numeros: uma grelha cruzada e duas passagens pela
   * parcela. Num rectangulo as duas nao dao exactamente o mesmo - as passagens
   * ao travez sao mais curtas e ha mais delas - mas o percurso total e sempre
   * maior do que o de uma so, e e isso que quem decide precisa de saber.
   */
  it('custa mais percurso e mais fotos do que uma grelha so', () => {
    const simples = gerarCobertura(contorno, opcoes({ rumoGraus: 0, umPontoPorFoto: true }))
    const cruzada = gerarCobertura(
      contorno,
      opcoes({ rumoGraus: 0, umPontoPorFoto: true, cruzada: true }),
    )
    expect(cruzada.distancia).toBeGreaterThan(simples.distancia)
    expect(cruzada.numeroDeFotos).toBeGreaterThan(simples.numeroDeFotos)
  })

  it('num quadrado as duas grelhas tem o mesmo numero de passagens', () => {
    const quadrado = rectangulo(300, 300)
    const simples = gerarCobertura(quadrado, opcoes({ rumoGraus: 0 }))
    const cruzada = gerarCobertura(quadrado, opcoes({ rumoGraus: 0, cruzada: true }))
    expect(cruzada.passagens).toHaveLength(simples.passagens.length * 2)
  })

  it('as passagens cruzadas ficam mesmo perpendiculares as primeiras', () => {
    const cruzada = gerarCobertura(contorno, opcoes({ rumoGraus: 30, cruzada: true }))
    const simples = gerarCobertura(contorno, opcoes({ rumoGraus: 30 }))

    const rumoDa = (passagem: readonly LatLon[]): number => {
      const a = passagem[0]!
      const b = passagem.at(-1)!
      return rumo(a, b)
    }

    const primeira = rumoDa(cruzada.passagens[0]!)
    const segunda = rumoDa(cruzada.passagens[simples.passagens.length]!)
    /* Modulo 180, porque uma passagem serpenteada tanto vai como vem. */
    const diferenca = Math.abs(((primeira - segunda) % 180) + 180) % 180
    expect(Math.min(diferenca, 180 - diferenca)).toBeCloseTo(90, 0)
  })
})
