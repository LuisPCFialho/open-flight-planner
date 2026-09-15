import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { droneComId } from '../drones.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { acrescentarPOI, associarPOI } from '../nucleo/operacoes-poi.ts'
import { acrescentarAccao } from '../nucleo/operacoes-accoes.ts'
import { gerarFly, accoesPorConfirmar, NS_FLY } from './dialeto-fly.ts'
import { compararXML, etiquetasUsadas, lerXML } from './parse-xml.ts'

const REFERENCIA_TEMPLATE = 'docs/esquemas/fly-1.0.2-template.kml'
const REFERENCIA_WAYLINES = 'docs/esquemas/fly-1.0.2-waylines.wpml'
const REFERENCIA_ETIQUETAS = 'docs/esquemas/fly-1.0.2-etiquetas.txt'

/** Momento gravado no ficheiro de referencia. */
const INSTANTE = 1789471987504

/**
 * Reconstroi exactamente a rota que deu origem ao ficheiro de referencia,
 * extraido de um DJI RC 2 com Mini 5 Pro.
 */
function rotaDeReferencia(): Rota {
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
    acaoFinal: 'goHome',
    acaoPerdaSinal: 'goBack',
    criadaEm: INSTANTE,
    alteradaEm: INSTANTE,
  }

  const poi = {
    id: 'poi-referencia',
    nome: 'POI',
    lat: 38.658586,
    lon: -8.183793,
    altura: 50,
  }
  rota = acrescentarPOI(rota, poi)

  rota = acrescentarWaypoint(
    rota,
    waypointNovo({ lat: 38.6583110005792, lon: -8.18305089949604, altura: 50, index: 0 }),
  )
  const waypoint = rota.waypoints[0]
  if (!waypoint) throw new Error('waypoint em falta')

  rota = associarPOI(rota, [waypoint.id], poi.id)
  rota = acrescentarAccao(rota, waypoint.id, { tipo: 'tirarFoto' })
  rota = acrescentarAccao(rota, waypoint.id, { tipo: 'rodarGimbal', pitch: -30, yaw: 0 })
  return rota
}

function gerar() {
  return gerarFly(rotaDeReferencia(), droneComId('mini5pro'), {
    createTime: INSTANTE,
    updateTime: INSTANTE,
  })
}

function descrever(divergencias: ReturnType<typeof compararXML>): string {
  return divergencias
    .map((d) => `${d.caminho}: ${d.razao} (esperado ${d.esperado ?? '--'}, obtido ${d.obtido ?? '--'})`)
    .join('\n')
}

describe('template.kml do dialeto Fly', () => {
  it('bate etiqueta a etiqueta com o ficheiro real', () => {
    const esperado = lerXML(readFileSync(REFERENCIA_TEMPLATE, 'utf8'))
    const obtido = lerXML(gerar().template)
    const divergencias = compararXML(esperado, obtido)
    expect(divergencias, descrever(divergencias)).toEqual([])
  })

  it('declara o namespace do dialeto de consumo', () => {
    expect(lerXML(gerar().template).atributos['xmlns:wpml']).toBe(NS_FLY)
    expect(NS_FLY).toBe('http://www.uav.com/wpmz/1.0.2')
  })
})

describe('waylines.wpml do dialeto Fly', () => {
  it('bate etiqueta a etiqueta com o ficheiro real', () => {
    const esperado = lerXML(readFileSync(REFERENCIA_WAYLINES, 'utf8'))
    const obtido = lerXML(gerar().waylines)
    const divergencias = compararXML(esperado, obtido)
    expect(divergencias, descrever(divergencias)).toEqual([])
  })

  it('usa alturas relativas ao ponto de descolagem', () => {
    const raiz = lerXML(gerar().waylines)
    const pasta = raiz.filhos[0]?.filhos[1]
    const modo = pasta?.filhos.find((f) => f.nome === 'wpml:executeHeightMode')
    expect(modo?.texto).toBe('relativeToStartPoint')
  })
})

describe('lista fechada de etiquetas', () => {
  it('nao emite nenhuma etiqueta fora das observadas no ficheiro real', () => {
    const permitidas = new Set(
      readFileSync(REFERENCIA_ETIQUETAS, 'utf8')
        .split(/\n\s*\n/)[1]
        ?.split(/\s+/)
        .filter(Boolean)
        .map((nome) => `wpml:${nome}`) ?? [],
    )
    // Etiquetas do KML propriamente dito, fora do espaco de nomes wpml.
    for (const kml of ['kml', 'Document', 'Folder', 'Placemark', 'Point', 'coordinates']) {
      permitidas.add(kml)
    }

    const { template, waylines } = gerar()
    const usadas = new Set([
      ...etiquetasUsadas(lerXML(template)),
      ...etiquetasUsadas(lerXML(waylines)),
    ])

    const aMais = [...usadas].filter((nome) => !permitidas.has(nome))
    expect(aMais, `etiquetas fora da lista fechada: ${aMais.join(', ')}`).toEqual([])
  })

  it('a rota de referencia so usa accoes ja confirmadas num ficheiro real', () => {
    expect(accoesPorConfirmar(rotaDeReferencia())).toEqual([])
  })

  it('assinala as accoes cujo nome de funcao ainda nao foi confirmado', () => {
    let rota = rotaDeReferencia()
    const waypoint = rota.waypoints[0]
    if (!waypoint) throw new Error('waypoint em falta')
    rota = acrescentarAccao(rota, waypoint.id, { tipo: 'pairar', segundos: 4 })
    expect(accoesPorConfirmar(rota)).toEqual(['hover'])
  })
})

describe('coordenadas', () => {
  it('escreve longitude e latitude em `coordinates`, e latitude e longitude no POI', () => {
    const raiz = lerXML(gerar().waylines)
    const placemark = raiz.filhos[0]?.filhos[1]?.filhos.find((f) => f.nome === 'Placemark')

    const coordenadas = placemark?.filhos
      .find((f) => f.nome === 'Point')
      ?.filhos.find((f) => f.nome === 'coordinates')?.texto
    expect(coordenadas).toBe('-8.18305089949604,38.6583110005792')

    const poi = placemark?.filhos
      .find((f) => f.nome === 'wpml:waypointHeadingParam')
      ?.filhos.find((f) => f.nome === 'wpml:waypointPoiPoint')?.texto
    expect(poi).toBe('38.658586,-8.183793,50.000000')
  })
})

describe('conversao de altura ao exportar', () => {
  it('recusa exportar uma rota em AGL sem as cotas do terreno', () => {
    const rota = { ...rotaDeReferencia(), modoAltitude: 'AGL' as const }
    expect(() => gerarFly(rota, droneComId('mini5pro'))).toThrow(/cota do terreno/)
  })

  it('converte AGL para altura relativa a descolagem', () => {
    const rota = { ...rotaDeReferencia(), modoAltitude: 'AGL' as const }
    const chave = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`
    const cotas = new Map<string, number>()
    for (const w of rota.waypoints) cotas.set(chave(w), 286)
    for (const p of rota.pois) cotas.set(chave(p), 286)

    const raiz = lerXML(gerarFly(rota, droneComId('mini5pro'), { cotas, chave }).waylines)
    const altura = raiz.filhos[0]?.filhos[1]?.filhos
      .find((f) => f.nome === 'Placemark')
      ?.filhos.find((f) => f.nome === 'wpml:executeHeight')?.texto

    // 50 m acima de terreno a 286, com descolagem a 236: 100 m acima da descolagem.
    expect(altura).toBe('100')
  })
})
