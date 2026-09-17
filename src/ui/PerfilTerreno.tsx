import { useMemo, useState } from 'react'
import type { Perfil } from '../nucleo/perfil.ts'
import { AGL_MAXIMO } from '../nucleo/validacoes.ts'

/**
 * Corte do terreno ao longo da rota, com a linha de voo por cima.
 *
 * Desenhado em SVG proprio: o que e preciso sao dois tracados, umas faixas de
 * cor e uma regua, e qualquer biblioteca de graficos traria muito mais do que
 * isso sem resolver a unica parte dificil, que e as duas escalas verticais.
 *
 * Ha duas leituras sobrepostas, com escalas independentes: as cotas, em metros
 * acima do nivel do mar, e a altura acima do solo, que e a diferenca entre as
 * duas linhas e e o que decide se a rota voa.
 */

type Props = {
  perfil: Perfil
  /** Altura minima acima do solo desta rota. */
  aglMinimo: number
  aCarregar: boolean
  erro: string | null
  /** Waypoint em destaque, para o marcar no corte. */
  seleccionados: ReadonlySet<number>
  /**
   * Onde vai a aeronave do leitor, para se ver ao mesmo tempo onde ela esta e
   * onde vai o terreno debaixo dela. `null` com o leitor fechado.
   */
  aeronave: { percurso: number; aslVoo: number } | null
  aoSeleccionarWaypoint: (indice: number) => void
  aoNivelar: (alturaAcimaDoSolo: number) => void
  podeNivelar: boolean
}

const LARGURA = 1000
const ALTURA = 200
const MARGEM = { topo: 12, base: 22, esquerda: 52, direita: 12 }

export function PerfilTerreno({
  perfil,
  aglMinimo,
  aCarregar,
  erro,
  seleccionados,
  aeronave,
  aoSeleccionarWaypoint,
  aoNivelar,
  podeNivelar,
}: Props) {
  const [alturaNivelar, setAlturaNivelar] = useState(60)

  const escala = useMemo(() => construirEscala(perfil), [perfil])

  if (erro) {
    return (
      <div className="perfil vazio-perfil">
        <span className="erro">{erro}</span>
      </div>
    )
  }

  if (perfil.amostras.length === 0) {
    return (
      <div className="perfil vazio-perfil">
        {aCarregar ? 'A obter o perfil do terreno...' : 'Acrescenta pelo menos dois waypoints.'}
      </div>
    )
  }

  const { x, y } = escala
  const areaTerreno = `M ${x(0)} ${y(escala.cotaMin)} ${perfil.amostras
    .map((a) => `L ${x(a.percurso)} ${y(a.cotaTerreno)}`)
    .join(' ')} L ${x(perfil.percursoTotal)} ${y(escala.cotaMin)} Z`

  const linhaVoo = perfil.amostras
    .map((a, i) => `${i === 0 ? 'M' : 'L'} ${x(a.percurso)} ${y(a.aslVoo)}`)
    .join(' ')

  return (
    <div className="perfil">
      <header className="perfil-cabecalho">
        <h2>Perfil de terreno</h2>

        <span className="perfil-leitura numerico">
          Acima do solo: {perfil.aglMinimo.toFixed(0)} a {perfil.aglMaximo.toFixed(0)} m
        </span>

        <span className="perfil-nivelar">
          <label>
            Nivelar a
            <input
              type="number"
              className="numerico"
              value={alturaNivelar}
              min={1}
              max={AGL_MAXIMO}
              onChange={(e) => {
                const lido = Number.parseFloat(e.target.value)
                if (Number.isFinite(lido)) setAlturaNivelar(lido)
              }}
            />
            m
          </label>
          <button
            type="button"
            disabled={!podeNivelar}
            title="Recalcula a altura de cada waypoint para ficar a esta altura constante acima do terreno"
            onClick={() => aoNivelar(alturaNivelar)}
          >
            Nivelar acima do solo
          </button>
        </span>
      </header>

      <svg
        className="perfil-grafico"
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Perfil do terreno ao longo de ${perfil.percursoTotal.toFixed(0)} metros`}
      >
        {/* Faixas de altura do solo fora do intervalo seguro, medidas a partir do terreno. */}
        {perfil.amostras.map((a, i) => {
          const proxima = perfil.amostras[i + 1]
          if (!proxima) return null
          const fora = a.acimaDoSolo < aglMinimo || a.acimaDoSolo > AGL_MAXIMO
          if (!fora) return null
          return (
            <rect
              key={a.percurso}
              x={x(a.percurso)}
              y={MARGEM.topo}
              width={Math.max(1, x(proxima.percurso) - x(a.percurso))}
              height={ALTURA - MARGEM.topo - MARGEM.base}
              className="perfil-zona-alerta"
            />
          )
        })}

        <path d={areaTerreno} className="perfil-terreno" />

        {/* Tecto regulamentar, medido acima do terreno em cada ponto. */}
        <path
          d={perfil.amostras
            .map((a, i) => `${i === 0 ? 'M' : 'L'} ${x(a.percurso)} ${y(a.cotaTerreno + AGL_MAXIMO)}`)
            .join(' ')}
          className="perfil-tecto"
        />
        <path
          d={perfil.amostras
            .map((a, i) => `${i === 0 ? 'M' : 'L'} ${x(a.percurso)} ${y(a.cotaTerreno + aglMinimo)}`)
            .join(' ')}
          className="perfil-piso"
        />

        <path d={linhaVoo} className="perfil-voo" />

        {perfil.waypoints.map((marca) => (
          <g
            key={marca.indice}
            className={`perfil-waypoint ${seleccionados.has(marca.indice) ? 'seleccionado' : ''} ${
              marca.acimaDoSolo < aglMinimo || marca.acimaDoSolo > AGL_MAXIMO ? 'alerta' : ''
            }`}
            onClick={() => aoSeleccionarWaypoint(marca.indice)}
          >
            <line
              x1={x(marca.percurso)}
              y1={y(marca.aslVoo)}
              x2={x(marca.percurso)}
              y2={y(marca.cotaTerreno)}
            />
            <circle cx={x(marca.percurso)} cy={y(marca.aslVoo)} r={3.5} />
            {/* Alvo de clique generoso, invisivel. */}
            <rect
              x={x(marca.percurso) - 6}
              y={MARGEM.topo}
              width={12}
              height={ALTURA - MARGEM.topo - MARGEM.base}
              fill="transparent"
            />
          </g>
        ))}

        {escala.marcasCota.map((cota) => (
          <g key={cota} className="perfil-regua">
            <line x1={MARGEM.esquerda} y1={y(cota)} x2={LARGURA - MARGEM.direita} y2={y(cota)} />
            <text x={MARGEM.esquerda - 6} y={y(cota) + 3} textAnchor="end">
              {cota.toFixed(0)}
            </text>
          </g>
        ))}

        {escala.marcasPercurso.map((metros) => (
          <text
            key={metros}
            className="perfil-eixo"
            x={x(metros)}
            y={ALTURA - 6}
            textAnchor="middle"
          >
            {metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${metros.toFixed(0)} m`}
          </text>
        ))}
        {/*
          * A aeronave do leitor, por cima de tudo o resto.
          *
          * A linha vai de alto a baixo porque o que interessa ler nao e so a
          * altura: e que troco do corte esta a ser percorrido naquele momento.
          */}
        {aeronave ? (
          <g className="perfil-aeronave">
            <line
              x1={x(aeronave.percurso)}
              y1={MARGEM.topo}
              x2={x(aeronave.percurso)}
              y2={ALTURA - MARGEM.base}
            />
            <circle cx={x(aeronave.percurso)} cy={y(aeronave.aslVoo)} r={4.5} />
          </g>
        ) : null}

      </svg>

      <footer className="perfil-legenda">
        <span className="legenda-voo">Linha de voo</span>
        <span className="legenda-terreno">Terreno</span>
        <span className="legenda-tecto">{AGL_MAXIMO} m acima do solo</span>
        <span className="legenda-piso">{aglMinimo} m acima do solo</span>
        {aCarregar ? <span className="legenda-carregar">a actualizar...</span> : null}
      </footer>
    </div>
  )
}

type Escala = {
  x: (percurso: number) => number
  y: (cota: number) => number
  cotaMin: number
  marcasCota: number[]
  marcasPercurso: number[]
}

function construirEscala(perfil: Perfil): Escala {
  const tectos = perfil.amostras.map((a) => a.cotaTerreno + AGL_MAXIMO)
  const cotaMaxima = Math.max(perfil.cotaMaxima, ...(tectos.length > 0 ? tectos : [0]))
  const folga = Math.max(10, (cotaMaxima - perfil.cotaMinima) * 0.08)
  const cotaMin = perfil.cotaMinima - folga
  const cotaMax = cotaMaxima + folga
  const amplitude = Math.max(1, cotaMax - cotaMin)
  const total = Math.max(1, perfil.percursoTotal)

  const util = {
    largura: LARGURA - MARGEM.esquerda - MARGEM.direita,
    altura: ALTURA - MARGEM.topo - MARGEM.base,
  }

  return {
    x: (percurso) => MARGEM.esquerda + (percurso / total) * util.largura,
    y: (cota) => MARGEM.topo + (1 - (cota - cotaMin) / amplitude) * util.altura,
    cotaMin,
    marcasCota: marcasRedondas(cotaMin, cotaMax, 4),
    marcasPercurso: marcasRedondas(0, total, 6),
  }
}

/** Marcas em valores redondos, para a regua nao ficar com numeros arbitrarios. */
function marcasRedondas(minimo: number, maximo: number, quantas: number): number[] {
  const amplitude = maximo - minimo
  if (amplitude <= 0) return [minimo]

  const bruto = amplitude / quantas
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? potencia * 10

  const marcas: number[] = []
  for (let v = Math.ceil(minimo / passo) * passo; v <= maximo; v += passo) marcas.push(v)
  return marcas
}
