import { describe, it, expect } from 'vitest'
import { janelaSolar, posicaoDoSol } from './sol.ts'

/**
 * A posicao do sol.
 *
 * Verifica-se contra fisica conhecida e nao contra numeros copiados de lado
 * nenhum: ao meio-dia solar do equinocio a elevacao e noventa menos a latitude,
 * e nos solsticios afasta-se dela pela inclinacao do eixo da Terra, 23,44 graus
 * para cada lado. Se as contas estiverem trocadas, e aqui que se ve.
 *
 * A obra de Sever do Vouga serve de sitio, por ser onde os ficheiros reais
 * deste projecto foram voados.
 */

const OBRA = { lat: 40.7379, lon: -8.4093 }
const INCLINACAO_DO_EIXO = 23.44

/** Elevacao maxima do dia, que acontece ao meio-dia solar. */
function elevacaoAoMeioDia(dia: string): number {
  const { elevacaoMaxima } = janelaSolar(OBRA.lat, OBRA.lon, Date.parse(dia), 0)
  return elevacaoMaxima
}

describe('posicao do sol', () => {
  it('no equinocio o sol culmina a noventa graus menos a latitude', () => {
    expect(elevacaoAoMeioDia('2026-03-20T12:00:00Z')).toBeCloseTo(90 - OBRA.lat, 0)
  })

  it('no solsticio de verao sobe a inclinacao do eixo acima disso', () => {
    expect(elevacaoAoMeioDia('2026-06-21T12:00:00Z')).toBeCloseTo(
      90 - OBRA.lat + INCLINACAO_DO_EIXO,
      0,
    )
  })

  it('no solsticio de inverno desce outro tanto abaixo', () => {
    expect(elevacaoAoMeioDia('2026-12-21T12:00:00Z')).toBeCloseTo(
      90 - OBRA.lat - INCLINACAO_DO_EIXO,
      0,
    )
  })

  it('ao meio-dia solar o sol esta a sul, visto do hemisferio norte', () => {
    const { meioDiaSolar } = janelaSolar(OBRA.lat, OBRA.lon, Date.parse('2026-06-21T12:00:00Z'), 0)
    expect(posicaoDoSol(OBRA.lat, OBRA.lon, meioDiaSolar).azimute).toBeCloseTo(180, 0)
  })

  it('de madrugada esta abaixo do horizonte', () => {
    expect(posicaoDoSol(OBRA.lat, OBRA.lon, Date.parse('2026-06-21T02:00:00Z')).elevacao).toBeLessThan(0)
  })

  /*
   * O sol nasce a nascente e poe-se a poente, e no equinocio faz as duas coisas
   * quase exactamente a leste e a oeste. Sem isto, uma troca de sinal no angulo
   * horario passava despercebida: a elevacao sairia certa e o azimute espelhado.
   */
  it('no equinocio nasce a leste e poe-se a oeste', () => {
    const dia = Date.parse('2026-03-20T12:00:00Z')
    const { inicio, fim } = janelaSolar(OBRA.lat, OBRA.lon, dia, 0)
    expect(inicio).not.toBeNull()
    expect(fim).not.toBeNull()

    expect(posicaoDoSol(OBRA.lat, OBRA.lon, inicio as number).azimute).toBeCloseTo(90, -1)
    expect(posicaoDoSol(OBRA.lat, OBRA.lon, fim as number).azimute).toBeCloseTo(270, -1)
  })

  it('de manha esta a nascente e de tarde a poente', () => {
    const { meioDiaSolar } = janelaSolar(OBRA.lat, OBRA.lon, Date.parse('2026-06-21T12:00:00Z'), 0)
    const manha = posicaoDoSol(OBRA.lat, OBRA.lon, meioDiaSolar - 3 * 3600000).azimute
    const tarde = posicaoDoSol(OBRA.lat, OBRA.lon, meioDiaSolar + 3 * 3600000).azimute

    expect(manha).toBeLessThan(180)
    expect(tarde).toBeGreaterThan(180)
  })

  it('no equador, no equinocio, passa quase pelo zenite', () => {
    const { elevacaoMaxima } = janelaSolar(0, 0, Date.parse('2026-03-20T12:00:00Z'), 0)
    expect(elevacaoMaxima).toBeGreaterThan(89)
  })
})

describe('janela solar', () => {
  it('no verao, acima de trinta graus, da varias horas', () => {
    const { inicio, fim } = janelaSolar(OBRA.lat, OBRA.lon, Date.parse('2026-06-21T12:00:00Z'), 30)
    expect(inicio).not.toBeNull()
    expect(fim).not.toBeNull()

    const horas = ((fim as number) - (inicio as number)) / 3600000
    expect(horas).toBeGreaterThan(7)
    expect(horas).toBeLessThan(11)
  })

  /*
   * Em Dezembro o sol nao chega aos trinta graus em Sever do Vouga: culmina nos
   * vinte e seis. Nao ha janela, e dize-lo e a parte util - e a diferenca entre
   * ir e nao ir.
   */
  it('no inverno, acima de trinta graus, nao ha janela nenhuma', () => {
    const { inicio, fim } = janelaSolar(OBRA.lat, OBRA.lon, Date.parse('2026-12-21T12:00:00Z'), 30)
    expect(inicio).toBeNull()
    expect(fim).toBeNull()
  })

  it('a janela fecha-se a medida que o minimo sobe', () => {
    const dia = Date.parse('2026-06-21T12:00:00Z')
    const larga = janelaSolar(OBRA.lat, OBRA.lon, dia, 20)
    const estreita = janelaSolar(OBRA.lat, OBRA.lon, dia, 50)

    expect((estreita.fim as number) - (estreita.inicio as number)).toBeLessThan(
      (larga.fim as number) - (larga.inicio as number),
    )
  })

  it('o meio-dia solar cai dentro da janela', () => {
    const janela = janelaSolar(OBRA.lat, OBRA.lon, Date.parse('2026-06-21T12:00:00Z'), 30)
    expect(janela.meioDiaSolar).toBeGreaterThanOrEqual(janela.inicio as number)
    expect(janela.meioDiaSolar).toBeLessThanOrEqual(janela.fim as number)
  })

  /*
   * A oeste do meridiano de Greenwich o meio-dia solar e depois do meio-dia
   * universal: quatro minutos por grau. Sever do Vouga esta a 8,4 graus oeste,
   * portanto uns 34 minutos mais tarde, mais a equacao do tempo.
   */
  it('o meio-dia solar acompanha a longitude', () => {
    const dia = Date.parse('2026-06-21T12:00:00Z')
    const aqui = janelaSolar(OBRA.lat, OBRA.lon, dia, 0).meioDiaSolar
    const emGreenwich = janelaSolar(OBRA.lat, 0, dia, 0).meioDiaSolar

    // A tolerancia e o passo da amostragem: o maximo cai sempre num minuto certo.
    const minutos = (aqui - emGreenwich) / 60000
    expect(Math.abs(minutos - 4 * Math.abs(OBRA.lon))).toBeLessThanOrEqual(1)
  })
})
