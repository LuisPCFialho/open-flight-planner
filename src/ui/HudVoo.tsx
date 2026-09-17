import type { EstadoVoo } from '../estado/useVooVirtual.ts'
import type { ModoAltitude } from '../nucleo/tipos.ts'
import { PASSO_VELOCIDADE, VELOCIDADE_MAXIMA, VELOCIDADE_MINIMA } from '../nucleo/voo.ts'

/**
 * Leituras do voo virtual, com a mesma informacao que o HUD do Pilot 2:
 * altura no modo da rota, cota absoluta, altura acima do solo, rumo e gimbal.
 */

type Props = {
  estado: EstadoVoo
  modoAltitude: ModoAltitude
  alturaASL: number
  cotaTerreno: number | null
  /** Metros por segundo a que a aeronave anda no voo virtual. */
  velocidade: number
  aoAlterarVelocidade: (nova: number) => void
  aoGravar: () => void
  aoParar: () => void
}

export function HudVoo({
  estado,
  modoAltitude,
  alturaASL,
  cotaTerreno,
  velocidade,
  aoAlterarVelocidade,
  aoGravar,
  aoParar,
}: Props) {
  const acimaDoSolo = cotaTerreno === null ? null : alturaASL - cotaTerreno

  return (
    <div className="hud-voo">
      <div className="hud-bloco">
        <span className="hud-rotulo">Longitude</span>
        <span className="hud-valor numerico">{estado.posicao.lon.toFixed(7)}</span>
        <span className="hud-rotulo">Latitude</span>
        <span className="hud-valor numerico">{estado.posicao.lat.toFixed(7)}</span>
      </div>

      <div className="hud-bloco hud-teclas" aria-hidden="true">
        <span className="tecla">Q</span>
        <span className="tecla">W</span>
        <span className="tecla">E</span>
        <span className="tecla">A</span>
        <span className="tecla">S</span>
        <span className="tecla">D</span>
      </div>

      <div className="hud-bloco hud-atitude">
        <span className="hud-rotulo">Rumo</span>
        <span className="hud-valor grande numerico">{estado.guinada.toFixed(0)}&deg;</span>
        <span className="hud-rotulo">Gimbal</span>
        <span className="hud-valor numerico" title="Inclinação do gimbal">
          {estado.gimbalPitch.toFixed(1)}&deg;
        </span>
        <span className="hud-valor numerico" title="Rotação do gimbal em relação ao nariz">
          {estado.gimbalYaw >= 0 ? '+' : ''}
          {estado.gimbalYaw.toFixed(1)}&deg; gim
        </span>
      </div>

      <div className="hud-bloco hud-altura">
        <span className="hud-valor enorme numerico">{estado.altura.toFixed(0)}</span>
        <span className="hud-rotulo">{modoAltitude} m</span>
        <span className="hud-valor numerico" title="Cota absoluta">
          {alturaASL.toFixed(0)} ASL
        </span>
        <span className="hud-valor numerico" title="Altura acima do solo">
          {acimaDoSolo === null ? '-- AGL' : `${acimaDoSolo.toFixed(0)} AGL`}
        </span>
      </div>

      <div className="hud-bloco hud-verticais" aria-hidden="true">
        <span className="tecla">C</span>
        <span className="tecla">Z</span>
      </div>

      {/* Velocidade a que se anda a reconhecer, nao a velocidade da rota. */}
      <div className="hud-bloco hud-velocidade">
        <span className="hud-rotulo">Deslocação</span>
        <span className="hud-valor numerico">{velocidade.toFixed(0)} m/s</span>
        <input
          type="range"
          min={VELOCIDADE_MINIMA}
          max={VELOCIDADE_MAXIMA}
          step={PASSO_VELOCIDADE}
          value={velocidade}
          title="Velocidade do voo virtual. Também se muda com as teclas + e -"
          onChange={(evento) => aoAlterarVelocidade(Number.parseFloat(evento.target.value))}
        />
      </div>

      <div className="hud-bloco hud-accoes">
        <button type="button" onClick={aoGravar} title="Shift e espaço">
          Gravar waypoint
        </button>
        <span className="hud-ajuda">
          Setas apontam o gimbal e R recentra-o. Arrastar na vista da câmara aponta
          directamente. Mais e menos mudam a velocidade, Alt abranda tudo para o
          ajuste fino. Shift+Space grava, Shift+F junta foto, Esc sai.
        </span>
        <button type="button" onClick={aoParar}>
          Sair do voo
        </button>
      </div>
    </div>
  )
}
