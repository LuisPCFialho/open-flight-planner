import { describe, it, expect } from 'vitest'
import { criarCanalCursor } from './LeituraCursor.tsx'

const PONTO = { lat: 40.7465, lon: -8.4106, cotaTerreno: 356 }

describe('canal do cursor', () => {
  it('comeca vazio', () => {
    expect(criarCanalCursor().ler()).toBeNull()
  })

  it('quem escreve avisa quem esta a ouvir', () => {
    const canal = criarCanalCursor()
    let avisos = 0
    canal.subscrever(() => avisos++)

    canal.escrever(PONTO)
    expect(avisos).toBe(1)
    expect(canal.ler()).toEqual(PONTO)
  })

  it('avisa todos os que estao a ouvir', () => {
    const canal = criarCanalCursor()
    let a = 0
    let b = 0
    canal.subscrever(() => a++)
    canal.subscrever(() => b++)

    canal.escrever(PONTO)
    expect([a, b]).toEqual([1, 1])
  })

  it('cancelar a subscricao deixa mesmo de avisar', () => {
    // Um ouvinte que nao se solta e uma fuga: o canal vive o tempo da aplicacao
    // e o componente pode montar e desmontar muitas vezes.
    const canal = criarCanalCursor()
    let avisos = 0
    const largar = canal.subscrever(() => avisos++)

    canal.escrever(PONTO)
    largar()
    canal.escrever(null)

    expect(avisos).toBe(1)
    expect(canal.ler()).toBeNull()
  })

  it('cancelar duas vezes nao rebenta', () => {
    const canal = criarCanalCursor()
    const largar = canal.subscrever(() => {})
    largar()
    expect(() => largar()).not.toThrow()
  })

  it('sair do mapa apaga a leitura', () => {
    const canal = criarCanalCursor()
    canal.escrever(PONTO)
    canal.escrever(null)
    expect(canal.ler()).toBeNull()
  })
})
