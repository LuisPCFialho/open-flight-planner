import { useEffect, useId, useState } from 'react'
import { ehVarios, type ValorComum } from '../nucleo/edicao-lote.ts'

/**
 * Campos de edicao que sabem lidar com "varios valores".
 *
 * A regra vem do Pilot 2 e evita um erro caro: com tres waypoints de alturas
 * diferentes seleccionados, o campo aparece vazio e so escreve quando alguem lhe
 * mexe. Um campo que mostrasse a altura do primeiro nivelava os outros dois sem
 * ninguem pedir.
 *
 * Os incrementos comportam-se de forma diferente: `+10` soma dez a cada
 * waypoint, mantendo as diferencas entre eles, enquanto escrever um valor iguala
 * todos. Sao as duas intencoes possiveis e ambas fazem falta.
 */

type PropsCampoNumerico = {
  rotulo: string
  valor: ValorComum<number>
  unidade?: string
  casas?: number
  min?: number
  max?: number
  passo?: number
  /** Botoes de incremento, por exemplo `[100, 10]` gera +100 +10 -10 -100. */
  incrementos?: readonly number[]
  desactivado?: boolean
  aoAlterar: (valor: number) => void
  aoIncrementar?: (delta: number) => void
}

export function CampoNumerico({
  rotulo,
  valor,
  unidade,
  casas = 0,
  min,
  max,
  passo = 1,
  incrementos,
  desactivado,
  aoAlterar,
  aoIncrementar,
}: PropsCampoNumerico) {
  const id = useId()
  const divergem = ehVarios(valor)
  const numero = divergem || valor === undefined ? null : valor

  // Rascunho local para o campo nao saltar enquanto se escreve.
  const [rascunho, setRascunho] = useState<string>(numero === null ? '' : numero.toFixed(casas))
  useEffect(() => {
    setRascunho(numero === null ? '' : numero.toFixed(casas))
  }, [numero, casas])

  /**
   * Os limites valem para todos os caminhos de entrada, nao so para o texto.
   *
   * Sem isto as setas e os botoes de incremento passavam por cima do minimo:
   * bastava carregar em baixo no campo da velocidade, cujo minimo e 0,5 m/s, ate
   * a por a zero. Dai em diante a duracao estimada saia infinita e a exportacao
   * para o dialeto Pilot 2 rebentava com "numero invalido para WPML".
   */
  const limitar = (lido: number): number =>
    Math.min(max ?? Infinity, Math.max(min ?? -Infinity, lido))

  const confirmar = (texto: string): void => {
    const lido = Number.parseFloat(texto.replace(',', '.'))
    if (!Number.isFinite(lido)) {
      setRascunho(numero === null ? '' : numero.toFixed(casas))
      return
    }
    aoAlterar(limitar(lido))
  }

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
        {divergem ? <span className="campo-divergem">Vários valores</span> : null}
      </label>

      <div className="campo-corpo">
        <input
          id={id}
          className="campo-entrada numerico"
          type="text"
          inputMode="decimal"
          value={rascunho}
          placeholder={divergem ? 'Varios' : '--'}
          disabled={desactivado}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={(e) => confirmar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              confirmar(e.currentTarget.value)
              e.currentTarget.blur()
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * passo * (e.shiftKey ? 10 : 1)
              if (aoIncrementar) aoIncrementar(delta)
              else if (numero !== null) aoAlterar(limitar(numero + delta))
            }
          }}
        />
        {unidade ? <span className="campo-unidade">{unidade}</span> : null}

        {incrementos && incrementos.length > 0 ? (
          <span className="campo-incrementos">
            {[...incrementos, ...[...incrementos].reverse().map((v) => -v)].map((delta) => (
              <button
                key={delta}
                type="button"
                disabled={desactivado}
                title={`${delta > 0 ? '+' : ''}${delta}${unidade ?? ''} a cada um`}
                onClick={() => {
                  if (aoIncrementar) aoIncrementar(delta)
                  else if (numero !== null) aoAlterar(limitar(numero + delta))
                }}
              >
                {delta > 0 ? `+${delta}` : delta}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}

type OpcaoSelecao<T extends string> = { valor: T; rotulo: string; desactivada?: boolean }

type PropsCampoSelecao<T extends string> = {
  rotulo: string
  valor: ValorComum<T>
  opcoes: readonly OpcaoSelecao<T>[]
  desactivado?: boolean
  aoAlterar: (valor: T) => void
}

export function CampoSelecao<T extends string>({
  rotulo,
  valor,
  opcoes,
  desactivado,
  aoAlterar,
}: PropsCampoSelecao<T>) {
  const id = useId()
  const divergem = ehVarios(valor)

  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
        {divergem ? <span className="campo-divergem">Vários valores</span> : null}
      </label>
      <select
        id={id}
        className="campo-entrada"
        value={divergem || valor === undefined ? '' : valor}
        disabled={desactivado}
        onChange={(e) => aoAlterar(e.target.value as T)}
      >
        {divergem || valor === undefined ? <option value="">--</option> : null}
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor} disabled={opcao.desactivada}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}

type PropsDeslizador = {
  rotulo: string
  valor: ValorComum<number>
  min: number
  max: number
  passo?: number
  unidade?: string
  casas?: number
  aoAlterar: (valor: number) => void
}

/** Deslizador com leitura numerica ao lado, como o do gimbal no Pilot 2. */
export function Deslizador({
  rotulo,
  valor,
  min,
  max,
  passo = 1,
  unidade = '',
  casas = 1,
  aoAlterar,
}: PropsDeslizador) {
  const id = useId()
  const divergem = ehVarios(valor)
  const numero = divergem || valor === undefined ? (min + max) / 2 : valor

  return (
    <div className="campo campo-deslizador">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
        <span className={divergem ? 'campo-divergem' : 'campo-leitura numerico'}>
          {divergem ? 'Varios valores' : `${numero.toFixed(casas)}${unidade}`}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={numero}
        onChange={(e) => aoAlterar(Number.parseFloat(e.target.value))}
      />
    </div>
  )
}
