import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { malhaDrone } from '../src/mapa/modelo-drone.ts'

/**
 * Retrato da malha do drone, em quatro vistas, para um PNG.
 *
 * Corre-se com `npx vite-node ferramentas/retrato-drone.ts`.
 *
 * Existe porque no mapa o aparelho tem tamanho constante no ecra: aproximar a
 * vista nao o aumenta, e por isso nao ha maneira de olhar para o modelo dentro
 * do programa. Sem isto, mexer na malha era mexer as cegas - foi assim que
 * passaram despercebidas as helices a atravessar o corpo.
 *
 * O rasterizador e de brincadeira de proposito: profundidade por pixel, uma luz
 * direccional e nada mais. So tem de mostrar a forma.
 */
function retrato(
  largura: number,
  altura: number,
  camara: { azimute: number; elevacao: number; escala: number },
): Uint8Array {
  const malha = malhaDrone()
  const cor = new Float32Array(largura * altura * 3)
  const profundidade = new Float32Array(largura * altura).fill(Infinity)

  const ca = Math.cos(camara.azimute)
  const sa = Math.sin(camara.azimute)
  const ce = Math.cos(camara.elevacao)
  const se = Math.sin(camara.elevacao)

  const projectar = (i: number): [number, number, number] => {
    const x = malha.posicoes[i * 3] ?? 0
    const y = malha.posicoes[i * 3 + 1] ?? 0
    const z = malha.posicoes[i * 3 + 2] ?? 0
    const xr = x * ca + y * sa
    const yr = -x * sa + y * ca
    const yv = yr * ce - z * se
    const zv = yr * se + z * ce
    return [largura / 2 + xr * camara.escala, altura / 2 - zv * camara.escala, yv]
  }

  const luz = [0.4, 0.35, 0.85]
  const norma = Math.hypot(luz[0] ?? 0, luz[1] ?? 0, luz[2] ?? 0)

  for (let t = 0; t < malha.indices.length; t += 3) {
    const vs = [malha.indices[t] ?? 0, malha.indices[t + 1] ?? 0, malha.indices[t + 2] ?? 0]
    const p0 = projectar(vs[0] ?? 0)
    const p1 = projectar(vs[1] ?? 0)
    const p2 = projectar(vs[2] ?? 0)

    const nx = (malha.normais[(vs[0] ?? 0) * 3] ?? 0) * ca + (malha.normais[(vs[0] ?? 0) * 3 + 1] ?? 0) * sa
    const ny = -(malha.normais[(vs[0] ?? 0) * 3] ?? 0) * sa + (malha.normais[(vs[0] ?? 0) * 3 + 1] ?? 0) * ca
    const nz = malha.normais[(vs[0] ?? 0) * 3 + 2] ?? 0
    const brilho =
      0.35 +
      0.65 *
        Math.max(0, (nx * (luz[0] ?? 0) + ny * (luz[1] ?? 0) + nz * (luz[2] ?? 0)) / norma)

    const base = [
      malha.cores[(vs[0] ?? 0) * 4] ?? 0,
      malha.cores[(vs[0] ?? 0) * 4 + 1] ?? 0,
      malha.cores[(vs[0] ?? 0) * 4 + 2] ?? 0,
    ]

    const minX = Math.max(0, Math.floor(Math.min(p0[0] ?? 0, p1[0] ?? 0, p2[0] ?? 0)))
    const maxX = Math.min(largura - 1, Math.ceil(Math.max(p0[0] ?? 0, p1[0] ?? 0, p2[0] ?? 0)))
    const minY = Math.max(0, Math.floor(Math.min(p0[1] ?? 0, p1[1] ?? 0, p2[1] ?? 0)))
    const maxY = Math.min(altura - 1, Math.ceil(Math.max(p0[1] ?? 0, p1[1] ?? 0, p2[1] ?? 0)))

    const area =
      ((p1[0] ?? 0) - (p0[0] ?? 0)) * ((p2[1] ?? 0) - (p0[1] ?? 0)) -
      ((p2[0] ?? 0) - (p0[0] ?? 0)) * ((p1[1] ?? 0) - (p0[1] ?? 0))
    if (Math.abs(area) < 1e-9) continue

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const w0 =
          (((p1[0] ?? 0) - (p0[0] ?? 0)) * (py + 0.5 - (p0[1] ?? 0)) -
            (py === 0 ? 0 : 0) -
            ((p1[1] ?? 0) - (p0[1] ?? 0)) * (px + 0.5 - (p0[0] ?? 0))) /
          area
        const w1 =
          (((p2[0] ?? 0) - (p1[0] ?? 0)) * (py + 0.5 - (p1[1] ?? 0)) -
            ((p2[1] ?? 0) - (p1[1] ?? 0)) * (px + 0.5 - (p1[0] ?? 0))) /
          area
        const w2 =
          (((p0[0] ?? 0) - (p2[0] ?? 0)) * (py + 0.5 - (p2[1] ?? 0)) -
            ((p0[1] ?? 0) - (p2[1] ?? 0)) * (px + 0.5 - (p2[0] ?? 0))) /
          area
        if (w0 < 0 || w1 < 0 || w2 < 0) continue

        const z = w1 * (p0[2] ?? 0) + w2 * (p1[2] ?? 0) + w0 * (p2[2] ?? 0)
        const indice = py * largura + px
        if (z >= (profundidade[indice] ?? Infinity)) continue
        profundidade[indice] = z
        cor[indice * 3] = (base[0] ?? 0) * brilho
        cor[indice * 3 + 1] = (base[1] ?? 0) * brilho
        cor[indice * 3 + 2] = (base[2] ?? 0) * brilho
      }
    }
  }

  const bytes = new Uint8Array(largura * altura * 3)
  for (let i = 0; i < largura * altura; i++) {
    const vazio = profundidade[i] === Infinity
    for (let k = 0; k < 3; k++) {
      bytes[i * 3 + k] = vazio ? 22 : Math.round(Math.min(1, cor[i * 3 + k] ?? 0) * 255)
    }
  }
  return bytes
}

function png(largura: number, altura: number, rgb: Uint8Array): Buffer {
  const cru = Buffer.alloc((largura * 3 + 1) * altura)
  for (let y = 0; y < altura; y++) {
    cru[y * (largura * 3 + 1)] = 0
    Buffer.from(rgb.buffer, y * largura * 3, largura * 3).copy(cru, y * (largura * 3 + 1) + 1)
  }

  const bloco = (tipo: string, dados: Buffer): Buffer => {
    const comprimento = Buffer.alloc(4)
    comprimento.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corpo) >>> 0)
    return Buffer.concat([comprimento, corpo, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(cru)),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

const TABELA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(dados: Buffer): number {
  let c = 0xffffffff
  for (const b of dados) c = (TABELA[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
  return c ^ 0xffffffff
}

function principal(): void {
  const vistas: [string, number, number][] = [
    ['tres-quartos', -0.6, 0.55],
    ['cima', 0, 1.45],
    ['frente', 0, 0.12],
    ['lado', 1.5708, 0.12],
  ]
  const largura = 460
  const altura = 400
  const folha = new Uint8Array(largura * 2 * altura * 2 * 3)

  for (const [i, [, azimute, elevacao]] of vistas.entries()) {
    const img = retrato(largura, altura, { azimute, elevacao, escala: 1150 })
    const cx = (i % 2) * largura
    const cy = Math.floor(i / 2) * altura
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const de = (y * largura + x) * 3
        const para = ((cy + y) * largura * 2 + cx + x) * 3
        folha[para] = img[de] ?? 0
        folha[para + 1] = img[de + 1] ?? 0
        folha[para + 2] = img[de + 2] ?? 0
      }
    }
  }

  const destino = process.argv[2] ?? 'retrato-drone.png'
  writeFileSync(destino, png(largura * 2, altura * 2, folha))
  process.stdout.write(`${destino}
`)
}

principal()
