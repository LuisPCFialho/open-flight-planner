import { describe, it, expect } from 'vitest'
import type { Drone, LatLon, Rota } from './tipos.ts'
import { droneComId } from '../drones.ts'
import { deslocar, amostrarPercurso } from './geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from './operacoes-rota.ts'
import { acrescentarAccao } from './operacoes-accoes.ts'
import { validarRota, temErros, PASSO_COLISAO, type ContextoValidacao } from './validacoes.ts'

const chave = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
const DESCOLAGEM = { lat: 40.7, lon: -8.4, cotaTerreno: 200 }

/** Rota em linha recta, com o terreno dado por uma funcao da distancia percorrida. */
function cenario(opcoes: {
  numeroWaypoints: number
  troco: number
  altura: number
  modo?: Rota['modoAltitude']
  terreno: (distanciaPercorrida: number) => number
  velocidade?: number
}) {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: DESCOLAGEM,
  })
  rota = {
    ...rota,
    modoAltitude: opcoes.modo ?? 'ALT',
    velocidadeGlobal: opcoes.velocidade ?? 5,
  }

  let ponto: LatLon = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < opcoes.numeroWaypoints; i++) {
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura: opcoes.altura, index: i }))
    ponto = deslocar(ponto, 90, opcoes.troco)
  }

  const cotas = new Map<string, number>()
  for (const [i, w] of rota.waypoints.entries()) cotas.set(chave(w), opcoes.terreno(i * opcoes.troco))

  // Perfil amostrado pela mesma funcao que o grafico usa.
  const pontos = amostrarPercurso(rota.waypoints, PASSO_COLISAO)
  const perfil = {
    pontos,
    cotas: pontos.map((_, i) => opcoes.terreno(i * PASSO_COLISAO)),
  }

  const contexto: ContextoValidacao = { cotas, chave, perfil }
  return { rota, contexto }
}

function comId(validacoes: ReturnType<typeof validarRota>, id: string) {
  return validacoes.find((v) => v.id === id)
}

describe('altura acima do solo', () => {
  it('nao se queixa de uma rota folgada', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 5,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'agl-baixo')).toBeUndefined()
    expect(comId(validacoes, 'agl-alto')).toBeUndefined()
  })

  it('bloqueia waypoints a menos de 30 m do solo', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 20,
      terreno: () => 200,
    })
    const problema = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'agl-baixo')

    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([0, 1, 2, 3])
    expect(problema?.detalhe).toContain('20 m')
  })

  it('respeita o minimo proprio da rota, para a inspeccao de paineis poder voar baixo', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 25,
      terreno: () => 200,
    })

    // Com o valor de partida de 30 m, uma rota de inspeccao a 25 m nao exportava.
    expect(comId(validarRota(rota, droneComId('mini5pro'), contexto), 'agl-baixo')?.severidade).toBe(
      'erro',
    )

    const paraInspeccao = { ...rota, alturaMinimaAcimaDoSolo: 20 }
    const validacoes = validarRota(paraInspeccao, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'agl-baixo')).toBeUndefined()
    expect(comId(validacoes, 'colisao-troco')).toBeUndefined()
  })

  it('o maximo de 120 m nao se mexe, porque e regulamentar', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 2,
      troco: 100,
      altura: 150,
      terreno: () => 200,
    })
    const comMinimoBaixo = { ...rota, alturaMinimaAcimaDoSolo: 5 }
    expect(
      comId(validarRota(comMinimoBaixo, droneComId('mini5pro'), contexto), 'agl-alto')?.severidade,
    ).toBe('erro')
  })

  it('bloqueia waypoints acima de 120 m do solo', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 100,
      altura: 150,
      terreno: () => 200,
    })
    const problema = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'agl-alto')

    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([0, 1, 2])
  })

  /**
   * O caso que motivou a ferramenta: altura constante relativa a descolagem sobre
   * terreno com mais de 100 m de desnivel. O ficheiro parece bom e e invoavel.
   */
  it('bloqueia uma rota de altura constante sobre terreno com 137 m de desnivel', () => {
    const relevo = [-105, -40, 0, 20, 32]
    const { rota, contexto } = cenario({
      numeroWaypoints: 5,
      troco: 200,
      altura: 130,
      modo: 'ALT',
      terreno: (d) => 200 + (relevo[Math.min(relevo.length - 1, Math.round(d / 200))] ?? 0),
    })

    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(temErros(validacoes)).toBe(true)

    const alto = comId(validacoes, 'agl-alto')
    expect(alto?.severidade).toBe('erro')
    // Onde o terreno desce 105 m, a rota fica a 235 m do solo.
    expect(alto?.detalhe).toContain('235 m')
  })
})

describe('colisao entre waypoints', () => {
  it('apanha um cabeco entre dois waypoints que estao ambos folgados', () => {
    // Terreno plano nos extremos e com um cabeco de 80 m a meio.
    const { rota, contexto } = cenario({
      numeroWaypoints: 2,
      troco: 400,
      altura: 60,
      terreno: (d) => 200 + (d > 150 && d < 250 ? 80 : 0),
    })

    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    // Os dois waypoints estao a 60 m do solo, portanto folgados.
    expect(comId(validacoes, 'agl-baixo')).toBeUndefined()

    const colisao = comId(validacoes, 'colisao-troco')
    expect(colisao?.severidade).toBe('erro')
    expect(colisao?.detalhe).toContain('Folga mínima')
  })

  it('distingue passar rente de passar por baixo do terreno', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 2,
      troco: 400,
      altura: 60,
      terreno: (d) => 200 + (d > 150 && d < 250 ? 120 : 0),
    })
    const colisao = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'colisao-troco')
    expect(colisao?.titulo).toContain('por baixo do terreno')
  })

  it('cala-se quando o troco vai folgado de ponta a ponta', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 2,
      troco: 400,
      altura: 60,
      terreno: () => 200,
    })
    expect(comId(validarRota(rota, droneComId('mini5pro'), contexto), 'colisao-troco')).toBeUndefined()
  })

  it('nao verifica a colisao sem perfil, em vez de dar a rota por boa', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 2,
      troco: 400,
      altura: 60,
      terreno: (d) => 200 + (d > 150 && d < 250 ? 120 : 0),
    })
    const semPerfil = { cotas: contexto.cotas, chave: contexto.chave }
    expect(comId(validarRota(rota, droneComId('mini5pro'), semPerfil), 'colisao-troco')).toBeUndefined()
  })
})

describe('afastamento e autonomia', () => {
  it('avisa, sem bloquear, quando a rota se afasta mais de 500 m', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 10,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    const aviso = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'afastamento')

    expect(aviso?.severidade).toBe('aviso')
    expect(aviso?.waypoints).toEqual([9])
  })

  it('bloqueia quando a rota nao cabe em 70% da autonomia', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 60,
      troco: 200,
      altura: 60,
      velocidade: 5,
      terreno: () => 200,
    })
    const drone: Drone = { ...droneComId('mini5pro'), autonomiaMinutos: 20 }

    const problema = comId(validarRota(rota, drone, contexto), 'autonomia')
    expect(problema?.severidade).toBe('erro')
    expect(problema?.detalhe).toContain('20 minutos')
  })

  it('avisa quando a autonomia do drone ainda nao foi preenchida', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    /*
     * O drone e construido aqui e nao tirado do catalogo.
     *
     * Este teste usava o Mini 5 Pro, que na altura ainda nao tinha autonomia
     * preenchida. Assim que o operador a confirmou, o teste passou a falhar sem
     * que nada do comportamento tivesse mudado: o que se quer verificar e o que
     * acontece sem autonomia, nao o estado do catalogo.
     */
    const semAutonomia: Drone = { ...droneComId('mini5pro'), porConfirmar: ['autonomiaMinutos'] }
    delete semAutonomia.autonomiaMinutos

    const aviso = comId(validarRota(rota, semAutonomia, contexto), 'autonomia-desconhecida')
    expect(aviso?.severidade).toBe('aviso')
  })
})

describe('accoes e POI', () => {
  it('bloqueia accoes que o drone escolhido nao sabe executar', () => {
    let { rota } = cenario({ numeroWaypoints: 2, troco: 100, altura: 60, terreno: () => 200 })
    const { contexto } = cenario({ numeroWaypoints: 2, troco: 100, altura: 60, terreno: () => 200 })
    const waypoint = rota.waypoints[1]
    if (!waypoint) throw new Error('waypoint em falta')
    rota = acrescentarAccao(rota, waypoint.id, { tipo: 'zoom', fator: 4 })

    const problema = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'accoes-nao-suportadas')
    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([1])

    // O mesmo ficheiro para o Mavic 3T nao tem problema nenhum de accoes.
    expect(
      comId(validarRota(rota, droneComId('mavic3t'), contexto), 'accoes-nao-suportadas'),
    ).toBeUndefined()
  })

  it('bloqueia waypoints a apontar a um POI que ja nao existe', () => {
    const { rota, contexto } = cenario({ numeroWaypoints: 2, troco: 100, altura: 60, terreno: () => 200 })
    const orfa = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) =>
        i === 1 ? { ...w, modoGuinada: 'towardPOI' as const, poiId: 'desaparecido' } : w,
      ),
    }

    const problema = comId(validarRota(orfa, droneComId('mini5pro'), contexto), 'poi-perdido')
    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([1])
  })
})

describe('registo fotografico', () => {
  it('avisa dos waypoints sem foto, mas so quando a rota e de registo', () => {
    const { rota, contexto } = cenario({ numeroWaypoints: 3, troco: 100, altura: 60, terreno: () => 200 })

    expect(comId(validarRota(rota, droneComId('mini5pro'), contexto), 'sem-foto')).toBeUndefined()

    const aviso = comId(
      validarRota(rota, droneComId('mini5pro'), { ...contexto, registoFotografico: true }),
      'sem-foto',
    )
    expect(aviso?.severidade).toBe('aviso')
    expect(aviso?.waypoints).toEqual([0, 1, 2])
  })
})

describe('cotas em falta', () => {
  it('bloqueia enquanto faltarem cotas, em vez de dar a rota por boa', () => {
    const { rota } = cenario({ numeroWaypoints: 3, troco: 100, altura: 60, terreno: () => 200 })
    const problema = comId(
      validarRota(rota, droneComId('mini5pro'), { cotas: new Map(), chave }),
      'cotas-em-falta',
    )

    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([0, 1, 2])
  })
})

describe('temErros', () => {
  it('distingue o que bloqueia do que so avisa', () => {
    expect(temErros([{ id: 'a', severidade: 'aviso', titulo: 't', detalhe: 'd' }])).toBe(false)
    expect(temErros([{ id: 'b', severidade: 'erro', titulo: 't', detalhe: 'd' }])).toBe(true)
    expect(temErros([])).toBe(false)
  })
})

describe('velocidades impossiveis', () => {
  it('trata a velocidade global nula como erro, pelo nome', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    const validacoes = validarRota(
      { ...rota, velocidadeGlobal: 0 },
      droneComId('mini5pro'),
      contexto,
    )

    const problema = comId(validacoes, 'velocidade-global-invalida')
    expect(problema?.severidade).toBe('erro')
    // O que o utilizador via antes era a exportacao a falhar com uma mensagem
    // sobre XML invalido, sem relacao nenhuma com a causa.
    expect(temErros(validacoes)).toBe(true)
  })

  it('aponta os waypoints com velocidade propria nao voavel', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    const comParados = {
      ...rota,
      waypoints: rota.waypoints.map((w, i) => (i === 2 ? { ...w, velocidade: 0 } : w)),
    }

    const problema = comId(
      validarRota(comParados, droneComId('mini5pro'), contexto),
      'velocidade-waypoint-invalida',
    )
    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toEqual([2])
  })

  it('deixa passar uma rota com velocidade normal', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 60,
      terreno: () => 200,
      velocidade: 6,
    })
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'velocidade-global-invalida')).toBeUndefined()
    expect(comId(validacoes, 'velocidade-waypoint-invalida')).toBeUndefined()
  })
})

describe('colisao entre waypoints por verificar', () => {
  it('avisa quando falta o perfil, em vez de dar a rota por boa em silencio', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    const semPerfil: ContextoValidacao = { cotas: contexto.cotas, chave: contexto.chave }

    const aviso = comId(validarRota(rota, droneComId('mini5pro'), semPerfil), 'colisao-por-verificar')
    expect(aviso?.severidade).toBe('aviso')
    // Aviso e nao erro: o perfil chega assim que o motor de terreno responde.
    expect(temErros(validarRota(rota, droneComId('mini5pro'), semPerfil))).toBe(false)
  })

  it('cala-se assim que o perfil existe', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 100,
      altura: 60,
      terreno: () => 200,
    })
    expect(
      comId(validarRota(rota, droneComId('mini5pro'), contexto), 'colisao-por-verificar'),
    ).toBeUndefined()
  })
})

describe('autonomia', () => {
  /** O Mini 5 Pro nao tem autonomia preenchida; aqui inventa-se uma para ensaiar. */
  const comAutonomia = (minutos: number): Drone => ({
    ...droneComId('mini5pro'),
    autonomiaMinutos: minutos,
  })

  it('conta o regresso a casa, e nao so o percurso entre waypoints', () => {
    // Quatro waypoints de 1000 m para leste a 10 m/s: 3000 m de percurso e mais
    // 3000 m de regresso desde o ultimo ponto ate a descolagem.
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 1000,
      altura: 60,
      terreno: () => 200,
      velocidade: 10,
    })

    // 10 minutos de autonomia dao 420 s de margem prudente. So o percurso sao
    // cerca de 327 s, que cabem; com o regresso passam de 600 s, que nao cabem.
    const problema = comId(validarRota(rota, comAutonomia(10), contexto), 'autonomia')
    expect(problema?.severidade).toBe('erro')
    expect(problema?.detalhe).toContain('regresso')
  })

  it('nao se queixa quando a rota cabe com folga', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 100,
      altura: 60,
      terreno: () => 200,
      velocidade: 10,
    })
    expect(comId(validarRota(rota, comAutonomia(30), contexto), 'autonomia')).toBeUndefined()
  })
})

describe('tecto do aparelho', () => {
  /** Drone igual ao do catalogo, mas com o tecto que o teste quiser. */
  function comTecto(alturaMaxima: number | undefined): Drone {
    const base = droneComId('mini5pro')
    if (alturaMaxima === undefined) {
      const { alturaMaxima: _fora, ...resto } = base
      return resto
    }
    return { ...base, alturaMaxima }
  }

  it('uma rota normal nao se queixa: o tecto nunca aperta numa central', () => {
    // Terreno a 400 m e voo a 60 do solo: 460 m, muito abaixo dos 4500.
    const { rota, contexto } = cenario({
      numeroWaypoints: 4,
      troco: 120,
      altura: 60,
      terreno: () => 400,
    })
    expect(comId(validarRota(rota, comTecto(4500), contexto), 'acima-do-tecto')).toBeUndefined()
  })

  it('apanha o engano de um digito na altura', () => {
    /*
     * E para isto que serve: 4600 em vez de 460 e um dedo a mais no teclado, e
     * de outra forma so se descobria com o aparelho a recusar voar.
     */
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 120,
      altura: 4600,
      modo: 'ASL',
      terreno: () => 400,
    })
    const problema = comId(validarRota(rota, comTecto(4500), contexto), 'acima-do-tecto')
    expect(problema?.severidade).toBe('erro')
    expect(problema?.waypoints).toHaveLength(3)
  })

  it('diz qual e o ponto mais alto e a que cota vai', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 120,
      altura: 5000,
      modo: 'ASL',
      terreno: () => 400,
    })
    expect(comId(validarRota(rota, comTecto(4500), contexto), 'acima-do-tecto')?.detalhe).toMatch(
      /5000 m acima do nível do mar/,
    )
  })

  it('um aparelho sem tecto declarado nao gera queixa nenhuma', () => {
    const { rota, contexto } = cenario({
      numeroWaypoints: 3,
      troco: 120,
      altura: 9000,
      modo: 'ASL',
      terreno: () => 400,
    })
    expect(comId(validarRota(rota, comTecto(undefined), contexto), 'acima-do-tecto')).toBeUndefined()
  })
})

describe('o vento', () => {
  /*
   * Os waypoints de `cenario` vao todos para leste. Um vento de leste e de
   * frente em toda a rota; um de norte e todo de travessia. E o par de casos que
   * separa as duas coisas que o vento pode fazer: atrasar, e arrastar.
   */
  function rotaAoVento(vento: Rota['vento'], velocidade = 5) {
    const { rota, contexto } = cenario({
      numeroWaypoints: 5,
      troco: 100,
      altura: 60,
      terreno: () => 200,
      velocidade,
    })
    return { rota: { ...rota, vento }, contexto }
  }

  it('sem vento apontado nao diz nada', () => {
    const { rota, contexto } = rotaAoVento(undefined)
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'vento-lento')).toBeUndefined()
    expect(comId(validacoes, 'vento-deriva')).toBeUndefined()
  })

  /*
   * O ponto de todo o modulo do vento: enquanto houver folga no ar, uma missao
   * de waypoints e voada a velocidade que se pediu e o vento nao tira nada.
   */
  it('com folga no ar nao se queixa, por mais vento que haja', () => {
    const { rota, contexto } = rotaAoVento({ velocidade: 9, rumo: 90 }, 5)
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'vento-lento')).toBeUndefined()
    expect(comId(validacoes, 'vento-deriva')).toBeUndefined()
  })

  it('sem folga avisa, e diz o que a aeronave consegue mesmo fazer', () => {
    /* Mini 5 Pro: 15 m/s em missao. 12 de frente deixam 3 no solo. */
    const { rota, contexto } = rotaAoVento({ velocidade: 12, rumo: 90 }, 5)
    const aviso = comId(validarRota(rota, droneComId('mini5pro'), contexto), 'vento-lento')

    expect(aviso?.severidade).toBe('aviso')
    expect(aviso?.detalhe).toContain('3.0 m/s em vez de 5.0')
    expect(aviso?.waypoints).toHaveLength(4)
  })

  /*
   * A travessia maior do que a velocidade no ar nao e um troco lento: e um rumo
   * que a aeronave nao segura. Vai a deriva, e por isso bloqueia.
   */
  it('travessia maior do que a aeronave faz no ar bloqueia a exportacao', () => {
    const { rota, contexto } = rotaAoVento({ velocidade: 18, rumo: 0 }, 5)
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    const erro = comId(validacoes, 'vento-deriva')

    expect(erro?.severidade).toBe('erro')
    expect(erro?.detalhe).toContain('não é para voar')
    expect(temErros(validacoes)).toBe(true)
  })

  it('o vento pela cauda nunca se queixa', () => {
    const { rota, contexto } = rotaAoVento({ velocidade: 12, rumo: 270 }, 5)
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'vento-lento')).toBeUndefined()
    expect(comId(validacoes, 'vento-deriva')).toBeUndefined()
  })

  /*
   * Sem a velocidade maxima em missao no catalogo nao ha nada com que comparar o
   * vento. Dizer isso e melhor do que calar - quem planeia fica a saber que o
   * numero que escreveu nao esta a ser usado para nada.
   */
  it('sem velocidade maxima no catalogo, avisa que nao ha com que comparar', () => {
    const { rota, contexto } = rotaAoVento({ velocidade: 12, rumo: 90 }, 5)
    /*
      * Tirado e nao posto a `undefined`: com `exactOptionalPropertyTypes` um
      * campo opcional ou esta ou nao esta, e e assim que um aparelho do
      * catalogo sem velocidade medida se apresenta.
      */
    const { velocidadeMaxWaypoint: _semUso, ...semMaximo } = droneComId('mini5pro')

    const validacoes = validarRota(rota, semMaximo, contexto)
    const aviso = comId(validacoes, 'vento-sem-maximo')

    expect(aviso?.severidade).toBe('aviso')
    expect(aviso?.detalhe).toContain('12 m/s de E')
    expect(comId(validacoes, 'vento-lento')).toBeUndefined()
  })

  it('vento parado e o mesmo que vento nenhum', () => {
    const { rota, contexto } = rotaAoVento({ velocidade: 0, rumo: 90 }, 5)
    const validacoes = validarRota(rota, droneComId('mini5pro'), contexto)
    expect(comId(validacoes, 'vento-lento')).toBeUndefined()
    expect(comId(validacoes, 'vento-sem-maximo')).toBeUndefined()
  })
})
