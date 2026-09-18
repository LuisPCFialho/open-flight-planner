import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../nucleo/tipos.ts'
import {
  ELEVACAO_MINIMA_PREDEFINIDA,
  janelaSolar,
  posicaoDoSol,
  type JanelaSolar,
} from '../nucleo/sol.ts'

/**
 * A que horas vale a pena ir.
 *
 * Numa termografia de modulos o criterio a serio e a irradiancia no plano, e
 * essa nao se sabe de vespera. O que se sabe e a altura do sol, que e o que a
 * limita - e e o que decide se se marca a deslocacao para a manha, para a tarde
 * ou para outro dia. Num levantamento fotogrametrico e o mesmo numero que
 * decide o comprimento das sombras entre filas.
 *
 * As horas aparecem na hora local de quem esta a ver, porque e a essa que se
 * marca a deslocacao. As contas correm todas em tempo universal.
 *
 * O que isto nao diz: nuvens, vento, irradiancia. Diz onde esta o sol num ceu
 * limpo. A previsao do dia continua a ser trabalho de quem vai.
 */

type Props = {
  /** O sitio da obra: o ponto de descolagem da rota. */
  local: LatLon
}

/** Data de hoje, no formato que o campo de data usa. */
function hojeComoTexto(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${String(agora.getFullYear())}-${mes}-${dia}`
}

function horaLocal(instante: number): string {
  return new Date(instante).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function duracao(janela: JanelaSolar): string {
  if (janela.inicio === null || janela.fim === null) return '--'
  const minutos = Math.round((janela.fim - janela.inicio) / 60000)
  const horas = Math.floor(minutos / 60)
  return `${String(horas)} h ${String(minutos % 60).padStart(2, '0')}`
}

/** Pontos da curva de elevacao ao longo do dia, de dez em dez minutos. */
function curvaDoDia(local: LatLon, inicioDoDia: number): { x: number; y: number }[] {
  const pontos: { x: number; y: number }[] = []
  for (let m = 0; m <= 1440; m += 10) {
    const instante = inicioDoDia + m * 60000
    pontos.push({ x: m / 1440, y: posicaoDoSol(local.lat, local.lon, instante).elevacao })
  }
  return pontos
}

const ALTURA = 110
const LARGURA = 560

export function PainelSol({ local }: Props) {
  const [dia, setDia] = useState(hojeComoTexto)
  const [minimo, setMinimo] = useState(ELEVACAO_MINIMA_PREDEFINIDA)

  /*
   * O instante actual vive em estado, e nao lido a cada render.
   *
   * Lido no render, o painel mostrava horas diferentes conforme o React
   * decidisse redesenhar - e a marca do "agora" no grafico nunca andava
   * sozinha. De minuto a minuto chega: o sol nao anda mais depressa do que
   * isso, e e a resolucao com que as horas se leem.
   */
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 60000)
    return () => clearInterval(relogio)
  }, [])

  /*
   * O dia escolhido comeca a meia-noite local de quem esta a ver, e nao a meia-
   * noite universal. Em Portugal a diferenca e de uma ou duas horas, e ao fim do
   * dia dava a janela do dia seguinte.
   */
  const inicioDoDia = useMemo(() => {
    const [ano, mes, diaDoMes] = dia.split('-').map(Number)
    if (ano === undefined || mes === undefined || diaDoMes === undefined) return agora
    return new Date(ano, mes - 1, diaDoMes, 0, 0, 0, 0).getTime()
    // `agora` e so o recurso para uma data ilegivel; nao deve refazer isto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia])

  const janela = useMemo(
    () => janelaSolar(local.lat, local.lon, inicioDoDia, minimo),
    [local.lat, local.lon, inicioDoDia, minimo],
  )

  const curva = useMemo(() => curvaDoDia(local, inicioDoDia), [local, inicioDoDia])

  const noDia = agora >= inicioDoDia && agora < inicioDoDia + 86400000
  const sol = posicaoDoSol(local.lat, local.lon, agora)

  // A escala vertical vai de -20 a 90 graus: abaixo disso nao interessa a ninguem.
  const paraY = (graus: number): number =>
    ALTURA - ((Math.max(-20, Math.min(90, graus)) + 20) / 110) * ALTURA

  const caminho = curva
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x * LARGURA).toFixed(1)} ${paraY(p.y).toFixed(1)}`)
    .join(' ')

  return (
    <div className="painel-sol">
      <div className="sol-controlos">
        <label>
          Dia
          <input type="date" value={dia} onChange={(evento) => setDia(evento.target.value)} />
        </label>
        <label title="Altura do sol a partir da qual se considera a janela útil">
          Sol acima de
          <input
            type="number"
            min={0}
            max={89}
            step={5}
            value={minimo}
            onChange={(evento) => setMinimo(Number(evento.target.value) || 0)}
          />
          graus
        </label>

        <dl className="leitura-sol numerico">
          <dt>Janela</dt>
          <dd>
            {janela.inicio !== null && janela.fim !== null
              ? `${horaLocal(janela.inicio)} – ${horaLocal(janela.fim)}`
              : 'não abre'}
          </dd>
          <dt>Duração</dt>
          <dd>{duracao(janela)}</dd>
          <dt title="O ponto mais alto do dia">Meio-dia solar</dt>
          <dd>
            {horaLocal(janela.meioDiaSolar)}, {janela.elevacaoMaxima.toFixed(0)}&deg;
          </dd>
          {noDia ? (
            <>
              <dt>Agora</dt>
              <dd>
                {sol.elevacao.toFixed(0)}&deg; de altura, {sol.azimute.toFixed(0)}&deg; de azimute
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <svg
        className="grafico-sol"
        viewBox={`0 0 ${String(LARGURA)} ${String(ALTURA)}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Altura do sol ao longo do dia"
      >
        {/* A faixa útil, do mínimo pedido para cima. */}
        <rect x={0} y={0} width={LARGURA} height={paraY(minimo)} className="sol-util" />
        {/* O horizonte, que é onde a noite começa. */}
        <line x1={0} x2={LARGURA} y1={paraY(0)} y2={paraY(0)} className="sol-horizonte" />
        <path d={caminho} className="sol-curva" />
        {noDia ? (
          <line
            x1={((agora - inicioDoDia) / 86400000) * LARGURA}
            x2={((agora - inicioDoDia) / 86400000) * LARGURA}
            y1={0}
            y2={ALTURA}
            className="sol-agora"
          />
        ) : null}
      </svg>

      <p className="sol-nota">
        Céu limpo, sem nuvens nem vento: isto diz onde está o sol, não o tempo que vai fazer. O
        mínimo de {minimo}&deg; é uma regra prática e não uma norma - muda-o se souberes melhor.
      </p>
    </div>
  )
}
