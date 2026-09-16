import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { folgaDeFecho, importarAreas, pareceFechada } from './ficheiro.ts'
import { areaDoContorno, formatarArea } from '../nucleo/areas.ts'
import { deslocar } from '../nucleo/geodesia.ts'

/**
 * Leitura do ficheiro que traz a area a filmar.
 *
 * Nao e um ficheiro de rota: e o que sai do Google Earth, de um SIG ou de um
 * topografo. Pode vir como KML solto ou como KMZ, que e um zip com o KML la
 * dentro, em caminho que ninguem garante ser sempre o mesmo.
 */

const KML_PARCELA = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Sever do Vouga</name>
  <Placemark><name>Implantacao</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    -8.4110,40.7460,0
    -8.4098,40.7460,0
    -8.4098,40.7469,0
    -8.4110,40.7469,0
    -8.4110,40.7460,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`

function ficheiroKML(nome: string, texto: string): File {
  return new File([texto], nome, { type: 'application/vnd.google-earth.kml+xml' })
}

async function ficheiroKMZ(nome: string, caminhoInterno: string, texto: string): Promise<File> {
  const zip = new JSZip()
  zip.file(caminhoInterno, texto)
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return new File([bytes], nome, { type: 'application/vnd.google-earth.kmz' })
}

describe('importar areas de referencia', () => {
  it('le um KML solto', async () => {
    const { areas, nome } = await importarAreas(ficheiroKML('parcela.kml', KML_PARCELA))

    expect(nome).toBe('Sever do Vouga')
    expect(areas).toHaveLength(1)
    expect(areas[0]?.nome).toBe('Implantacao')
    expect(areas[0]?.contorno).toHaveLength(4)
  })

  it('le um KMZ com o KML em doc.kml', async () => {
    const { areas } = await importarAreas(
      await ficheiroKMZ('parcela.kmz', 'doc.kml', KML_PARCELA),
    )
    expect(areas[0]?.nome).toBe('Implantacao')
  })

  it('le um KMZ com o KML noutro caminho qualquer', async () => {
    // O caminho dentro do zip varia com a ferramenta que exportou.
    const { areas } = await importarAreas(
      await ficheiroKMZ('parcela.kmz', 'files/limites/parcela.kml', KML_PARCELA),
    )
    expect(areas[0]?.contorno).toHaveLength(4)
  })

  it('da identificadores proprios a cada area', async () => {
    const primeira = await importarAreas(ficheiroKML('a.kml', KML_PARCELA))
    const segunda = await importarAreas(ficheiroKML('a.kml', KML_PARCELA))
    expect(primeira.areas[0]?.id).not.toBe(segunda.areas[0]?.id)
  })

  it('a area lida bate certo com o terreno que representa', async () => {
    const { areas } = await importarAreas(ficheiroKML('parcela.kml', KML_PARCELA))
    const contorno = areas[0]?.contorno ?? []

    // 0,0012 graus de longitude a 40,7 de latitude sao cerca de 101 m, e 0,0009
    // de latitude cerca de 100 m: pouco mais de um hectare.
    const metrosQuadrados = areaDoContorno(contorno)
    expect(metrosQuadrados).toBeGreaterThan(9000)
    expect(metrosQuadrados).toBeLessThan(12000)
    expect(formatarArea(metrosQuadrados)).toMatch(/ha$/)
  })

  it('diz o que se passa quando o ficheiro nao tem poligonos', async () => {
    const soPontos = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Marco</name><Point><coordinates>-8.41,40.75</coordinates></Point></Placemark>
    </Document></kml>`

    await expect(importarAreas(ficheiroKML('marcos.kml', soPontos))).rejects.toThrow(
      /nao traz nenhum poligono/,
    )
  })

  it('avisa das linhas abertas que ficaram de fora', async () => {
    const misturado = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Acesso</name><LineString><coordinates>
        -8.41,40.75 -8.40,40.75
      </coordinates></LineString></Placemark>
      <Placemark><name>Parcela</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
        -8.41,40.75 -8.40,40.75 -8.40,40.76
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`

    const { areas, avisos } = await importarAreas(ficheiroKML('misto.kml', misturado))
    expect(areas).toHaveLength(1)
    expect(avisos.join(' ')).toMatch(/linha/)
  })

  it('recusa um KMZ sem nenhum KML dentro', async () => {
    const zip = new JSZip()
    zip.file('leia-me.txt', 'nada de util')
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const ficheiro = new File([bytes], 'vazio.kmz')

    await expect(importarAreas(ficheiro)).rejects.toThrow(/nao tem nenhum \.kml/)
  })
})

describe('limites desenhados como polilinha', () => {
  /** Quadrado de cerca de 100 m, com o ultimo ponto a fechar sobre o primeiro. */
  const LINHA_FECHADA = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>Limite CAD</name><LineString><coordinates>
      -8.4110,40.7460 -8.4098,40.7460 -8.4098,40.7469 -8.4110,40.7469 -8.4110,40.7460
    </coordinates></LineString></Placemark>
  </Document></kml>`

  it('le uma polilinha fechada como contorno', async () => {
    // Muito desenho de limites sai de CAD como polilinha e nao como area.
    const { areas, avisos } = await importarAreas(ficheiroKML('cad.kml', LINHA_FECHADA))

    expect(areas).toHaveLength(1)
    expect(areas[0]?.nome).toBe('Limite CAD')
    expect(areas[0]?.contorno).toHaveLength(4)
    expect(avisos.join(' ')).toMatch(/linha/)
  })

  it('a area lida da polilinha bate certo', async () => {
    const { areas } = await importarAreas(ficheiroKML('cad.kml', LINHA_FECHADA))
    expect(areaDoContorno(areas[0]?.contorno ?? [])).toBeGreaterThan(9000)
  })

  it('nao aceita uma linha que fica aberta', async () => {
    const aberta = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Acesso</name><LineString><coordinates>
        -8.4110,40.7460 -8.4098,40.7460 -8.4098,40.7469 -8.4080,40.7480
      </coordinates></LineString></Placemark>
    </Document></kml>`

    /*
     * A mensagem diz de que linha se trata e quantos metros faltam: quem
     * desenhou vai corrigir o desenho, e "o ficheiro nao traz poligonos" nao o
     * levava la - alem de nem ser verdade, porque a linha esta la.
     */
    await expect(importarAreas(ficheiroKML('acesso.kml', aberta))).rejects.toThrow(
      /"Acesso" como linha aberta: faltam \d+ m/,
    )
  })

  it('um ficheiro so com marcadores diz que nao traz contorno nenhum', async () => {
    const soPontos = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Entrada</name><Point><coordinates>-8.41,40.74</coordinates></Point></Placemark>
    </Document></kml>`
    await expect(importarAreas(ficheiroKML('pontos.kml', soPontos))).rejects.toThrow(
      /nem linha fechada/,
    )
  })

  it('havendo poligonos, as linhas nao entram', async () => {
    const ambos = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Caminho</name><LineString><coordinates>
        -8.4110,40.7460 -8.4098,40.7460 -8.4098,40.7469 -8.4110,40.7469 -8.4110,40.7460
      </coordinates></LineString></Placemark>
      <Placemark><name>Parcela</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
        -8.4140,40.7430 -8.4130,40.7430 -8.4130,40.7440
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`

    const { areas } = await importarAreas(ficheiroKML('ambos.kml', ambos))
    expect(areas).toHaveLength(1)
    expect(areas[0]?.nome).toBe('Parcela')
  })
})

describe('tolerancia de fecho', () => {
  /** Anel de `lados` pontos e `raio` metros, com o fim a `folga` metros do inicio. */
  function anelQuaseFechado(lados: number, raio: number, folga: number) {
    const centro = { lat: 40.745, lon: -8.42 }
    const pontos: { lat: number; lon: number }[] = []
    for (let i = 0; i < lados; i++) {
      pontos.push(deslocar(centro, (i / lados) * 360, raio))
    }
    // Fecha-se com um ponto a `folga` metros do primeiro.
    const primeiro = pontos[0]
    if (!primeiro) throw new Error('anel vazio')
    pontos.push(folga === 0 ? primeiro : deslocar(primeiro, 90, folga))
    return pontos
  }

  it('um contorno que fecha exactamente e aceite', () => {
    expect(folgaDeFecho(anelQuaseFechado(40, 600, 0))).toBe(0)
  })

  it('aceita o perimetro real de Sever do Vouga, que fechava a olho', () => {
    /*
     * O caso que revelou o defeito: 3808 m de volta e 6,25 m de folga, ou seja
     * 0,16% do percurso. Com o limite fixo de um metro era recusado, e com uma
     * mensagem a dizer que o ficheiro nao tinha poligonos nenhuns.
     */
    const anel = anelQuaseFechado(410, 606, 6.25)
    const folga = folgaDeFecho(anel)
    expect(folga).not.toBeNull()
    expect(folga ?? 0).toBeCloseTo(6.25, 0)
  })

  it('uma linha aberta de verdade continua a ser recusada', () => {
    // Metade do raio de folga num anel pequeno: isto nao e um contorno.
    expect(folgaDeFecho(anelQuaseFechado(8, 40, 120))).toBeNull()
  })

  it('a tolerancia acompanha o tamanho do contorno', () => {
    // Dez metros de folga sao muito num talhao pequeno e nada num perimetro grande.
    expect(folgaDeFecho(anelQuaseFechado(12, 25, 10))).toBeNull()
    expect(folgaDeFecho(anelQuaseFechado(200, 600, 10))).not.toBeNull()
  })

  it('ha sempre uma folga absoluta, para os contornos pequenos', () => {
    // Num quadrado de 10 m de lado, dois por cento seriam oito centimetros.
    expect(folgaDeFecho(anelQuaseFechado(4, 7, 3))).not.toBeNull()
  })

  it('menos de quatro pontos nao e contorno nenhum', () => {
    expect(folgaDeFecho([{ lat: 40, lon: -8 }, { lat: 40.001, lon: -8 }])).toBeNull()
  })

  it('pareceFechada concorda com folgaDeFecho', () => {
    const bom = anelQuaseFechado(40, 600, 5)
    const mau = anelQuaseFechado(8, 40, 120)
    expect(pareceFechada(bom)).toBe(true)
    expect(pareceFechada(mau)).toBe(false)
  })
})
