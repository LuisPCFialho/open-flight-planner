import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { acrescentarPOI, associarPOI, poiNovo } from '../nucleo/operacoes-poi.ts'
import { copiarRota, deFicheiro, paraFicheiro, FicheiroInvalido } from './projetos.ts'

function rotaDeTeste(projetoId = 'p1'): Rota {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId,
    droneId: 'mini5pro',
    pontoDescolagem: { lat: 40.746552, lon: -8.41061, cotaTerreno: 355.9 },
  })
  const poi = poiNovo({ nome: 'Poste', lat: 40.7495, lon: -8.4085, altura: 40 })
  rota = acrescentarPOI(rota, poi)

  for (let i = 0; i < 3; i++) {
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ lat: 40.75 + i * 0.001, lon: -8.41, altura: 60, index: i }),
    )
  }
  return associarPOI(rota, [rota.waypoints[1]?.id ?? ''], poi.id)
}

describe('copiarRota', () => {
  it('da identificadores novos a tudo', () => {
    const original = rotaDeTeste()
    const copia = copiarRota(original, 'p2')

    expect(copia.id).not.toBe(original.id)
    expect(copia.projetoId).toBe('p2')
    for (const [i, waypoint] of copia.waypoints.entries()) {
      expect(waypoint.id).not.toBe(original.waypoints[i]?.id)
    }
    expect(copia.pois[0]?.id).not.toBe(original.pois[0]?.id)
  })

  it('reaponta as referencias dos POI para a copia, nao para o original', () => {
    const original = rotaDeTeste()
    const copia = copiarRota(original, 'p2')

    const comPOI = copia.waypoints.find((w) => w.poiId)
    expect(comPOI).toBeDefined()
    expect(comPOI?.poiId).toBe(copia.pois[0]?.id)
    expect(comPOI?.poiId).not.toBe(original.pois[0]?.id)
  })

  it('larga referencias a POI que nao vieram na copia', () => {
    const original = rotaDeTeste()
    const orfa: Rota = {
      ...original,
      pois: [],
      waypoints: original.waypoints.map((w) => ({ ...w, poiId: 'desaparecido' })),
    }
    const copia = copiarRota(orfa, 'p2')
    expect(copia.waypoints.every((w) => w.poiId === undefined)).toBe(true)
  })

  it('preserva a geometria e as alturas', () => {
    const original = rotaDeTeste()
    const copia = copiarRota(original, 'p2')

    expect(copia.waypoints.map((w) => [w.lat, w.lon, w.altura])).toEqual(
      original.waypoints.map((w) => [w.lat, w.lon, w.altura]),
    )
    expect(copia.pontoDescolagem).toEqual(original.pontoDescolagem)
  })
})

describe('troca em JSON', () => {
  const conteudo = {
    projeto: {
      id: 'p1',
      nome: 'Central de Sever do Vouga',
      cliente: 'Simples Energia',
      local: 'Sever do Vouga',
      criadoEm: 1700000000000,
    },
    rotas: [rotaDeTeste()],
  }

  it('sobrevive a ida e volta', () => {
    const ficheiro = paraFicheiro(conteudo)
    const volta = deFicheiro(JSON.parse(JSON.stringify(ficheiro)))

    expect(volta.projeto.nome).toBe('Central de Sever do Vouga')
    expect(volta.projeto.cliente).toBe('Simples Energia')
    expect(volta.rotas).toHaveLength(1)
    expect(volta.rotas[0]?.waypoints).toHaveLength(3)
    expect(volta.rotas[0]?.waypoints[0]?.lat).toBeCloseTo(40.75, 9)
  })

  it('regera os identificadores, para importar duas vezes dar dois projetos', () => {
    const ficheiro = paraFicheiro(conteudo)
    const primeira = deFicheiro(JSON.parse(JSON.stringify(ficheiro)))
    const segunda = deFicheiro(JSON.parse(JSON.stringify(ficheiro)))

    expect(primeira.projeto.id).not.toBe(segunda.projeto.id)
    expect(primeira.projeto.id).not.toBe('p1')
    expect(primeira.rotas[0]?.projetoId).toBe(primeira.projeto.id)
  })

  it('recusa um ficheiro que nao e deste formato', () => {
    expect(() => deFicheiro({ formato: 'outra-coisa', versao: 1 })).toThrow(FicheiroInvalido)
    expect(() => deFicheiro(null)).toThrow(FicheiroInvalido)
    expect(() => deFicheiro('texto')).toThrow(FicheiroInvalido)
  })

  it('recusa uma versao mais recente do que sabe ler', () => {
    const futuro = { ...paraFicheiro(conteudo), versao: 99 }
    expect(() => deFicheiro(futuro)).toThrow(/versão 99/)
  })

  it('recusa waypoints sem coordenadas, dizendo qual', () => {
    const estragado = paraFicheiro(conteudo)
    const rota = estragado.rotas[0]
    if (!rota) throw new Error('rota em falta')
    const waypoints = [...rota.waypoints]
    const segundo = waypoints[1]
    if (!segundo) throw new Error('waypoint em falta')
    waypoints[1] = { ...segundo, lat: Number.NaN }

    const comErro = { ...estragado, rotas: [{ ...rota, waypoints }] }
    expect(() => deFicheiro(comErro)).toThrow(/waypoint 2 da rota "ensaio"/)
  })

  it('recusa um projeto sem nome', () => {
    const semNome = { ...paraFicheiro(conteudo), projeto: { ...conteudo.projeto, nome: '  ' } }
    expect(() => deFicheiro(semNome)).toThrow(/não tem nome/)
  })

  it('preenche os campos em falta com o que uma rota nova teria', () => {
    const ficheiro = paraFicheiro(conteudo)
    const rota = ficheiro.rotas[0]
    if (!rota) throw new Error('rota em falta')

    const antigo = { ...rota } as Record<string, unknown>
    delete antigo['alturaMinimaAcimaDoSolo']
    delete antigo['ondulacaoGeoide']
    delete antigo['alturaRTH']

    const volta = deFicheiro({ ...ficheiro, rotas: [antigo] })
    expect(volta.rotas[0]?.alturaMinimaAcimaDoSolo).toBe(30)
    expect(volta.rotas[0]?.ondulacaoGeoide).toBe(55.6)
    expect(volta.rotas[0]?.alturaRTH).toBe(100)
  })
})

describe('o vento de um ficheiro', () => {
  /*
   * Um ficheiro vem de fora - de outro posto, de outra versao, ou de alguem que
   * o abriu num editor. O vento e o unico campo opcional da rota que entra
   * directamente em aritmetica, e aritmetica com um numero que nao e numero ja
   * custou caro a este projecto.
   */
  function comVento(vento: unknown) {
    const base = paraFicheiro({
      projeto: { id: 'p', nome: 'obra', cliente: '', local: '', criadoEm: 1 },
      rotas: [
        {
          ...rotaVazia({
            nome: 'r',
            projetoId: 'p',
            droneId: 'mini5pro',
            pontoDescolagem: { lat: 40, lon: -8, cotaTerreno: 100 },
          }),
        },
      ],
    })
    const bruto = JSON.parse(JSON.stringify(base)) as { rotas: Record<string, unknown>[] }
    bruto.rotas[0]!.vento = vento
    return deFicheiro(bruto).rotas[0]!.vento
  }

  it('deixa passar um vento bem formado', () => {
    expect(comVento({ velocidade: 6.5, rumo: 210 })).toEqual({ velocidade: 6.5, rumo: 210 })
  })

  it('normaliza o rumo para a volta completa', () => {
    expect(comVento({ velocidade: 3, rumo: 400 })?.rumo).toBe(40)
    expect(comVento({ velocidade: 3, rumo: -90 })?.rumo).toBe(270)
  })

  it('vento que nao se percebe e vento que nao ha', () => {
    expect(comVento({ velocidade: 'muito', rumo: 0 })).toBeUndefined()
    expect(comVento({ velocidade: 5 })).toBeUndefined()
    expect(comVento({ velocidade: -4, rumo: 0 })).toBeUndefined()
    expect(comVento({ velocidade: Infinity, rumo: 0 })).toBeUndefined()
    expect(comVento('norte')).toBeUndefined()
    expect(comVento(null)).toBeUndefined()
  })

  it('uma rota sem vento continua sem vento', () => {
    expect(comVento(undefined)).toBeUndefined()
  })
})
