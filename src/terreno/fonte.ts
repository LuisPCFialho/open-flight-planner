import type { LatLon } from '../nucleo/tipos.ts'

/** De onde veio a cota de um ponto. Tem de ficar visivel na interface. */
export type OrigemCota = 'terrarium' | 'dxf'

export type CotaAmostrada = {
  /** Metros acima do nivel medio do mar, ortometrica. */
  metros: number
  origem: OrigemCota
}

/**
 * Fonte de cotas do terreno.
 *
 * Existem duas implementacoes previstas: os mosaicos Terrarium da AWS, globais e
 * com resolucao de dezenas de metros, e o DXF de levantamento topografico, com
 * precisao de obra mas cobertura limitada. A interface existe para se poder
 * trocar a fonte sem mexer em quem a consome.
 */
export interface FonteTerreno {
  /** Cota ortometrica em metros no ponto dado. */
  cota(lat: number, lon: number): Promise<number>

  /**
   * Cotas ao longo de um percurso, amostrado de `passo` em `passo` metros.
   * Os pontos correspondentes obtem-se com `amostrarPercurso` da geodesia,
   * com os mesmos argumentos.
   */
  perfil(pontos: readonly LatLon[], passo: number): Promise<number[]>

  /** Se esta fonte tem dados para o ponto. */
  cobre(lat: number, lon: number): boolean

  /** Identificador da origem, para mostrar na interface qual a fonte em uso. */
  readonly origem: OrigemCota
}

/**
 * Descodifica um PNG para pixels RGBA.
 *
 * Injectado porque o browser usa `createImageBitmap` com um canvas e os testes
 * correm em Node, onde se descodifica com `zlib`. O codigo de amostragem que
 * interessa validar e o mesmo nos dois sitios.
 */
export type DescodificadorPNG = (dados: ArrayBuffer) => Promise<ImagemRGBA>

export type ImagemRGBA = {
  largura: number
  altura: number
  /** RGBA, quatro bytes por pixel. */
  pixels: Uint8ClampedArray
}
