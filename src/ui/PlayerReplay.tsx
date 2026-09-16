import { formatarRelogio, VELOCIDADES_REPLAY } from '../nucleo/replay.ts'
import { IconeInicio, IconePausa, IconeReproduzir } from './icones.tsx'
import type { Replay } from '../estado/useReplay.ts'

/**
 * O leitor que percorre a rota, com a barra de progresso e a velocidade.
 *
 * Os tempos que mostra são os mesmos da barra de estatísticas: o relógio conta
 * as paragens em cada waypoint, e por isso a aeronave detém-se onde vai deter-se
 * de facto.
 */

type Props = {
  replay: Replay
  /** Número do waypoint de onde a aeronave vem, para se saber onde se vai. */
  totalWaypoints: number
}

export function PlayerReplay({ replay, totalWaypoints }: Props) {
  const fraccao = replay.duracao > 0 ? replay.instante / replay.duracao : 0
  const indice = replay.estado ? replay.estado.indice + 1 : 0

  return (
    <div className="player-replay" role="group" aria-label="Leitor do plano de voo">
      <button
        type="button"
        className="player-botao"
        onClick={replay.alternar}
        title={replay.aCorrer ? 'Pausa' : 'Reproduzir'}
        aria-label={replay.aCorrer ? 'Pausa' : 'Reproduzir'}
      >
        {replay.aCorrer ? <IconePausa /> : <IconeReproduzir />}
      </button>

      <button
        type="button"
        className="player-botao"
        onClick={() => replay.irPara(0)}
        title="Voltar ao início"
        aria-label="Voltar ao início"
      >
        <IconeInicio />
      </button>

      <span className="numerico player-relogio">
        {formatarRelogio(replay.instante)} / {formatarRelogio(replay.duracao)}
      </span>

      <input
        type="range"
        className="player-barra"
        min={0}
        max={1}
        step={0.0005}
        value={fraccao}
        onChange={(evento) => replay.irPara(Number(evento.target.value) * replay.duracao)}
        aria-label="Posição no voo"
      />

      <span className="numerico player-waypoint" title="Waypoint de onde a aeronave vem">
        {indice}/{totalWaypoints}
      </span>

      <div className="alternador player-velocidades">
        {VELOCIDADES_REPLAY.map((v) => (
          <button
            key={v}
            type="button"
            className={replay.velocidade === v ? 'activo' : ''}
            onClick={() => replay.mudarVelocidade(v)}
            title={`${v}× a velocidade real`}
          >
            {v}&times;
          </button>
        ))}
      </div>

      <button type="button" className="player-botao" onClick={replay.fechar} title="Fechar o leitor">
        Fechar
      </button>
    </div>
  )
}
