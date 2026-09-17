import { useState } from 'react'
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
          Com vários waypoints seleccionados só é possível acrescentar ações a todos.
          Selecciona um só para editar a lista.
        </p>
      ) : waypoint.acoes.length === 0 ? (
        <p className="nota">Sem acções neste waypoint.</p>
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
            titulo="Inclinação do gimbal, graus"
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

/**
 * Campo numerico curto, com rascunho proprio.
 *
 * O rascunho nao e enfeite. Sem ele o campo mostrava sempre o valor confirmado,
 * e escrever por cima de um numero era impossivel: seleccionar tudo e carregar
 * em `-` deixava o campo com `-`, que nao e numero nenhum, a alteracao era
 * ignorada e o React repunha o valor antigo - o sinal desaparecia debaixo dos
 * dedos. Num campo de inclinacao de gimbal, que vai de -90 a 45, o negativo e o
 * caso normal.
 *
 * Com rascunho, escreve-se o que se quiser; so se confirma o que for numero, e
 * ao sair do campo o que nao for volta ao ultimo valor bom.
 */
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
  const [rascunho, setRascunho] = useState<string | null>(null)

  const limitar = (lido: number): number => Math.min(max, Math.max(min, lido))

  return (
    <label className="entrada-curta" title={titulo}>
      <input
        className="numerico"
        type="number"
        value={rascunho ?? String(valor)}
        min={min}
        max={max}
        onChange={(e) => {
          const texto = e.target.value
          setRascunho(texto)
          const lido = Number.parseFloat(texto)
          if (Number.isFinite(lido)) aoAlterar(limitar(lido))
        }}
        onBlur={() => setRascunho(null)}
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
