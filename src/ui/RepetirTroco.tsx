import { useState } from 'react'
import type { Waypoint } from '../nucleo/tipos.ts'
import { rumoPerpendicular } from '../nucleo/repeticao.ts'
import { CampoNumerico } from './campos.tsx'

/**
 * Repetir o troço escolhido, que é como se cobre uma central.
 *
 * As filas de mesas são paralelas e iguais: marcada a primeira passagem, as
 * seguintes são a mesma deslocada. O afastamento pré-preenchido é o espaçamento
 * entre filas que se acabou de medir, e o rumo sai perpendicular ao troço, que é
 * a direção de "a fila seguinte".
 */

type Props = {
  seleccionados: readonly Waypoint[]
  aoRepetirDeslocado: (opcoes: { afastamento: number; rumoGraus: number; quantas: number }) => void
  aoRepetirEmSentidoContrario: () => void
}

export function RepetirTroco({
  seleccionados,
  aoRepetirDeslocado,
  aoRepetirEmSentidoContrario,
}: Props) {
  const [afastamento, setAfastamento] = useState(25)
  const [quantas, setQuantas] = useState(1)
  const [rumoGraus, setRumoGraus] = useState<number | null>(null)

  if (seleccionados.length < 2) return null

  // Enquanto ninguém tocar no rumo, ele acompanha o troço escolhido.
  const direccao = rumoGraus ?? rumoPerpendicular(seleccionados)

  return (
    <section className="grupo">
      <h3>Repetir estes {seleccionados.length} pontos</h3>

      <CampoNumerico
        rotulo="Afastamento entre cópias"
        valor={afastamento}
        unidade=" m"
        casas={1}
        min={0.5}
        max={2000}
        incrementos={[10, 1]}
        aoAlterar={setAfastamento}
      />
      <CampoNumerico
        rotulo="Rumo da cópia"
        valor={direccao}
        unidade="°"
        casas={1}
        min={0}
        max={360}
        incrementos={[90, 5]}
        aoAlterar={setRumoGraus}
      />
      <CampoNumerico
        rotulo="Quantas cópias"
        valor={quantas}
        min={1}
        max={60}
        incrementos={[10, 1]}
        aoAlterar={(v) => setQuantas(Math.round(v))}
      />

      <div className="botoes-repetir">
        <button
          type="button"
          onClick={() => aoRepetirDeslocado({ afastamento, rumoGraus: direccao, quantas })}
          title="Acrescenta no fim da rota tantas cópias deste troço, cada uma mais afastada do que a anterior"
        >
          Repetir deslocado
        </button>
        <button
          type="button"
          onClick={aoRepetirEmSentidoContrario}
          title="Acrescenta no fim da rota o mesmo troço percorrido ao contrário"
        >
          Voltar para trás
        </button>
      </div>

      <p className="nota">
        As cópias vão para o fim da rota, e não intercaladas: a ordem dos waypoints é a
        ordem de voo, e intercalar faria a aeronave saltar de fila para fila a cada ponto.
      </p>
    </section>
  )
}
