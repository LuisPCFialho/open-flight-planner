import type { Estatisticas } from '../nucleo/estatisticas.ts'
import { formatarDistancia, formatarDuracao } from '../nucleo/estatisticas.ts'

type Props = {
  estatisticas: Estatisticas
}

/**
 * Os quatro numeros que o Pilot 2 mostra no canto superior esquerdo, pela mesma
 * ordem: distancia, duracao, waypoints, fotos.
 */
export function BarraEstatisticas({ estatisticas }: Props) {
  return (
    <div className="estatisticas" role="status" aria-live="polite">
      <Campo
        rotulo="Distancia"
        valor={formatarDistancia(estatisticas.distanciaHorizontal)}
        titulo={`Percurso 3D: ${formatarDistancia(estatisticas.distancia3D)}`}
      />
      <Campo rotulo="Duracao" valor={formatarDuracao(estatisticas.duracao)} />
      <Campo rotulo="Waypoints" valor={String(estatisticas.numeroWaypoints)} />
      <Campo rotulo="Fotos" valor={String(estatisticas.numeroFotos)} />
    </div>
  )
}

function Campo({ rotulo, valor, titulo }: { rotulo: string; valor: string; titulo?: string }) {
  return (
    <div className="estatistica" title={titulo ?? rotulo}>
      <span className="estatistica-rotulo">{rotulo}</span>
      <span className="estatistica-valor numerico">{valor}</span>
    </div>
  )
}
