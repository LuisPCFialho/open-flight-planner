import type { Accao, Drone, TipoAccao, Waypoint } from '../nucleo/tipos.ts'
import { accaoSuportada, NOME_DA_ACCAO } from '../nucleo/operacoes-accoes.ts'
import { IconeEliminar } from './icones.tsx'

const TIPOS: readonly TipoAccao[] = [
  'tirarFoto',
  'iniciarGravacao',
  'pararGravacao',
  'rodarGimbal',
  'rodarAeronave',
  'pairar',
  'zoom',
]

type Props = {
  drone: Drone
  /** Waypoint unico em edicao, ou `null` quando ha varios seleccionados. */
  waypoint: Waypoint | null
  numeroSeleccionados: number
  aoAcrescentar: (tipo: TipoAccao) => void
  aoAlterar: (indice: number, accao: Accao) => void
  aoRemover: (indice: number) => void
  aoMover: (de: number, para: number) => void
}

export function EditorAccoes({
  drone,
  waypoint,
  numeroSeleccionados,
  aoAcrescentar,
  aoAlterar,
  aoRemover,
  aoMover,
}: Props) {
  return (
    <div className="editor-accoes">
      <div className="accoes-disponiveis">
        {TIPOS.map((tipo) => {
          const suportada = accaoSuportada(drone, tipo)
          return (
            <button
              key={tipo}
              type="button"
              disabled={!suportada || numeroSeleccionados === 0}
              title={
                suportada
                  ? `Acrescentar a ${numeroSeleccionados === 1 ? 'este waypoint' : `${numeroSeleccionados} waypoints`}`
                  : `O ${drone.nome} nao suporta esta accao`
              }
              onClick={() => aoAcrescentar(tipo)}
            >
              {NOME_DA_ACCAO[tipo]}
            </button>
          )
        })}
      </div>

      {waypoint === null ? (
        <p className="nota">
          Com varios waypoints seleccionados so e possivel acrescentar accoes a todos.
          Selecciona um so para editar a lista.
        </p>
      ) : waypoint.acoes.length === 0 ? (
        <p className="nota">Sem accoes neste waypoint.</p>
      ) : (
        <ol className="lista-accoes">
          {waypoint.acoes.map((accao, indice) => (
            <li key={`${accao.tipo}-${indice}`} className="linha-accao">
              <span className="accao-ordem numerico">{indice + 1}</span>
              <span className="accao-nome">{NOME_DA_ACCAO[accao.tipo]}</span>

              <span className="accao-parametros">
                <ParametrosDaAccao accao={accao} aoAlterar={(nova) => aoAlterar(indice, nova)} />
              </span>

              <span className="accao-botoes">
                <button
                  type="button"
                  title="Subir"
                  disabled={indice === 0}
                  onClick={() => aoMover(indice, indice - 1)}
                >
                  <SetaCima />
                </button>
                <button
                  type="button"
                  title="Descer"
                  disabled={indice === waypoint.acoes.length - 1}
                  onClick={() => aoMover(indice, indice + 1)}
                >
                  <SetaBaixo />
                </button>
                <button type="button" title="Remover" onClick={() => aoRemover(indice)}>
                  <IconeEliminar />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ParametrosDaAccao({
  accao,
  aoAlterar,
}: {
  accao: Accao
  aoAlterar: (accao: Accao) => void
}) {
  switch (accao.tipo) {
    case 'rodarGimbal':
      return (
        <>
          <EntradaCurta
            titulo="Inclinacao do gimbal, graus"
            valor={accao.pitch}
            min={-90}
            max={45}
            sufixo="p"
            aoAlterar={(v) => aoAlterar({ ...accao, pitch: v })}
          />
          <EntradaCurta
            titulo="Guinada do gimbal, graus"
            valor={accao.yaw}
            min={-180}
            max={180}
            sufixo="g"
            aoAlterar={(v) => aoAlterar({ ...accao, yaw: v })}
          />
        </>
      )
    case 'rodarAeronave':
      return (
        <EntradaCurta
          titulo="Rumo, graus"
          valor={accao.heading}
          min={-180}
          max={180}
          sufixo="deg"
          aoAlterar={(v) => aoAlterar({ ...accao, heading: v })}
        />
      )
    case 'pairar':
      return (
        <EntradaCurta
          titulo="Segundos"
          valor={accao.segundos}
          min={0}
          max={600}
          sufixo="s"
          aoAlterar={(v) => aoAlterar({ ...accao, segundos: v })}
        />
      )
    case 'zoom':
      return (
        <EntradaCurta
          titulo="Factor de zoom"
          valor={accao.fator}
          min={1}
          max={56}
          sufixo="x"
          aoAlterar={(v) => aoAlterar({ ...accao, fator: v })}
        />
      )
    default:
      return null
  }
}

function EntradaCurta({
  titulo,
  valor,
  min,
  max,
  sufixo,
  aoAlterar,
}: {
  titulo: string
  valor: number
  min: number
  max: number
  sufixo: string
  aoAlterar: (valor: number) => void
}) {
  return (
    <label className="entrada-curta" title={titulo}>
      <input
        className="numerico"
        type="number"
        value={valor}
        min={min}
        max={max}
        onChange={(e) => {
          const lido = Number.parseFloat(e.target.value)
          if (Number.isFinite(lido)) aoAlterar(Math.min(max, Math.max(min, lido)))
        }}
      />
      <span>{sufixo}</span>
    </label>
  )
}

function SetaCima() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
    </svg>
  )
}

function SetaBaixo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
    </svg>
  )
}
