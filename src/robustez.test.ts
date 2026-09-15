/**
 * Rotas geradas ao acaso, contra os caminhos que os testes escritos a mao nao
 * pisam.
 *
 * A semente e deterministica: uma falha aqui reproduz-se pelo numero que a
 * mensagem indica. Foi este ficheiro que apanhou a velocidade zero a sair como
 * duracao infinita e a fazer rebentar a exportacao para Pilot 2.
 *
 * Os valores sao propositadamente hostis: latitudes de polo a polo, nomes com
 * `&` e `<`, alturas negativas, rotas sem waypoint nenhum.
 */
import { describe, it, expect } from 'vitest'
import type { Rota, Waypoint, Accao } from './nucleo/tipos.ts'
import { droneComId } from './drones.ts'
import { rotaVazia, waypointNovo, acrescentarWaypoint } from './nucleo/operacoes-rota.ts'
import { acrescentarPOI, associarPOI } from './nucleo/operacoes-poi.ts'
import { gerarFly } from './kmz/dialeto-fly.ts'
import { gerarPilot2 } from './kmz/dialeto-pilot2.ts'
import { criarKMZBytes, lerKMZ } from './kmz/empacotar.ts'
import { importarKMZ } from './kmz/importar.ts'
import { calcularEstatisticas, formatarDuracao } from './nucleo/estatisticas.ts'
import { validarRota } from './nucleo/validacoes.ts'
import { chaveDaPosicao } from './estado/useCotasTerreno.ts'

/** Cotas de terreno inventadas mas coerentes, para exercitar o caminho AGL. */
function cotasDe(rota: Rota): ReadonlyMap<string, number> {
  const m = new Map<string, number>()
  for (const w of rota.waypoints) {
    m.set(chaveDaPosicao(w), rota.pontoDescolagem.cotaTerreno + ((w.index * 7) % 40) - 20)
  }
  for (const poi of rota.pois) {
    m.set(chaveDaPosicao(poi), rota.pontoDescolagem.cotaTerreno + 5)
  }
  m.set(chaveDaPosicao(rota.pontoDescolagem), rota.pontoDescolagem.cotaTerreno)
  return m
}

// PRNG deterministico, para uma falha ser reproduzivel pelo numero da semente.
function prng(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const NOMES_HOSTIS = [
  'obra & campo',
  'rota <2>',
  'aspas "duplas"',
  "apostrofo'simples",
  'acentuacao ção ãõ',
  '',
  'x'.repeat(300),
]

function rotaAleatoria(semente: number, droneId: string): Rota {
  const r = prng(semente)
  const n = Math.floor(r() * 12) // 0 a 11 waypoints

  const lat = -85 + r() * 170
  const lon = -180 + r() * 360

  let rota = rotaVazia({
    nome: NOMES_HOSTIS[Math.floor(r() * NOMES_HOSTIS.length)] ?? 'x',
    projetoId: 'p',
    droneId,
    pontoDescolagem: { lat, lon, cotaTerreno: -50 + r() * 3000 },
  })

  rota = {
    ...rota,
    modoAltitude: (['ASL', 'ALT', 'AGL'] as const)[Math.floor(r() * 3)] ?? 'AGL',
    velocidadeGlobal: r() < 0.1 ? 0 : r() * 20,
    ondulacaoGeoide: r() * 100,
  }

  if (r() < 0.5) {
    rota = acrescentarPOI(rota, {
      id: 'poi-f',
      nome: 'alvo',
      lat: lat + (r() - 0.5) * 0.01,
      lon: lon + (r() - 0.5) * 0.01,
      altura: r() * 100,
    })
  }

  for (let i = 0; i < n; i++) {
    const wp: Waypoint = {
      ...waypointNovo({
        lat: lat + (r() - 0.5) * 0.02,
        lon: lon + (r() - 0.5) * 0.02,
        altura: -20 + r() * 600,
        index: i,
      }),
      gimbalPitch: -90 + r() * 120,
      gimbalYaw: -180 + r() * 360,
      tipoCurva: r() < 0.5 ? 'passarSuave' : 'pararNoPonto',
      distanciaAmortecimento: r() < 0.5 ? r() * 30 : 0,
      modoGuinada: (['followWayline', 'fixed', 'manual'] as const)[Math.floor(r() * 3)] ?? 'followWayline',
      guinada: -180 + r() * 360,
      ...(r() < 0.3 ? { velocidade: r() * 18 } : {}),
    }

    const acoes: Accao[] = []
    if (r() < 0.6) acoes.push({ tipo: 'tirarFoto' })
    if (r() < 0.2) acoes.push({ tipo: 'pairar', segundos: Math.floor(r() * 30) })
    if (r() < 0.3) acoes.push({ tipo: 'rodarGimbal', pitch: -90 + r() * 90, yaw: -180 + r() * 360 })
    if (r() < 0.15) acoes.push({ tipo: 'rodarAeronave', heading: -180 + r() * 360 })
    rota = acrescentarWaypoint(rota, { ...wp, acoes })
  }

  if (rota.pois.length > 0 && rota.waypoints.length > 0 && r() < 0.5) {
    const alvos = rota.waypoints.filter(() => r() < 0.5).map((w) => w.id)
    rota = associarPOI(rota, alvos, 'poi-f')
    rota = {
      ...rota,
      waypoints: rota.waypoints.map((w) =>
        w.poiId ? { ...w, modoGuinada: 'towardPOI' as const } : w,
      ),
    }
  }

  return rota
}

const SEMENTES = Array.from({ length: 400 }, (_, i) => i + 1)

describe('fuzz: geracao de KMZ', () => {
  for (const droneId of ['mini5pro', 'mavic3t']) {
    const gerar = droneId === 'mini5pro' ? gerarFly : gerarPilot2

    it(`${droneId}: nunca escreve NaN, Infinity nem undefined`, () => {
      const maus: string[] = []
      for (const s of SEMENTES) {
        const rota = rotaAleatoria(s, droneId)
        let saida
        try {
          saida = gerar(rota, droneComId(droneId), { cotas: cotasDe(rota), chave: chaveDaPosicao })
        } catch (e) {
          maus.push(`semente ${s}: excepcao ${String(e)}`)
          continue
        }
        for (const [nome, texto] of [['template', saida.template], ['waylines', saida.waylines]] as const) {
          const m = texto.match(/NaN|Infinity|undefined|>null</)
          if (m) maus.push(`semente ${s} ${nome}: ${m[0]}`)
        }
      }
      expect(maus.slice(0, 10)).toEqual([])
    })

    it(`${droneId}: ida e volta preserva o numero de waypoints`, async () => {
      const maus: string[] = []
      for (const s of SEMENTES) {
        const rota = rotaAleatoria(s, droneId)
        if (rota.waypoints.length === 0) continue
        try {
          const bytes = await criarKMZBytes(
            gerar(rota, droneComId(droneId), { cotas: cotasDe(rota), chave: chaveDaPosicao }),
          )
          const { rota: volta } = importarKMZ(await lerKMZ(bytes), { projetoId: 'p' })
          if (volta.waypoints.length !== rota.waypoints.length) {
            maus.push(`semente ${s}: ${rota.waypoints.length} -> ${volta.waypoints.length}`)
          }
          for (const [i, antes] of rota.waypoints.entries()) {
            const dep = volta.waypoints[i]
            if (!dep) continue
            const dif = (a: number, b: number, tol: number, campo: string) => {
              if (Math.abs(a - b) > tol) maus.push(`semente ${s} wp ${i} ${campo}: ${a} -> ${b}`)
            }
            dif(antes.lat, dep.lat, 1e-6, 'lat')
            dif(antes.lon, dep.lon, 1e-6, 'lon')
            dif(antes.gimbalPitch, dep.gimbalPitch, 0.05, 'gimbalPitch')
            dif(antes.gimbalYaw, dep.gimbalYaw, 0.05, 'gimbalYaw')
            dif(
              antes.velocidade ?? rota.velocidadeGlobal,
              dep.velocidade ?? volta.velocidadeGlobal,
              0.05,
              'velocidade',
            )
            if (antes.tipoCurva !== dep.tipoCurva) {
              maus.push(`semente ${s} wp ${i} tipoCurva: ${antes.tipoCurva} -> ${dep.tipoCurva}`)
            }
            if (antes.modoGuinada !== dep.modoGuinada) {
              maus.push(`semente ${s} wp ${i} modoGuinada: ${antes.modoGuinada} -> ${dep.modoGuinada}`)
            }
            if (antes.acoes.length !== dep.acoes.length) {
              maus.push(
                `semente ${s} wp ${i} accoes: ${antes.acoes.map((a) => a.tipo).join('+')} -> ${dep.acoes.map((a) => a.tipo).join('+')}`,
              )
            } else {
              for (const [j, aAntes] of antes.acoes.entries()) {
                const aDep = dep.acoes[j]
                if (!aDep || aAntes.tipo !== aDep.tipo) {
                  maus.push(`semente ${s} wp ${i} accao ${j}: ${aAntes.tipo} -> ${aDep?.tipo}`)
                }
              }
            }
          }
          /*
           * So se comparam os POI que algum waypoint aponta. O WPML nao tem onde
           * guardar um ponto de interesse solto: ele vive dentro dos parametros
           * de guinada do waypoint que aponta para la. Um POI que ninguem usa
           * perde-se na ida e volta por ficheiro, e e assim que tem de ser.
           */
          const usados = new Set(rota.waypoints.map((w) => w.poiId).filter(Boolean))
          if (usados.size !== volta.pois.length) {
            maus.push(`semente ${s}: POIs usados ${usados.size} -> ${volta.pois.length}`)
          }
          if (
            rota.waypoints.filter((w) => w.poiId).length !==
            volta.waypoints.filter((w) => w.poiId).length
          ) {
            maus.push(`semente ${s}: associacoes a POI perdidas`)
          }
        } catch (e) {
          maus.push(`semente ${s}: excepcao ${String(e)}`)
        }
      }
      expect(maus.slice(0, 10)).toEqual([])
    })
  }
})

describe('fuzz: nucleo', () => {
  it('as estatisticas nunca dao NaN nem Infinity', () => {
    const maus: string[] = []
    for (const s of SEMENTES) {
      const rota = rotaAleatoria(s, 'mini5pro')
      const e = calcularEstatisticas(rota)
      for (const [k, v] of Object.entries(e)) {
        if (!Number.isFinite(v)) maus.push(`semente ${s}: ${k} = ${v}`)
      }
      const t = formatarDuracao(e.duracao)
      if (/NaN|Infinity/.test(t)) maus.push(`semente ${s}: duracao formatada "${t}"`)
    }
    expect(maus.slice(0, 10)).toEqual([])
  })

  it('a validacao nunca rebenta', () => {
    const maus: string[] = []
    for (const s of SEMENTES) {
      const rota = rotaAleatoria(s, 'mini5pro')
      try {
        validarRota(rota, droneComId('mini5pro'), {
          cotas: cotasDe(rota),
          chave: chaveDaPosicao,
        })
      } catch (e) {
        maus.push(`semente ${s}: ${String(e)}`)
      }
    }
    expect(maus.slice(0, 10)).toEqual([])
  })
})
