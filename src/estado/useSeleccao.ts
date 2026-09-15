import { useCallback, useMemo, useRef, useState } from 'react'
import type { Rota, Waypoint } from '../nucleo/tipos.ts'

/**
 * Seleccao de waypoints, com ctrl para juntar e shift para intervalo.
 *
 * A ancora do intervalo e o ultimo waypoint escolhido sem shift, como em
 * qualquer lista. Guarda-se num ref porque muda a par da seleccao mas nao deve,
 * por si so, provocar um render.
 */
export type Seleccao = {
  ids: ReadonlySet<string>
  waypoints: Waypoint[]
  seleccionar: (id: string, juntar: boolean, intervalo?: boolean) => void
  substituir: (ids: readonly string[]) => void
  limpar: () => void
  /** Move a seleccao ao longo da lista, para as setas do teclado. */
  mover: (delta: number) => void
}

export function useSeleccao(rota: Rota | null): Seleccao {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set())
  const ancora = useRef<string | null>(null)

  const waypoints = useMemo(
    () => rota?.waypoints.filter((w) => ids.has(w.id)) ?? [],
    [rota, ids],
  )

  const seleccionar = useCallback(
    (id: string, juntar: boolean, intervalo = false) => {
      setIds((anteriores) => {
        if (intervalo && ancora.current && rota) {
          const ordem = rota.waypoints.map((w) => w.id)
          const de = ordem.indexOf(ancora.current)
          const para = ordem.indexOf(id)
          if (de >= 0 && para >= 0) {
            const [inicio, fim] = de <= para ? [de, para] : [para, de]
            return new Set(ordem.slice(inicio, fim + 1))
          }
        }

        ancora.current = id
        if (!juntar) return new Set([id])

        const novos = new Set(anteriores)
        if (novos.has(id)) novos.delete(id)
        else novos.add(id)
        return novos
      })
    },
    [rota],
  )

  const mover = useCallback(
    (delta: number) => {
      if (!rota || rota.waypoints.length === 0) return
      const ordem = rota.waypoints.map((w) => w.id)
      const actual = ancora.current ? ordem.indexOf(ancora.current) : -1
      const alvo = ordem[Math.max(0, Math.min(ordem.length - 1, actual + delta))]
      if (!alvo) return
      ancora.current = alvo
      setIds(new Set([alvo]))
    },
    [rota],
  )

  return {
    ids,
    waypoints,
    seleccionar,
    substituir: useCallback((novos: readonly string[]) => {
      ancora.current = novos.at(-1) ?? null
      setIds(new Set(novos))
    }, []),
    limpar: useCallback(() => {
      ancora.current = null
      setIds(new Set())
    }, []),
    mover,
  }
}
