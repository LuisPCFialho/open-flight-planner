import type { DescodificadorPNG, ImagemRGBA } from './fonte.ts'

/**
 * Descodificador de PNG para o browser.
 *
 * Usa `createImageBitmap` e um `OffscreenCanvas`, que fazem o trabalho no
 * motor nativo. Depende de os mosaicos virem com CORS aberto, o que e o caso
 * do bucket `elevation-tiles-prod`, que responde `Access-Control-Allow-Origin: *`.
 */
export const descodificarPNGBrowser: DescodificadorPNG = async (
  dados: ArrayBuffer,
): Promise<ImagemRGBA> => {
  const bitmap = await createImageBitmap(new Blob([dados], { type: 'image/png' }))
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const contexto = canvas.getContext('2d', { willReadFrequently: true })
    if (!contexto) throw new Error('não foi possível abrir um contexto 2d para o mosaico')

    contexto.drawImage(bitmap, 0, 0)
    const imagem = contexto.getImageData(0, 0, bitmap.width, bitmap.height)
    return { largura: imagem.width, altura: imagem.height, pixels: imagem.data }
  } finally {
    bitmap.close()
  }
}
