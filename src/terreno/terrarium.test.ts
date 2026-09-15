import { describe, it, expect } from 'vitest'
import type { LatLon } from '../nucleo/tipos.ts'
import type { DescodificadorPNG } from './fonte.ts'
import { FonteTerrariumAWS } from './terrarium.ts'

const ZOOM = 14
const LADO = 256

/** Inversa da projecao usada pelo amostrador, para posicionar pixeis exactos. */
function latLonDoPixel(px: number, py: number, zoom: number): LatLon {
  const escala = 2 ** zoom * LADO
  const lon = (px / escala) * 360 - 180
  const n = Math.PI - (2 * Math.PI * py) / escala
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lat, lon }
}

/** Codifica metros no formato Terrarium. */
function codificar(metros: number): [number, number, number] {
  const v = Math.round((metros + 32768) * 256)
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
}

/**
 * Serve mosaicos sinteticos cuja cota e funcao das coordenadas de pixel globais,
 * para que os mosaicos vizinhos encaixem e se possa testar a fronteira entre eles.
 * Os bytes seguem directos para o descodificador falso, sem passar por PNG.
 */
function servidorFalso(cotaEmPixel: (xGlobal: number, yGlobal: number) => number) {
  const pedidos: string[] = []

  const buscar = (async (entrada: string | URL | Request) => {
    const url = String(entrada)
    pedidos.push(url)
    const encontrado = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url)
    if (!encontrado) return new Response(null, { status: 404 })

    const tx = Number(encontrado[2])
    const ty = Number(encontrado[3])
    const pixels = new Uint8ClampedArray(LADO * LADO * 4)
    for (let y = 0; y < LADO; y++) {
      for (let x = 0; x < LADO; x++) {
        const [r, g, b] = codificar(cotaEmPixel(tx * LADO + x, ty * LADO + y))
        const i = (y * LADO + x) * 4
        pixels[i] = r
        pixels[i + 1] = g
        pixels[i + 2] = b
        pixels[i + 3] = 255
      }
    }
    return new Response(pixels.buffer as ArrayBuffer, { status: 200 })
  }) as typeof fetch

  return { buscar, pedidos }
}

const descodificadorFalso: DescodificadorPNG = async (dados) => ({
  largura: LADO,
  altura: LADO,
  pixels: new Uint8ClampedArray(dados),
})

function criarFonte(
  cotaEmPixel: (x: number, y: number) => number,
  extra: { maxMosaicos?: number } = {},
) {
  const servidor = servidorFalso(cotaEmPixel)
  const fonte = new FonteTerrariumAWS({
    descodificador: descodificadorFalso,
    zoom: ZOOM,
    buscar: servidor.buscar,
    ...extra,
  })
  return { fonte, servidor }
}

describe('codificacao Terrarium', () => {
  it('le o valor exacto de um terreno plano, incluindo cotas negativas', async () => {
    for (const metros of [0, 1, 236.25, 1987.5, -430.5, 8848]) {
      const { fonte } = criarFonte(() => metros)
      const lida = await fonte.cota(40.75, -8.41)
      // O formato guarda 1/256 do metro, cerca de 4 mm.
      expect(lida).toBeCloseTo(metros, 2)
    }
  })
})

describe('interpolacao bilinear', () => {
  it('devolve o valor do centro do pixel sem o alterar', async () => {
    const { fonte } = criarFonte((x, y) => (x % 7) * 10 + (y % 5))
    // O centro do pixel (px, py) esta em px+0.5, py+0.5.
    const alvoX = 2 ** ZOOM * LADO * 0.5
    const alvoY = 2 ** ZOOM * LADO * 0.4
    const ponto = latLonDoPixel(Math.floor(alvoX) + 0.5, Math.floor(alvoY) + 0.5, ZOOM)
    const esperada = (Math.floor(alvoX) % 7) * 10 + (Math.floor(alvoY) % 5)
    expect(await fonte.cota(ponto.lat, ponto.lon)).toBeCloseTo(esperada, 2)
  })

  it('interpola a meio caminho entre dois pixeis vizinhos', async () => {
    // Rampa so em x: cota = x, para a interpolacao ser previsivel.
    const { fonte } = criarFonte((x) => x % 1000)
    const baseX = Math.floor(2 ** ZOOM * LADO * 0.5)
    const baseY = Math.floor(2 ** ZOOM * LADO * 0.4)
    const meio = latLonDoPixel(baseX + 1.0, baseY + 0.5, ZOOM)
    const esperada = ((baseX % 1000) + ((baseX + 1) % 1000)) / 2
    expect(await fonte.cota(meio.lat, meio.lon)).toBeCloseTo(esperada, 1)
  })

  it('nao parte na fronteira entre mosaicos vizinhos', async () => {
    // Rampa continua em x atraves da fronteira dos mosaicos.
    const { fonte, servidor } = criarFonte((x) => x / 100)
    const fronteira = 2 ** ZOOM * LADO * 0.5 // multiplo de 256, logo canto de mosaico
    const baseY = Math.floor(2 ** ZOOM * LADO * 0.4)

    const antes = latLonDoPixel(fronteira - 0.5, baseY + 0.5, ZOOM)
    const emCima = latLonDoPixel(fronteira, baseY + 0.5, ZOOM)
    const depois = latLonDoPixel(fronteira + 0.5, baseY + 0.5, ZOOM)

    const [a, b, c] = await Promise.all([
      fonte.cota(antes.lat, antes.lon),
      fonte.cota(emCima.lat, emCima.lon),
      fonte.cota(depois.lat, depois.lon),
    ])

    // Exactamente a meio da fronteira, a media dos dois pixeis de cada lado.
    expect(b).toBeCloseTo((a + c) / 2, 2)
    // E foi mesmo preciso ir buscar os dois mosaicos.
    const mosaicos = new Set(servidor.pedidos)
    expect(mosaicos.size).toBeGreaterThanOrEqual(2)
  })
})

describe('cache de mosaicos', () => {
  it('descarrega cada mosaico uma unica vez', async () => {
    const { fonte, servidor } = criarFonte(() => 300)
    await fonte.cota(40.75, -8.41)
    const aposPrimeira = servidor.pedidos.length
    await fonte.cota(40.75, -8.41)
    await fonte.cota(40.7501, -8.4101)
    expect(servidor.pedidos.length).toBe(aposPrimeira)
  })

  it('pede em paralelo e sem repetir quando o perfil atravessa varios mosaicos', async () => {
    const { fonte, servidor } = criarFonte((x, y) => (x + y) / 50)
    const cotas = await fonte.perfil(
      [
        { lat: 40.74707639, lon: -8.4121861 },
        { lat: 40.75179939, lon: -8.4049744 },
      ],
      10,
    )
    expect(cotas.length).toBeGreaterThan(70)
    expect(cotas.every((c) => Number.isFinite(c))).toBe(true)
    expect(new Set(servidor.pedidos).size).toBe(servidor.pedidos.length)
  })

  it('nao guarda mosaicos falhados, para a tentativa seguinte poder repetir', async () => {
    let falhar = true
    const buscar = (async () => {
      if (falhar) return new Response(null, { status: 503 })
      const pixels = new Uint8ClampedArray(LADO * LADO * 4)
      for (let i = 0; i < LADO * LADO; i++) {
        const [r, g, b] = codificar(123)
        pixels[i * 4] = r
        pixels[i * 4 + 1] = g
        pixels[i * 4 + 2] = b
        pixels[i * 4 + 3] = 255
      }
      return new Response(pixels.buffer as ArrayBuffer, { status: 200 })
    }) as typeof fetch

    const fonte = new FonteTerrariumAWS({ descodificador: descodificadorFalso, zoom: ZOOM, buscar })
    await expect(fonte.cota(40.75, -8.41)).rejects.toThrow(/indisponivel|503/)

    falhar = false
    expect(await fonte.cota(40.75, -8.41)).toBeCloseTo(123, 2)
  })

  it('respeita o limite de mosaicos em memoria', async () => {
    const { fonte, servidor } = criarFonte(() => 100, { maxMosaicos: 4 })
    // Pontos bem afastados, cada um no seu mosaico.
    for (let i = 0; i < 12; i++) {
      await fonte.cota(40 + i * 0.5, -8 + i * 0.5)
    }
    const primeiro = servidor.pedidos[0]
    if (!primeiro) throw new Error('sem pedidos registados')
    // O primeiro mosaico ja saiu da cache, por isso volta a ser pedido.
    const antes = servidor.pedidos.length
    await fonte.cota(40, -8)
    expect(servidor.pedidos.length).toBeGreaterThan(antes)
  })
})

describe('cobertura', () => {
  it('cobre o globo excepto as calotes fora da projecao', () => {
    const { fonte } = criarFonte(() => 0)
    expect(fonte.cobre(40.75, -8.41)).toBe(true)
    expect(fonte.cobre(-33.9, 18.4)).toBe(true)
    expect(fonte.cobre(89, 0)).toBe(false)
  })
})
