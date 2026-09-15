import { describe, it, expect } from 'vitest'
import type { LatLon, Rota } from './tipos.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './operacoes-rota.ts'
import { acrescentarPOI, poiNovo } from './operacoes-poi.ts'
import { paraASL } from './geodesia.ts'
import { alturasAcimaDoSolo, converterModoAltitude, nivelarAcimaDoSolo } from './altitude.ts'

const chave = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`

const COTA_DESCOLAGEM = 200

/**
 * O caso que motivou a ferramenta: altura constante relativa a descolagem sobre
 * terreno com 137 m de desnivel. A rota parece boa no ficheiro e passa entre
 * 98 m e 235 m acima do solo.
 */
const RELEVO = [-105, -40, 0, 20, 32] as const

function rotaComRelevo(modo: Rota['modoAltitude'], altura: number) {
  let rota = rotaVazia({
    nome: 'ensaio',
    projetoId: 'p1',
    droneId: 'mini5pro',
    pontoDescolagem: { lat: 40.7, lon: -8.4, cotaTerreno: COTA_DESCOLAGEM },
  })
  rota = { ...rota, modoAltitude: modo }

  const cotas = new Map<string, number>()
  for (const [i, desvio] of RELEVO.entries()) {
    const ponto = { lat: 40.7 + i * 0.001, lon: -8.4 }
    rota = acrescentarWaypoint(rota, waypointNovo({ ...ponto, altura, index: i }))
    cotas.set(chave(ponto), COTA_DESCOLAGEM + desvio)
  }
  return { rota, cotas }
}

describe('alturasAcimaDoSolo', () => {
  it('revela a variacao escondida numa rota de altura constante', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const alturas = alturasAcimaDoSolo(rota, cotas, chave)

    expect(alturas).toEqual([235, 170, 130, 110, 98])
    expect(Math.max(...(alturas as number[]))).toBe(235)
    expect(Math.min(...(alturas as number[]))).toBe(98)
  })

  it('devolve null onde a cota ainda nao chegou', () => {
    const { rota } = rotaComRelevo('ALT', 130)
    expect(alturasAcimaDoSolo(rota, new Map(), chave)).toEqual([null, null, null, null, null])
  })

  it('e constante por construcao quando a rota ja esta em AGL', () => {
    const { rota, cotas } = rotaComRelevo('AGL', 60)
    expect(alturasAcimaDoSolo(rota, cotas, chave)).toEqual([60, 60, 60, 60, 60])
  })
})

describe('converterModoAltitude', () => {
  it('nao mexe na posicao fisica de nenhum waypoint', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const aslAntes = rota.waypoints.map((w, i) =>
      paraASL(w.altura, 'ALT', {
        cotaDescolagem: COTA_DESCOLAGEM,
        cotaTerreno: COTA_DESCOLAGEM + (RELEVO[i] ?? 0),
      }),
    )

    for (const modo of ['ASL', 'AGL'] as const) {
      const resultado = converterModoAltitude(rota, modo, cotas, chave)
      if (resultado.estado !== 'convertida') throw new Error('devia ter convertido')

      const aslDepois = resultado.rota.waypoints.map((w, i) =>
        paraASL(w.altura, modo, {
          cotaDescolagem: COTA_DESCOLAGEM,
          cotaTerreno: COTA_DESCOLAGEM + (RELEVO[i] ?? 0),
        }),
      )
      expect(aslDepois).toEqual(aslAntes)
    }
  })

  it('escreve em ASL a cota absoluta e em AGL a altura acima do solo', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)

    const asl = converterModoAltitude(rota, 'ASL', cotas, chave)
    if (asl.estado !== 'convertida') throw new Error('devia ter convertido')
    expect(asl.rota.waypoints.map((w) => w.altura)).toEqual([330, 330, 330, 330, 330])

    const agl = converterModoAltitude(rota, 'AGL', cotas, chave)
    if (agl.estado !== 'convertida') throw new Error('devia ter convertido')
    expect(agl.rota.waypoints.map((w) => w.altura)).toEqual([235, 170, 130, 110, 98])
  })

  it('recusa converter quando falta alguma cota, em vez de converter metade', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const incompletas = new Map(cotas)
    const terceiro = rota.waypoints[2]
    if (!terceiro) throw new Error('waypoint em falta')
    incompletas.delete(chave(terceiro))

    const resultado = converterModoAltitude(rota, 'AGL', incompletas, chave)
    expect(resultado.estado).toBe('faltamCotas')
    if (resultado.estado !== 'faltamCotas') return
    expect(resultado.indicesEmFalta).toEqual([2])
  })

  it('converte tambem a altura dos POI', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const pontoPoi = { lat: 40.71, lon: -8.41 }
    const comPoi = acrescentarPOI(rota, poiNovo({ ...pontoPoi, altura: 100 }))
    cotas.set(chave(pontoPoi), COTA_DESCOLAGEM + 50)

    const resultado = converterModoAltitude(comPoi, 'ASL', cotas, chave)
    if (resultado.estado !== 'convertida') throw new Error('devia ter convertido')
    expect(resultado.rota.pois[0]?.altura).toBe(300)
  })

  it('nao faz nada quando o modo ja e o pedido', () => {
    const { rota, cotas } = rotaComRelevo('AGL', 60)
    const resultado = converterModoAltitude(rota, 'AGL', cotas, chave)
    expect(resultado.estado).toBe('semAlteracao')
    if (resultado.estado === 'semAlteracao') expect(resultado.rota).toBe(rota)
  })
})

describe('nivelarAcimaDoSolo', () => {
  it('poe a rota toda a altura constante acima do terreno', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const resultado = nivelarAcimaDoSolo(rota, 80, cotas, chave)
    if (resultado.estado !== 'convertida') throw new Error('devia ter nivelado')

    expect(alturasAcimaDoSolo(resultado.rota, cotas, chave)).toEqual([80, 80, 80, 80, 80])
    // Continua escrita no modo da rota, que nao muda.
    expect(resultado.rota.modoAltitude).toBe('ALT')
    expect(resultado.rota.waypoints.map((w) => w.altura)).toEqual([-25, 40, 80, 100, 112])
  })

  it('recusa nivelar com cotas em falta', () => {
    const { rota } = rotaComRelevo('ALT', 130)
    expect(nivelarAcimaDoSolo(rota, 80, new Map(), chave).estado).toBe('faltamCotas')
  })

  it('nao altera a rota recebida', () => {
    const { rota, cotas } = rotaComRelevo('ALT', 130)
    const copia = structuredClone(rota)
    nivelarAcimaDoSolo(rota, 80, cotas, chave)
    converterModoAltitude(rota, 'ASL', cotas, chave)
    expect(rota).toEqual(copia)
  })
})
