import { describe, it, expect } from 'vitest'
import type { Rota } from '../nucleo/tipos.ts'
import { droneComId } from '../drones.ts'
import { deslocar } from '../nucleo/geodesia.ts'
import { rotaVazia, acrescentarWaypoint, waypointNovo } from '../nucleo/operacoes-rota.ts'
import { acrescentarPOI, associarPOI } from '../nucleo/operacoes-poi.ts'
import { acrescentarAccao } from '../nucleo/operacoes-accoes.ts'
import { gerarFly } from './dialeto-fly.ts'
import { gerarPilot2, NS_PILOT2 } from './dialeto-pilot2.ts'
import { criarKMZBytes, lerKMZ, CAMINHO_TEMPLATE, CAMINHO_WAYLINES } from './empacotar.ts'
import { detectarDialeto, importarKMZ } from './importar.ts'
import { lerXML, textoEm, filho, filhos } from './parse-xml.ts'

const DESCOLAGEM = { lat: 40.746552, lon: -8.41061, cotaTerreno: 355.9 }

/**
 * Rota de 50 waypoints com variedade suficiente para exercitar todos os campos:
 * alturas e velocidades diferentes, os dois tipos de curva, guinada fixa e por
 * POI, e accoes de foto e de gimbal.
 */
function rotaDe50(droneId: string): Rota {
  let rota = rotaVazia({
    nome: 'ensaio de 50',
    projetoId: 'p1',
    droneId,
    pontoDescolagem: DESCOLAGEM,
  })
  rota = { ...rota, modoAltitude: 'ALT', velocidadeGlobal: 6 }

  const poi = { id: 'poi-1', nome: 'POI 1', lat: 40.7495, lon: -8.4085, altura: 40 }
  rota = acrescentarPOI(rota, poi)

  let ponto = { lat: DESCOLAGEM.lat, lon: DESCOLAGEM.lon }
  for (let i = 0; i < 50; i++) {
    rota = acrescentarWaypoint(
      rota,
      waypointNovo({ ...ponto, altura: 60 + (i % 7) * 5, index: i }),
    )
    ponto = deslocar(ponto, (i * 37) % 360, 45 + (i % 5) * 10)
  }

  rota = {
    ...rota,
    waypoints: rota.waypoints.map((w, i) => ({
      ...w,
      gimbalPitch: -20 - (i % 6) * 10,
      gimbalYaw: i % 3 === 0 ? 0 : 15,
      tipoCurva: i % 4 === 0 ? 'passarSuave' : 'pararNoPonto',
      ...(i % 5 === 0 ? { velocidade: 3 + (i % 3) } : {}),
      ...(i % 9 === 0 ? { modoGuinada: 'fixed' as const, guinada: (i * 11) % 180 } : {}),
    })),
  }

  // Um terco dos waypoints aponta ao POI.
  const paraPOI = rota.waypoints.filter((_, i) => i % 3 === 1).map((w) => w.id)
  rota = associarPOI(rota, paraPOI, poi.id)

  for (const waypoint of rota.waypoints) {
    if (waypoint.index % 2 === 0) rota = acrescentarAccao(rota, waypoint.id, { tipo: 'tirarFoto' })
    if (waypoint.index % 6 === 0) {
      rota = acrescentarAccao(rota, waypoint.id, {
        tipo: 'rodarGimbal',
        pitch: waypoint.gimbalPitch,
        yaw: waypoint.gimbalYaw,
      })
    }
  }
  return rota
}

describe('empacotamento', () => {
  it('escreve exactamente os dois ficheiros que o aparelho espera', async () => {
    const rota = rotaDe50('mini5pro')
    const gerado = gerarFly(rota, droneComId('mini5pro'))
    const bytes = await criarKMZBytes(gerado)

    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(bytes)
    const nomes = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir)

    expect(nomes.sort()).toEqual([CAMINHO_TEMPLATE, CAMINHO_WAYLINES])
  })

  it('le de volta o que escreveu', async () => {
    const gerado = gerarFly(rotaDe50('mini5pro'), droneComId('mini5pro'))
    const lido = await lerKMZ(await criarKMZBytes(gerado))

    expect(lido.template).toBe(gerado.template)
    expect(lido.waylines).toBe(gerado.waylines)
  })
})

describe('deteccao de dialeto pelo namespace', () => {
  it('distingue os dois dialetos', () => {
    expect(detectarDialeto(gerarFly(rotaDe50('mini5pro'), droneComId('mini5pro')).waylines)).toBe('fly')
    expect(detectarDialeto(gerarPilot2(rotaDe50('mavic3t'), droneComId('mavic3t')).waylines)).toBe(
      'pilot2',
    )
  })

  it('recusa um namespace que nao reconhece', () => {
    expect(() =>
      detectarDialeto('<kml xmlns:wpml="http://exemplo.invalido/1.0"><Document/></kml>'),
    ).toThrow(/namespace WPML desconhecido/)
  })
})

describe('ida e volta no dialeto Fly, 50 waypoints', () => {
  const original = rotaDe50('mini5pro')

  async function voltar(): Promise<Rota> {
    const bytes = await criarKMZBytes(gerarFly(original, droneComId('mini5pro')))
    const { rota, avisos, cotaDescolagemConhecida } = importarKMZ(await lerKMZ(bytes), {
      projetoId: 'p1',
    })
    expect(avisos).toEqual([])
    // O dialeto Fly nao grava a cota do terreno no ponto de descolagem.
    expect(cotaDescolagemConhecida).toBe(false)
    return { ...rota, pontoDescolagem: DESCOLAGEM }
  }

  it('devolve os 50 waypoints com posicao, altura e velocidade intactas', async () => {
    const volta = await voltar()
    expect(volta.waypoints).toHaveLength(50)

    for (const [i, antes] of original.waypoints.entries()) {
      const depois = volta.waypoints[i]
      if (!depois) throw new Error(`waypoint ${i} perdido`)

      expect(depois.index, `indice do waypoint ${i}`).toBe(antes.index)
      expect(depois.lat, `latitude do waypoint ${i}`).toBeCloseTo(antes.lat, 9)
      expect(depois.lon, `longitude do waypoint ${i}`).toBeCloseTo(antes.lon, 9)
      expect(depois.altura, `altura do waypoint ${i}`).toBeCloseTo(antes.altura, 3)
      expect(depois.velocidade, `velocidade do waypoint ${i}`).toBeCloseTo(
        antes.velocidade ?? original.velocidadeGlobal,
        3,
      )
    }
  })

  it('devolve os angulos do gimbal e o tipo de curva', async () => {
    const volta = await voltar()
    for (const [i, antes] of original.waypoints.entries()) {
      const depois = volta.waypoints[i]
      if (!depois) throw new Error(`waypoint ${i} perdido`)
      expect(depois.gimbalPitch, `pitch do waypoint ${i}`).toBeCloseTo(antes.gimbalPitch, 3)
      expect(depois.gimbalYaw, `yaw do waypoint ${i}`).toBeCloseTo(antes.gimbalYaw, 3)
      expect(depois.tipoCurva, `curva do waypoint ${i}`).toBe(antes.tipoCurva)
    }
  })

  it('devolve as accoes pela mesma ordem e com os mesmos parametros', async () => {
    const volta = await voltar()
    for (const [i, antes] of original.waypoints.entries()) {
      const depois = volta.waypoints[i]
      if (!depois) throw new Error(`waypoint ${i} perdido`)
      expect(depois.acoes, `accoes do waypoint ${i}`).toEqual(antes.acoes)
    }
  })

  it('devolve a guinada, incluindo o rumo fixo e o POI partilhado', async () => {
    const volta = await voltar()

    for (const [i, antes] of original.waypoints.entries()) {
      const depois = volta.waypoints[i]
      if (!depois) throw new Error(`waypoint ${i} perdido`)
      expect(depois.modoGuinada, `modo de guinada do waypoint ${i}`).toBe(antes.modoGuinada)
      if (antes.modoGuinada === 'fixed') {
        expect(depois.guinada, `rumo fixo do waypoint ${i}`).toBeCloseTo(antes.guinada ?? 0, 1)
      }
    }

    // Os waypoints que apontavam ao mesmo sitio partilham um unico POI.
    expect(volta.pois).toHaveLength(1)
    const poi = volta.pois[0]
    const original0 = original.pois[0]
    if (!poi || !original0) throw new Error('POI perdido')
    expect(poi.lat).toBeCloseTo(original0.lat, 6)
    expect(poi.lon).toBeCloseTo(original0.lon, 6)

    const apontam = volta.waypoints.filter((w) => w.poiId === poi.id)
    expect(apontam).toHaveLength(original.waypoints.filter((w) => w.poiId).length)
  })

  it('devolve a configuracao da missao', async () => {
    const volta = await voltar()
    expect(volta.droneId).toBe(original.droneId)
    expect(volta.velocidadeGlobal).toBeCloseTo(original.velocidadeGlobal, 3)
    expect(volta.modoDescolagem).toBe(original.modoDescolagem)
    expect(volta.acaoFinal).toBe(original.acaoFinal)
    expect(volta.acaoPerdaSinal).toBe(original.acaoPerdaSinal)
    expect(volta.modoAltitude).toBe('ALT')
  })
})

describe('exportacao para Mavic 3T', () => {
  const rota = rotaDe50('mavic3t')
  const gerado = gerarPilot2(rota, droneComId('mavic3t'))

  it('declara o namespace do dialeto empresarial', () => {
    expect(lerXML(gerado.waylines).atributos['xmlns:wpml']).toBe(NS_PILOT2)
    expect(NS_PILOT2).toBe('http://www.dji.com/wpmz/1.0.6')
  })

  it('usa alturas absolutas', () => {
    const pasta = filho(filho(lerXML(gerado.waylines), 'Document'), 'Folder')
    expect(textoEm(pasta, 'wpml:executeHeightMode')).toBe('WGS84')

    // 60 m acima de uma descolagem a 355,9 m sao 415,9 m absolutos.
    const primeira = filhos(pasta, 'Placemark')[0]
    expect(Number.parseFloat(textoEm(primeira, 'wpml:executeHeight') ?? '')).toBeCloseTo(415.9, 3)
  })

  it('leva payloadInfo com o valor da camara', () => {
    const config = filho(filho(lerXML(gerado.waylines), 'Document'), 'wpml:missionConfig')
    expect(textoEm(config, 'wpml:payloadInfo/wpml:payloadEnumValue')).toBe('67')
    expect(textoEm(config, 'wpml:payloadInfo/wpml:payloadSubEnumValue')).toBe('0')
  })

  it('escreve o ponto de descolagem em altura elipsoidal', () => {
    const config = filho(filho(lerXML(gerado.waylines), 'Document'), 'wpml:missionConfig')
    const partes = (textoEm(config, 'wpml:takeOffRefPoint') ?? '').split(',').map(Number.parseFloat)

    expect(partes[0]).toBeCloseTo(DESCOLAGEM.lat, 6)
    expect(partes[1]).toBeCloseTo(DESCOLAGEM.lon, 6)
    // 355,9 ortometrica mais 55,6 de ondulacao.
    expect(partes[2]).toBeCloseTo(411.5, 3)
  })

  it('corre as accoes por ordem, nao em paralelo', () => {
    const pasta = filho(filho(lerXML(gerado.waylines), 'Document'), 'Folder')
    const comAccoes = filhos(pasta, 'Placemark').find((p) => filho(p, 'wpml:actionGroup'))
    expect(textoEm(comAccoes, 'wpml:actionGroup/wpml:actionGroupMode')).toBe('sequence')
  })

  it('o template leva o percurso todo, com as duas alturas por waypoint', () => {
    const pasta = filho(filho(lerXML(gerado.template), 'Document'), 'Folder')
    const placemarks = filhos(pasta, 'Placemark')
    expect(placemarks).toHaveLength(50)

    const primeiro = placemarks[0]
    const elipsoidal = Number.parseFloat(textoEm(primeiro, 'wpml:ellipsoidHeight') ?? '')
    const ortometrica = Number.parseFloat(textoEm(primeiro, 'wpml:height') ?? '')

    // A diferenca entre as duas e a ondulacao do geoide.
    expect(elipsoidal - ortometrica).toBeCloseTo(55.6, 3)
    expect(ortometrica).toBeCloseTo(415.9, 3)
  })

  it('declara o sistema de coordenadas e a referencia de altura', () => {
    const pasta = filho(filho(lerXML(gerado.template), 'Document'), 'Folder')
    expect(textoEm(pasta, 'wpml:waylineCoordinateSysParam/wpml:coordinateMode')).toBe('WGS84')
    expect(textoEm(pasta, 'wpml:waylineCoordinateSysParam/wpml:heightMode')).toBe('EGM96')
  })
})

describe('ida e volta no dialeto Pilot 2', () => {
  it('devolve as alturas absolutas e o ponto de descolagem', async () => {
    const original = rotaDe50('mavic3t')
    const bytes = await criarKMZBytes(gerarPilot2(original, droneComId('mavic3t')))
    const { rota, dialeto, cotaDescolagemConhecida } = importarKMZ(await lerKMZ(bytes), {
      projetoId: 'p1',
    })

    expect(dialeto).toBe('pilot2')
    // Este dialeto traz `takeOffRefPoint`, logo a cota vem no ficheiro.
    expect(cotaDescolagemConhecida).toBe(true)
    expect(rota.modoAltitude).toBe('ASL')
    expect(rota.droneId).toBe('mavic3t')
    expect(rota.pontoDescolagem.lat).toBeCloseTo(DESCOLAGEM.lat, 6)
    expect(rota.pontoDescolagem.cotaTerreno).toBeCloseTo(DESCOLAGEM.cotaTerreno, 3)

    // A altura vem absoluta: 60 m acima de 355,9 sao 415,9.
    expect(rota.waypoints[0]?.altura).toBeCloseTo(415.9, 3)
  })
})

describe('ficheiro truncado', () => {
  it('avisa quando nao ha waypoints nem ponto de descolagem, em vez de cair em (0,0)', async () => {
    const rota = rotaDe50('mini5pro')
    const gerado = gerarFly(rota, droneComId('mini5pro'))

    // Um waylines.wpml valido mas sem nenhum Placemark, como um ficheiro que
    // tenha ficado a meio da transferencia em obra.
    const semPlacemarks = gerado.waylines.replace(/\s*<Placemark>[\s\S]*?<\/Placemark>/g, '')
    const bytes = await criarKMZBytes({ template: gerado.template, waylines: semPlacemarks })

    const { rota: lida, avisos } = importarKMZ(await lerKMZ(bytes), { projetoId: 'p1' })

    expect(lida.waypoints).toHaveLength(0)
    // Sem isto a rota ficava calada no Golfo da Guine.
    expect(avisos.join(' ')).toMatch(/sem posicao conhecida|nao traz waypoints/)
  })
})
