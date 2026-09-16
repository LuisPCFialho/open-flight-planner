import { describe, it, expect } from 'vitest'
import { nomeSeguro } from './descarregar.ts'

/**
 * O nome do ficheiro e a unica parte disto que se pode verificar sem browser, e
 * e a parte que estava errada em dois dos tres sitios que exportavam.
 */

describe('nome de ficheiro seguro', () => {
  it('um nome simples passa em minusculas e com tracos', () => {
    expect(nomeSeguro('Rota de ensaio', 'kmz')).toBe('rota-de-ensaio.kmz')
  })

  it('os acentos simplificam-se em vez de desaparecerem', () => {
    /*
     * Este e o defeito. Sem a normalizacao NFD, o `\w` - que em JavaScript so
     * conhece ASCII - apagava a letra acentuada inteira: "Rota da Ínsua" dava
     * `rota-da--nsua`. Num projecto portugues quase todos os nomes tem acentos.
     */
    expect(nomeSeguro('Rota da Ínsua', 'kmz')).toBe('rota-da-insua.kmz')
    expect(nomeSeguro('Sever do Vouga - São João', 'kml')).toBe('sever-do-vouga---sao-joao.kml')
    expect(nomeSeguro('Cobertura à noite', 'json')).toBe('cobertura-a-noite.json')
  })

  it('a cedilha e o til tambem', () => {
    expect(nomeSeguro('Inspeção', 'kmz')).toBe('inspecao.kmz')
  })

  it('os caracteres que nao servem num nome de ficheiro somem', () => {
    expect(nomeSeguro('rota/2026: "final"?', 'kmz')).toBe('rota2026-final.kmz')
  })

  it('os espacos das pontas nao deixam tracos soltos', () => {
    expect(nomeSeguro('  rota  ', 'kmz')).toBe('rota.kmz')
  })

  it('espacos seguidos dao um traco so', () => {
    expect(nomeSeguro('rota    nova', 'kmz')).toBe('rota-nova.kmz')
  })

  it('um nome que nao sobrevive ao tratamento cai na alternativa', () => {
    // Uma rota so com pontuacao ficaria com um ficheiro chamado `.kmz`.
    expect(nomeSeguro('***', 'kmz', 'rota')).toBe('rota.kmz')
    expect(nomeSeguro('', 'json', 'projeto')).toBe('projeto.json')
  })

  it('sem alternativa dada usa-se ficheiro', () => {
    expect(nomeSeguro('', 'kmz')).toBe('ficheiro.kmz')
  })

  it('os numeros e os tracos ficam', () => {
    expect(nomeSeguro('P2025087001 - voo 2', 'kmz')).toBe('p2025087001---voo-2.kmz')
  })
})
