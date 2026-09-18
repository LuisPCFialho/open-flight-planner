import { useRef, useState } from 'react'
import type { Drone, Rota } from '../nucleo/tipos.ts'
import { exportarKMZ, importarFicheiro, nomeDoFicheiro } from '../kmz/ficheiro.ts'
import { accoesPorConfirmar } from '../kmz/dialeto-fly.ts'
import type { RotaImportada } from '../kmz/importar.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'
import { IconeDescarregar, IconeCarregar } from './icones.tsx'

type Props = {
  rota: Rota
  drone: Drone
  cotas: ReadonlyMap<string, number>
  chave: (ponto: { lat: number; lon: number }) => string
  fonteTerreno: FonteTerreno
  /** Razao para nao deixar exportar, ou `null` se estiver tudo bem. */
  bloqueio: string | null
  aoImportar: (importada: RotaImportada) => void
}

export function BarraFicheiro({
  rota,
  drone,
  cotas,
  chave,
  fonteTerreno,
  bloqueio,
  aoImportar,
}: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<{ tipo: 'erro' | 'nota'; texto: string } | null>(null)

  const exportar = async (): Promise<void> => {
    try {
      await exportarKMZ(rota, drone, { cotas, chave })
      const porConfirmar = drone.dialeto === 'fly' ? accoesPorConfirmar(rota) : []
      setEstado({
        tipo: porConfirmar.length > 0 ? 'erro' : 'nota',
        texto:
          porConfirmar.length > 0
            ? `${nomeDoFicheiro(rota)} gravado, mas usa accoes por confirmar neste dialeto: ${porConfirmar.join(', ')}`
            : `${nomeDoFicheiro(rota)} gravado no dialeto ${drone.dialeto}`,
      })
    } catch (causa: unknown) {
      setEstado({
        tipo: 'erro',
        texto: causa instanceof Error ? causa.message : 'falha a exportar a rota',
      })
    }
  }

  const importar = async (ficheiro: File): Promise<void> => {
    try {
      const importada = await importarFicheiro(ficheiro, {
        projetoId: rota.projetoId,
        fonteTerreno,
      })
      aoImportar(importada)
      setEstado({
        tipo: importada.avisos.length > 0 ? 'erro' : 'nota',
        texto:
          importada.avisos.length > 0
            ? `${ficheiro.name}: ${importada.avisos.join('; ')}`
            : `${ficheiro.name} lido no dialeto ${importada.dialeto}, ${importada.rota.waypoints.length} waypoints`,
      })
    } catch (causa: unknown) {
      setEstado({
        tipo: 'erro',
        texto: causa instanceof Error ? causa.message : 'falha a ler o ficheiro',
      })
    }
  }

  return (
    <>
      <div className="grupo-ficheiro">
        <button
          type="button"
          className={bloqueio ? 'principal bloqueado' : 'principal'}
          title={bloqueio ?? `Exportar KMZ no dialeto ${drone.dialeto}`}
          disabled={rota.waypoints.length === 0 || bloqueio !== null}
          onClick={() => void exportar()}
        >
          <IconeDescarregar />
          Exportar
        </button>

        <button type="button" title="Importar KMZ" onClick={() => entrada.current?.click()}>
          <IconeCarregar />
          Importar
        </button>

        <input
          ref={entrada}
          type="file"
          accept=".kmz,.zip"
          hidden
          onChange={(evento) => {
            const ficheiro = evento.target.files?.[0]
            if (ficheiro) void importar(ficheiro)
            evento.target.value = ''
          }}
        />
      </div>

      {estado ? (
        <div className={`aviso-ficheiro ${estado.tipo}`} role="status">
          {estado.texto}
          <button type="button" onClick={() => setEstado(null)} title="Dispensar">
            Fechar
          </button>
        </div>
      ) : null}
    </>
  )
}
