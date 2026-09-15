import { describe, it, expect } from 'vitest'
import {
  historicoInicial,
  registar,
  substituir,
  desfazer,
  refazer,
  podeDesfazer,
  podeRefazer,
} from './historico.ts'

describe('historico', () => {
  it('desfaz e refaz pela ordem certa', () => {
    let h = historicoInicial('a')
    h = registar(h, 'b')
    h = registar(h, 'c')

    expect(h.presente).toBe('c')
    h = desfazer(h)
    expect(h.presente).toBe('b')
    h = desfazer(h)
    expect(h.presente).toBe('a')
    expect(podeDesfazer(h)).toBe(false)

    h = refazer(h)
    expect(h.presente).toBe('b')
    h = refazer(h)
    expect(h.presente).toBe('c')
    expect(podeRefazer(h)).toBe(false)
  })

  it('nao faz nada quando nao ha para onde ir', () => {
    const h = historicoInicial('a')
    expect(desfazer(h)).toBe(h)
    expect(refazer(h)).toBe(h)
  })

  it('apaga o futuro ao abrir um ramo novo', () => {
    let h = historicoInicial('a')
    h = registar(h, 'b')
    h = desfazer(h)
    expect(podeRefazer(h)).toBe(true)

    h = registar(h, 'c')
    expect(podeRefazer(h)).toBe(false)
    expect(h.presente).toBe('c')
    expect(desfazer(h).presente).toBe('a')
  })

  it('ignora um registo do mesmo objecto', () => {
    const estado = { valor: 1 }
    let h = historicoInicial(estado)
    h = registar(h, estado)
    expect(podeDesfazer(h)).toBe(false)
  })

  it('substitui o presente sem criar um passo, para o arrastar continuo', () => {
    let h = historicoInicial('a')
    h = registar(h, 'b')
    const passos = h.passado.length

    h = substituir(h, 'b-arrastado')
    expect(h.presente).toBe('b-arrastado')
    expect(h.passado.length).toBe(passos)
    expect(desfazer(h).presente).toBe('a')
  })

  it('limita a profundidade e mantem o mais recente', () => {
    let h = historicoInicial(0)
    for (let i = 1; i <= 150; i++) h = registar(h, i)

    expect(h.presente).toBe(150)
    expect(h.passado.length).toBeLessThanOrEqual(100)
    expect(h.passado[0]).toBe(50)
  })

  it('nunca altera o historico recebido', () => {
    const h = registar(historicoInicial('a'), 'b')
    const copia = structuredClone(h)
    registar(h, 'c')
    desfazer(h)
    refazer(desfazer(h))
    expect(h).toEqual(copia)
  })
})
