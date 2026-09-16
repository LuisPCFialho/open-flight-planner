import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Rota } from '../nucleo/tipos.ts'
import { bd } from '../dados/bd.ts'
import { IconeEliminar } from './icones.tsx'

/**
 * Escolha da rota dentro do projeto.
 *
 * Um projeto de obra tem tipicamente varias rotas, uma por campanha ou por zona,
 * e sem isto so a ultima alterada ficava ao alcance.
 *
 * Apagar nao tem desfazer, ao contrario do que se passa dentro de uma rota, por
 * isso pergunta antes, dizendo quantos waypoints leva.
 */

type Props = {
  rota: Rota
  aoAbrir: (rotaId: string) => void
  aoCriar: () => void
  aoDuplicar: () => void
  aoApagar: () => void
  aoRenomear: (nome: string) => void
}

export function SelectorRota({ rota, aoAbrir, aoCriar, aoDuplicar, aoApagar, aoRenomear }: Props) {
  const [aRenomear, setARenomear] = useState(false)

  const rotas = useLiveQuery(
    () => bd.rotas.where('projetoId').equals(rota.projetoId).sortBy('nome'),
    [rota.projetoId],
  )

  if (aRenomear) {
    return (
      <div className="selector-rota">
        <input
          autoFocus
          className="nome-rota"
          defaultValue={rota.nome}
          onBlur={(evento) => {
            const nome = evento.target.value.trim()
            if (nome && nome !== rota.nome) aoRenomear(nome)
            setARenomear(false)
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') evento.currentTarget.blur()
            if (evento.key === 'Escape') setARenomear(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="selector-rota">
      <select
        className="lista-rotas"
        value={rota.id}
        title="Rotas deste projeto"
        onChange={(evento) => aoAbrir(evento.target.value)}
      >
        {(rotas ?? [rota]).map((outra) => (
          <option key={outra.id} value={outra.id}>
            {outra.nome}
            {outra.waypoints.length > 0 ? ` (${outra.waypoints.length})` : ''}
          </option>
        ))}
      </select>

      <button type="button" title="Renomear a rota" onClick={() => setARenomear(true)}>
        Renomear
      </button>
      <button type="button" title="Rota nova neste projeto" onClick={aoCriar}>
        Nova
      </button>
      <button type="button" title="Duplicar esta rota" onClick={aoDuplicar}>
        Duplicar
      </button>
      <button
        type="button"
        title="Apagar esta rota"
        disabled={(rotas?.length ?? 1) < 2}
        onClick={() => {
          const aviso =
            rota.waypoints.length > 0
              ? `Apagar "${rota.nome}" leva ${rota.waypoints.length} waypoint${rota.waypoints.length === 1 ? '' : 's'}. Não há desfazer.`
              : `Apagar "${rota.nome}"?`
          if (window.confirm(aviso)) aoApagar()
        }}
      >
        <IconeEliminar />
      </button>
    </div>
  )
}
