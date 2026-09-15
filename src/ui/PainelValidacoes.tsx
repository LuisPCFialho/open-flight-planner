import type { Validacao } from '../nucleo/validacoes.ts'

type Props = {
  validacoes: readonly Validacao[]
  aoSeleccionarWaypoints: (indices: readonly number[]) => void
}

/**
 * Lista das validacoes, erros primeiro.
 *
 * Cada linha leva para os waypoints em causa, porque encontrar o waypoint 47 de
 * uma rota de oitenta a percorrer a lista nao e trabalho de ninguem.
 */
export function PainelValidacoes({ validacoes, aoSeleccionarWaypoints }: Props) {
  if (validacoes.length === 0) {
    return (
      <div className="validacoes">
        <p className="validacao-limpa">Sem problemas. A rota pode ser exportada.</p>
      </div>
    )
  }

  const ordenadas = [...validacoes].sort((a, b) =>
    a.severidade === b.severidade ? 0 : a.severidade === 'erro' ? -1 : 1,
  )

  return (
    <div className="validacoes">
      <ul>
        {ordenadas.map((validacao) => (
          <li key={validacao.id} className={`validacao ${validacao.severidade}`}>
            <span className="validacao-marca" aria-hidden="true">
              {validacao.severidade === 'erro' ? <MarcaErro /> : <MarcaAviso />}
            </span>

            <span className="validacao-texto">
              <strong>{validacao.titulo}</strong>
              <span>{validacao.detalhe}</span>
            </span>

            {validacao.waypoints && validacao.waypoints.length > 0 ? (
              <button
                type="button"
                title="Seleccionar os waypoints em causa"
                onClick={() => aoSeleccionarWaypoints(validacao.waypoints ?? [])}
              >
                Ver {validacao.waypoints.length}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MarcaErro() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.6v4.2M8 11.2v.2" />
    </svg>
  )
}

function MarcaAviso() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.8 15 13.8H1z" />
      <path d="M8 6.2v3.4M8 11.8v.2" />
    </svg>
  )
}
