import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { importarAreas } from './ficheiro.ts'
import { areaDoContorno, formatarArea } from '../nucleo/areas.ts'

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
