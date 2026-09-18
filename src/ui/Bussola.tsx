import type { Vento } from '../nucleo/tipos.ts'
import { useValorDoCanal, type Canal } from './canal.ts'
import { quadrante, temVento } from '../nucleo/vento.ts'

/**
 * Bússola que acompanha a orientação do mapa. Clicar nela roda para norte.
 *
 * A rosa está desenhada em planta e inclina-se com o mapa: a 60 graus de
 * inclinação o círculo achata-se numa elipse, que é o que dá a leitura de estar
 * a olhar de lado e não a pique. Sem isso, rodar e inclinar dariam a mesma
 * imagem e a bússola não diria metade do que há para saber.
 *
 * A orientação chega por um canal e não por propriedade: muda a cada fotograma
 * enquanto se arrasta o mapa, e em estado da aplicação punha a árvore inteira a
 * renderizar 60 vezes por segundo. Ver `canal.ts`.
 */

export type Orientacao = {
  /** Rumo do mapa em graus. Zero é norte em cima. */
  rumo: number
  /** Inclinação da vista em graus. Zero é a pique. */
  inclinacao: number
}

type Props = {
  canal: Canal<Orientacao>
  aoApontarANorte: () => void
  /**
   * O vento apontado na rota, se houver.
   *
   * Vai na bussola e nao num canto proprio porque o que faz falta saber e como
   * ele se poe em relacao ao que esta no ecra - se a rota corre a favor, contra,
   * ou de travez. Desenhado dentro do mesmo grupo que roda com o mapa, isso sai
   * de graca e nunca fica dessincronizado.
   */
  vento?: Vento | undefined
}

/** Achatamento da rosa, do círculo em planta à elipse quando se inclina. */
function achatamento(inclinacao: number): number {
  return Math.max(0.18, Math.cos((inclinacao * Math.PI) / 180))
}

export function Bussola({ canal, aoApontarANorte, vento }: Props) {
  const { rumo, inclinacao } = useValorDoCanal(canal)
  const aNorte = Math.abs(((rumo + 180) % 360) - 180) < 0.5
  const haVento = temVento(vento)

  const legendaDoVento = haVento
    ? `. Vento ${vento.velocidade.toFixed(1)} m/s de ${quadrante(vento.rumo)}`
    : ''

  return (
    <button
      type="button"
      className="bussola"
      onClick={aoApontarANorte}
      disabled={aNorte && inclinacao < 0.5}
      title={`Rumo ${Math.round(rumo)}°, inclinação ${Math.round(inclinacao)}° — clica para apontar a norte${legendaDoVento}`}
      aria-label={`Apontar a norte. Rumo actual ${Math.round(rumo)} graus${legendaDoVento}`}
    >
      <svg width="58" height="58" viewBox="-29 -29 58 58" aria-hidden="true" focusable="false">
        {/* A rosa inteira roda com o mapa e achata-se com a inclinação. */}
        <g transform={`scale(1 ${achatamento(inclinacao).toFixed(3)}) rotate(${-rumo})`}>
          <circle r="24" className="bussola-anel" />
          <circle r="16" className="bussola-anel-interno" />

          {/* Ponteiro: a metade que aponta a norte é a que se lê. */}
          <path d="M0 -22 L7 4 L0 0 Z" className="bussola-norte" />
          <path d="M0 22 L-7 -4 L0 0 Z" className="bussola-sul" />
          <path d="M0 -22 L-7 4 L0 0 Z" className="bussola-norte-sombra" />
          <path d="M0 22 L7 -4 L0 0 Z" className="bussola-sul-sombra" />

          {/*
            * O vento, a apontar para o centro: e de la que ele vem.
            *
            * Desenhado a seguir ao ponteiro e dentro do mesmo grupo, roda e
            * achata-se com o mapa como tudo o resto - o que quer dizer que a
            * relacao entre o vento e a rota que esta no ecra esta sempre certa,
            * sem nada a sincronizar.
            */}
          {haVento ? (
            <g transform={`rotate(${vento.rumo})`} className="bussola-vento">
              <line x1="0" y1="-27" x2="0" y2="-17" />
              <path d="M0 -15 L-3.5 -21 L3.5 -21 Z" />
            </g>
          ) : null}
        </g>

        {/*
          * As letras ficam fora do grupo achatado: inclinadas passariam a
          * ilegíveis, e o que faz falta é saber de que lado fica o norte, não
          * ver o texto deitar-se.
          */}
        <g className="bussola-letras">
          {(
            [
              ['N', 0],
              ['E', 90],
              ['S', 180],
              ['O', 270],
            ] as const
          ).map(([letra, angulo]) => {
            const radianos = ((angulo - rumo) * Math.PI) / 180
            const x = Math.sin(radianos) * 26
            const y = -Math.cos(radianos) * 26 * achatamento(inclinacao)
            return (
              <text
                key={letra}
                x={x.toFixed(2)}
                y={(y + 3).toFixed(2)}
                className={letra === 'N' ? 'bussola-letra-norte' : undefined}
              >
                {letra}
              </text>
            )
          })}
        </g>
      </svg>
    </button>
  )
}
