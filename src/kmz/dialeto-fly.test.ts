import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { droneComId } from '../drones.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { acrescentarPOI, associarPOI } from '../nucleo/operacoes-poi.ts'
import { acrescentarAccao } from '../nucleo/operacoes-accoes.ts'
import { gerarFly, accoesPorConfirmar, NS_FLY } from './dialeto-fly.ts'
import { importarKMZ } from './importar.ts'
import { compararXML, etiquetasUsadas, lerXML } from './parse-xml.ts'

/**
 * Conformidade contra ficheiros reais.
 *
 * A referencia principal e `fly-1.0.2-obra-sever-*`, o KMZ da obra de Sever do
 * Vouga extraido de um DJI RC 2 com Mini 5 Pro: 64 waypoints, 50 fotos, um
 * arranque e uma paragem de video, com curvas de passagem e waypoints a apontar
 * a POI. E o ficheiro binario tal como saiu do aparelho.
 *
 * O primeiro ficheiro de referencia, `fly-1.0.2-template.kml` e
 * `fly-1.0.2-waylines.wpml`, foi transcrito a mao e tem os numeros normalizados:
 * escreve `50` onde o aparelho escreve `50.0`. Serve para a estrutura, nao para
 * a formatacao.
 */

const OBRA_TEMPLATE = 'docs/esquemas/fly-1.0.2-obra-sever-template.kml'
const OBRA_WAYLINES = 'docs/esquemas/fly-1.0.2-obra-sever-waylines.wpml'
const TRANSCRITO_TEMPLATE = 'docs/esquemas/fly-1.0.2-template.kml'
const TRANSCRITO_WAYLINES = 'docs/esquemas/fly-1.0.2-waylines.wpml'
const ETIQUETAS = 'docs/esquemas/fly-1.0.2-etiquetas.txt'

const INSTANTE_OBRA = 1789484942905

function descrever(divergencias: ReturnType<typeof compararXML>): string {
  return divergencias
    .slice(0, 8)
    .map((d) => `${d.caminho}: ${d.razao} (esperado "${d.esperado ?? '--'}", obtido "${d.obtido ?? '--'}")`)
    .join('\n')
}

/** Le o KMZ da obra e volta a gera-lo a partir da rota lida. */
function idaEVolta() {
  const template = readFileSync(OBRA_TEMPLATE, 'utf8')
  const waylines = readFileSync(OBRA_WAYLINES, 'utf8')
  const importada = importarKMZ({ template, waylines }, { projetoId: 'p', nome: 'OBRA_SEVER_v4' })

  const gerado = gerarFly(importada.rota, droneComId('mini5pro'), {
    createTime: INSTANTE_OBRA,
    updateTime: INSTANTE_OBRA,
  })
  return { original: { template, waylines }, importada, gerado }
}

describe('conformidade com o KMZ da obra de Sever do Vouga', () => {
  it('le a rota inteira sem um unico aviso', () => {
    const { importada } = idaEVolta()

    expect(importada.dialeto).toBe('fly')
    expect(importada.avisos).toEqual([])
    expect(importada.rota.waypoints).toHaveLength(64)
    expect(importada.rota.waypoints.reduce((t, w) => t + w.acoes.length, 0)).toBe(116)
    expect(importada.rota.velocidadeGlobal).toBe(8)
    expect(importada.rota.modoAltitude).toBe('ALT')
  })

  it('reconstroi os dois ficheiros byte a byte', () => {
    const { original, importada } = idaEVolta()
    // Sem instantes injectados: a importacao preserva os do proprio ficheiro.
    const gerado = gerarFly(importada.rota, droneComId('mini5pro'))

    expect(gerado.template).toBe(original.template)
    expect(gerado.waylines).toBe(original.waylines)
  })

  it('reconstroi o template.kml sem uma etiqueta fora do sitio', () => {
    const { original, gerado } = idaEVolta()
    const divergencias = compararXML(lerXML(original.template), lerXML(gerado.template))
    expect(divergencias, descrever(divergencias)).toEqual([])
  })

  it('reconstroi o waylines.wpml sem uma etiqueta fora do sitio', () => {
    const { original, gerado } = idaEVolta()
    const divergencias = compararXML(lerXML(original.waylines), lerXML(gerado.waylines))
    expect(divergencias, descrever(divergencias)).toEqual([])
  })

  it('le as accoes de video e escreve-as com os parametros certos', () => {
    const { importada, gerado } = idaEVolta()

    const tipos = importada.rota.waypoints.flatMap((w) => w.acoes.map((a) => a.tipo))
    expect(tipos.filter((t) => t === 'iniciarGravacao')).toHaveLength(1)
    expect(tipos.filter((t) => t === 'pararGravacao')).toHaveLength(1)
    expect(tipos.filter((t) => t === 'tirarFoto')).toHaveLength(50)

    // A gravacao nao leva `useGlobalPayloadLensIndex`; a foto leva.
    const bloco = gerado.waylines.slice(gerado.waylines.indexOf('startRecord'))
    const parametros = bloco.slice(0, bloco.indexOf('</wpml:actionActuatorFuncParam>'))
    expect(parametros).toContain('payloadPositionIndex')
    expect(parametros).not.toContain('useGlobalPayloadLensIndex')
  })

  it('numera os grupos e as accoes de forma continua ao longo da rota', () => {
    const { gerado } = idaEVolta()
    const grupos = [...gerado.waylines.matchAll(/<wpml:actionGroupId>(\d+)</g)].map((m) =>
      Number(m[1]),
    )
    const accoes = [...gerado.waylines.matchAll(/<wpml:actionId>(\d+)</g)].map((m) => Number(m[1]))

    expect(grupos).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
    expect(accoes).toEqual(Array.from({ length: 116 }, (_, i) => i + 1))
  })

  it('preserva a distancia de amortecimento dos waypoints de passagem', () => {
    const { importada } = idaEVolta()
    const passagem = importada.rota.waypoints.filter((w) => w.tipoCurva === 'passarSuave')

    expect(passagem).toHaveLength(12)
    expect(passagem.every((w) => w.distanciaAmortecimento === 12)).toBe(true)
    expect(
      importada.rota.waypoints
        .filter((w) => w.tipoCurva === 'pararNoPonto')
        .every((w) => w.distanciaAmortecimento === 0),
    ).toBe(true)
  })

  it('escreve os numeros como o aparelho os escreve', () => {
    const { gerado } = idaEVolta()

    // Velocidades, alturas e inclinacoes levam sempre uma casa decimal.
    expect(gerado.waylines).toContain('<wpml:waypointSpeed>8.0</wpml:waypointSpeed>')
    expect(gerado.waylines).toContain('<wpml:executeHeight>60.8</wpml:executeHeight>')
    expect(gerado.waylines).toContain('<wpml:gimbalPitchRotateAngle>-20.0</wpml:gimbalPitchRotateAngle>')
    // Angulos de guinada e contadores saem inteiros.
    expect(gerado.waylines).toContain('<wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>')
    // Coordenadas com quinze algarismos significativos.
    expect(gerado.waylines).toContain('-8.41066700000000,40.7465720000000')
  })

  it('le os POI repetidos como um so por sitio', () => {
    const { importada } = idaEVolta()
    const comPOI = importada.rota.waypoints.filter((w) => w.modoGuinada === 'towardPOI')

    expect(comPOI).toHaveLength(50)
    expect(importada.rota.pois.length).toBeGreaterThan(0)
    expect(importada.rota.pois.length).toBeLessThanOrEqual(50)
    expect(comPOI.every((w) => w.poiId !== undefined)).toBe(true)
  })
})

describe('estrutura, contra o ficheiro transcrito no briefing', () => {
  /** Reconstroi a rota que deu origem ao ficheiro transcrito. */
  function rotaTranscrita(): Rota {
    let rota = rotaVazia({
      nome: 'referencia',
      projetoId: 'p1',
      droneId: 'mini5pro',
      pontoDescolagem: { lat: 38.6583110005792, lon: -8.18305089949604, cotaTerreno: 236 },
    })
    rota = {
      ...rota,
      modoAltitude: 'ALT',
      velocidadeGlobal: 2.5,
      modoDescolagem: 'descolagemSegura',
      criadaEm: 1789471987504,
      alteradaEm: 1789471987504,
    }

    const poi = { id: 'poi', nome: 'POI', lat: 38.658586, lon: -8.183793, altura: 50 }
    rota = acrescentarPOI(rota, poi)
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ lat: 38.6583110005792, lon: -8.18305089949604, altura: 50, index: 0 }),
    )

    const waypoint = rota.waypoints[0]
    if (!waypoint) throw new Error('waypoint em falta')
    rota = associarPOI(rota, [waypoint.id], poi.id)
    rota = acrescentarAccao(rota, waypoint.id, { tipo: 'tirarFoto' })
    return acrescentarAccao(rota, waypoint.id, { tipo: 'rodarGimbal', pitch: -30, yaw: 0 })
  }

  it('o template.kml bate etiqueta a etiqueta', () => {
    const gerado = gerarFly(rotaTranscrita(), droneComId('mini5pro'), {
      createTime: 1789471987504,
      updateTime: 1789471987504,
    })
    const divergencias = compararXML(
      lerXML(readFileSync(TRANSCRITO_TEMPLATE, 'utf8')),
      lerXML(gerado.template),
    )
    expect(divergencias, descrever(divergencias)).toEqual([])
  })

  it('o waylines.wpml tem as mesmas etiquetas, pela mesma ordem', () => {
    const gerado = gerarFly(rotaTranscrita(), droneComId('mini5pro'))
    const nomes = (fonte: string): string[] => {
      const lista: string[] = []
      const percorrer = (elemento: ReturnType<typeof lerXML>): void => {
        lista.push(elemento.nome)
        for (const filho of elemento.filhos) percorrer(filho)
      }
      percorrer(lerXML(fonte))
      return lista
    }

    // A formatacao dos numeros difere: o ficheiro foi transcrito a mao e escreve
    // `50` onde o aparelho escreve `50.0`. A estrutura tem de ser identica.
    expect(nomes(gerado.waylines)).toEqual(nomes(readFileSync(TRANSCRITO_WAYLINES, 'utf8')))
  })
})

describe('lista fechada de etiquetas', () => {
  it('nao emite nenhuma etiqueta fora das observadas nos ficheiros reais', () => {
    const permitidas = new Set(
      readFileSync(ETIQUETAS, 'utf8')
        .split(/\n\s*\n/)[1]
        ?.split(/\s+/)
        .filter(Boolean)
        .map((nome) => `wpml:${nome}`) ?? [],
    )
    for (const kml of ['kml', 'Document', 'Folder', 'Placemark', 'Point', 'coordinates']) {
      permitidas.add(kml)
    }

    const { gerado } = idaEVolta()
    const usadas = new Set([
      ...etiquetasUsadas(lerXML(gerado.template)),
      ...etiquetasUsadas(lerXML(gerado.waylines)),
    ])

    const aMais = [...usadas].filter((nome) => !permitidas.has(nome))
    expect(aMais, `etiquetas fora da lista fechada: ${aMais.join(', ')}`).toEqual([])
  })

  it('a rota da obra so usa accoes ja confirmadas em ficheiro real', () => {
    expect(accoesPorConfirmar(idaEVolta().importada.rota)).toEqual([])
  })

  it('assinala as accoes cujo nome de funcao ainda nao foi confirmado', () => {
    const { importada } = idaEVolta()
    const waypoint = importada.rota.waypoints[0]
    if (!waypoint) throw new Error('waypoint em falta')

    const comPairar = acrescentarAccao(importada.rota, waypoint.id, { tipo: 'pairar', segundos: 4 })
    expect(accoesPorConfirmar(comPairar)).toEqual(['hover'])
  })
})

describe('namespace e conversao de altura', () => {
  it('declara o namespace do dialeto de consumo', () => {
    const { gerado } = idaEVolta()
    expect(lerXML(gerado.template).atributos['xmlns:wpml']).toBe(NS_FLY)
    expect(NS_FLY).toBe('http://www.uav.com/wpmz/1.0.2')
  })

  it('usa alturas relativas ao ponto de descolagem', () => {
    const { gerado } = idaEVolta()
    const pasta = lerXML(gerado.waylines).filhos[0]?.filhos[1]
    expect(pasta?.filhos.find((f) => f.nome === 'wpml:executeHeightMode')?.texto).toBe(
      'relativeToStartPoint',
    )
  })

  it('recusa exportar uma rota em AGL sem as cotas do terreno', () => {
    const { importada } = idaEVolta()
    const emAGL = { ...importada.rota, modoAltitude: 'AGL' as const }
    expect(() => gerarFly(emAGL, droneComId('mini5pro'))).toThrow(/cota do terreno/)
  })

  it('converte AGL para altura relativa a descolagem', () => {
    const { importada } = idaEVolta()
    const emAGL = {
      ...importada.rota,
      modoAltitude: 'AGL' as const,
      pontoDescolagem: { ...importada.rota.pontoDescolagem, cotaTerreno: 236 },
      waypoints: importada.rota.waypoints.slice(0, 1).map((w) => ({ ...w, altura: 50 })),
      pois: [],
    }
    const chave = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
    const cotas = new Map<string, number>()
    for (const w of emAGL.waypoints) cotas.set(chave(w), 286)

    const raiz = lerXML(gerarFly(emAGL, droneComId('mini5pro'), { cotas, chave }).waylines)
    const altura = raiz.filhos[0]?.filhos[1]?.filhos
      .find((f) => f.nome === 'Placemark')
      ?.filhos.find((f) => f.nome === 'wpml:executeHeight')?.texto

    // 50 m acima de terreno a 286, com descolagem a 236: 100 m acima da descolagem.
    expect(altura).toBe('100.0')
  })
})
