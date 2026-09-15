import { inflateSync } from 'node:zlib'
import type { DescodificadorPNG, ImagemRGBA } from './fonte.ts'

/**
 * Descodificador de PNG para Node, usado apenas nos testes.
 *
 * Cobre o subconjunto que os mosaicos Terrarium usam: 8 bits por canal, sem
 * entrelacamento, tipo de cor 2 (RGB) ou 6 (RGBA). Nao pretende ser um leitor
 * de PNG completo.
 */

const ASSINATURA_PNG = [137, 80, 78, 71, 13, 10, 26, 10]

type Cabecalho = { largura: number; altura: number; bits: number; tipoCor: number; entrelacado: number }

export const descodificarPNGNode: DescodificadorPNG = async (
  dados: ArrayBuffer,
): Promise<ImagemRGBA> => {
  const buffer = Buffer.from(dados)
  verificarAssinatura(buffer)

  const { cabecalho, comprimido } = lerBlocos(buffer)
  const canais = canaisDe(cabecalho)
  const bruto = inflateSync(Buffer.concat(comprimido))
  const desfiltrado = desfiltrar(bruto, cabecalho.largura, cabecalho.altura, canais)

  return {
    largura: cabecalho.largura,
    altura: cabecalho.altura,
    pixels: paraRGBA(desfiltrado, cabecalho.largura, cabecalho.altura, canais),
  }
}

function verificarAssinatura(buffer: Buffer): void {
  for (const [i, byte] of ASSINATURA_PNG.entries()) {
    if (buffer[i] !== byte) throw new Error('nao e um ficheiro PNG')
  }
}

function lerBlocos(buffer: Buffer): { cabecalho: Cabecalho; comprimido: Buffer[] } {
  let posicao = ASSINATURA_PNG.length
  let cabecalho: Cabecalho | null = null
  const comprimido: Buffer[] = []

  while (posicao + 8 <= buffer.length) {
    const comprimento = buffer.readUInt32BE(posicao)
    const tipo = buffer.toString('ascii', posicao + 4, posicao + 8)
    const dados = buffer.subarray(posicao + 8, posicao + 8 + comprimento)

    if (tipo === 'IHDR') {
      cabecalho = {
        largura: dados.readUInt32BE(0),
        altura: dados.readUInt32BE(4),
        bits: dados[8] ?? 0,
        tipoCor: dados[9] ?? 0,
        entrelacado: dados[12] ?? 0,
      }
    } else if (tipo === 'IDAT') {
      comprimido.push(Buffer.from(dados))
    } else if (tipo === 'IEND') {
      break
    }
    posicao += 12 + comprimento
  }

  if (!cabecalho) throw new Error('PNG sem bloco IHDR')
  if (cabecalho.bits !== 8) throw new Error(`profundidade ${cabecalho.bits} bits nao suportada`)
  if (cabecalho.entrelacado !== 0) throw new Error('PNG entrelacado nao suportado')
  return { cabecalho, comprimido }
}

function canaisDe(cabecalho: Cabecalho): number {
  if (cabecalho.tipoCor === 2) return 3
  if (cabecalho.tipoCor === 6) return 4
  throw new Error(`tipo de cor ${cabecalho.tipoCor} nao suportado`)
}

/** Reverte os filtros por linha definidos na norma PNG. */
function desfiltrar(bruto: Buffer, largura: number, altura: number, canais: number): Buffer {
  const passo = largura * canais
  const saida = Buffer.alloc(altura * passo)
  let posicao = 0

  for (let y = 0; y < altura; y++) {
    const filtro = bruto[posicao++] ?? 0
    const linha = bruto.subarray(posicao, posicao + passo)
    posicao += passo

    for (let i = 0; i < passo; i++) {
      const esquerda = i >= canais ? (saida[y * passo + i - canais] ?? 0) : 0
      const cima = y > 0 ? (saida[(y - 1) * passo + i] ?? 0) : 0
      const diagonal = y > 0 && i >= canais ? (saida[(y - 1) * passo + i - canais] ?? 0) : 0
      const valor = linha[i] ?? 0

      let reposto: number
      switch (filtro) {
        case 0:
          reposto = valor
          break
        case 1:
          reposto = valor + esquerda
          break
        case 2:
          reposto = valor + cima
          break
        case 3:
          reposto = valor + ((esquerda + cima) >> 1)
          break
        case 4:
          reposto = valor + paeth(esquerda, cima, diagonal)
          break
        default:
          throw new Error(`filtro PNG ${filtro} desconhecido`)
      }
      saida[y * passo + i] = reposto & 0xff
    }
  }
  return saida
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function paraRGBA(
  desfiltrado: Buffer,
  largura: number,
  altura: number,
  canais: number,
): Uint8ClampedArray {
  if (canais === 4) return new Uint8ClampedArray(desfiltrado)

  const pixels = new Uint8ClampedArray(largura * altura * 4)
  for (let i = 0, j = 0; i < largura * altura; i++, j += 4) {
    pixels[j] = desfiltrado[i * 3] ?? 0
    pixels[j + 1] = desfiltrado[i * 3 + 1] ?? 0
    pixels[j + 2] = desfiltrado[i * 3 + 2] ?? 0
    pixels[j + 3] = 255
  }
  return pixels
}
