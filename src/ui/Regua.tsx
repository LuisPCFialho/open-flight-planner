import type { LatLon } from '../nucleo/tipos.ts'
import { formatarDistancia, medir } from '../nucleo/medicao.ts'
import { formatarArea } from '../nucleo/areas.ts'

/**
 * As leituras da régua, enquanto se mede.
 *
 * Fica junto à barra do leitor, do mesmo lado: são as duas coisas que aparecem
 * sobre o mapa e que se lêem enquanto se trabalha nele.
 */

type Props = {
  pontos: readonly LatLon[]
  aoDesfazerPonto: () => void
  aoLimpar: () => void
  aoFechar: () => void
}

export function Regua({ pontos, aoDesfazerPonto, aoLimpar, aoFechar }: Props) {
  const medida = medir(pontos)

  return (
    <div className="regua" role="group" aria-label="Régua">
      {pontos.length === 0 ? (
        <span className="regua-ajuda">Clica no mapa para começar a medir.</span>
      ) : (
        <>
          <span className="regua-leitura">
            <span className="regua-rotulo">Total</span>
            <span className="numerico">{formatarDistancia(medida.distancia)}</span>
          </span>
          <span className="regua-leitura">
            <span className="regua-rotulo">Último troço</span>
            <span className="numerico">{formatarDistancia(medida.ultimoTroco)}</span>
          </span>
          <span className="regua-leitura">
            <span className="regua-rotulo">Área</span>
            <span className="numerico">
              {/* Com menos de três pontos não há área, e não é área zero. */}
              {medida.area === null ? '--' : formatarArea(medida.area)}
            </span>
          </span>
        </>
      )}

      <button type="button" disabled={pontos.length === 0} onClick={aoDesfazerPonto}>
        Tirar o último
      </button>
      <button type="button" disabled={pontos.length === 0} onClick={aoLimpar}>
        Limpar
      </button>
      <button type="button" onClick={aoFechar}>
        Fechar
      </button>
    </div>
  )
}
