import { describe, it, expect } from 'vitest'
import { lerXML, filho, textoEm } from './parse-xml.ts'

/**
 * O leitor serve dois mundos: o WPML da DJI, que e sempre igual a si proprio, e
 * o KML que vem de fora, do Google Earth ou de um topografo, onde ha CDATA,
 * comentarios e atributos com sinais de maior dentro.
 */

describe('CDATA', () => {
  it('le o conteudo tal e qual, incluindo o sinal de maior', () => {
    const lido = lerXML('<Document><name><![CDATA[A > B]]></name></Document>')
    expect(textoEm(lido, 'name')).toBe('A > B')
  })

  it('nao desescapa entidades dentro de CDATA', () => {
    const lido = lerXML('<Document><name><![CDATA[&amp; fica assim]]></name></Document>')
    expect(textoEm(lido, 'name')).toBe('&amp; fica assim')
  })

  it('le uma descricao com HTML dentro, como o Google Earth escreve', () => {
    const lido = lerXML(
      '<Document><Placemark><description><![CDATA[<b>Vertice 12</b><br/>cota 314,2]]></description></Placemark></Document>',
    )
    expect(textoEm(filho(lido, 'Placemark'), 'description')).toBe(
      '<b>Vertice 12</b><br/>cota 314,2',
    )
  })

  it('recusa um CDATA sem fecho em vez de ler lixo', () => {
    expect(() => lerXML('<Document><name><![CDATA[sem fim</name></Document>')).toThrow(/CDATA/)
  })
})

describe('comentarios', () => {
  it('salta um comentario que tenha etiquetas la dentro', () => {
    const lido = lerXML('<Document><!-- ver <a href="x">aqui</a> --><name>obra</name></Document>')
    expect(textoEm(lido, 'name')).toBe('obra')
  })

  it('salta um comentario que tenha um sinal de maior solto', () => {
    const lido = lerXML('<Document><!-- 3 > 2 --><name>obra</name></Document>')
    expect(textoEm(lido, 'name')).toBe('obra')
  })
})

describe('atributos', () => {
  it('nao corta a etiqueta num sinal de maior dentro de aspas', () => {
    const lido = lerXML('<Document id="a>b"><name>obra</name></Document>')
    expect(lido.atributos['id']).toBe('a>b')
    expect(textoEm(lido, 'name')).toBe('obra')
  })

  it('aceita aspas simples com o mesmo cuidado', () => {
    const lido = lerXML("<Document id='a>b'><name>obra</name></Document>")
    expect(lido.atributos['id']).toBe('a>b')
  })
})

describe('entidades', () => {
  it('desescapa as cinco entidades nomeadas e as numericas', () => {
    const lido = lerXML('<Document><name>a &amp; b &lt; c &#65; &#x42;</name></Document>')
    expect(textoEm(lido, 'name')).toBe('a & b < c A B')
  })

  it('deixa como esta uma entidade numerica fora da gama Unicode', () => {
    // `String.fromCodePoint` atirava um RangeError cru e levava o ficheiro todo.
    const lido = lerXML('<Document><name>&#xFFFFFFFF;</name></Document>')
    expect(textoEm(lido, 'name')).toBe('&#xFFFFFFFF;')
  })
})
