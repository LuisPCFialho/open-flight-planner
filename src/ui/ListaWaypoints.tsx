import type { Rota, Waypoint } from '../nucleo/tipos.ts'
import { IconeCentrar, IconeEliminar, IconeFoto, IconeGimbal } from './icones.tsx'

export type LinhaWaypoint = {
  waypoint: Waypoint
  /** Cota do terreno na vertical do ponto, se ja foi resolvida. */
  cotaTerreno: number | null
  /** Altura acima do solo, se ja foi possivel calcula-la. */
  acimaDoSolo: number | null
  alerta: boolean
  /** De onde veio a cota: levantamento topografico ou mosaicos publicos. */
  origemCota: 'dxf' | 'terrarium' | null
}

type Props = {
  rota: Rota
  linhas: readonly LinhaWaypoint[]
  seleccionados: ReadonlySet<string>
  aoSeleccionar: (id: string, juntar: boolean, intervalo: boolean) => void
  aoCentrar: (id: string) => void
  aoEliminar: (id: string) => void
}

export function ListaWaypoints({
  rota,
  linhas,
  seleccionados,
  aoSeleccionar,
  aoCentrar,
  aoEliminar,
}: Props) {
  return (
    <div className="painel painel-esquerdo">
      <header className="painel-cabecalho">
        <h2>Lista de trajetórias</h2>
        <span className="etiqueta-modo">{rota.modoAltitude}</span>
      </header>

      {linhas.length === 0 ? (
        <p className="vazio">
          Liga "Criar waypoints" na barra de cima e clica no mapa.
          <br />
          Alt e clique num troço insere um ponto intermédio.
        </p>
      ) : (
        <ol className="lista-waypoints">
          {linhas.map(({ waypoint, acimaDoSolo, alerta, origemCota }) => (
            <li
              key={waypoint.id}
              className={[
                'linha-waypoint',
                seleccionados.has(waypoint.id) ? 'seleccionado' : '',
                alerta ? 'alerta' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="linha-principal"
                onClick={(evento) =>
                  aoSeleccionar(waypoint.id, evento.ctrlKey || evento.metaKey, evento.shiftKey)
                }
              >
                <span className="numero numerico">{waypoint.index + 1}</span>
                <span className="altura numerico">{waypoint.altura.toFixed(0)} m</span>
                <span className="agl numerico" title="Altura acima do solo">
                  {acimaDoSolo === null ? '--' : `${acimaDoSolo.toFixed(0)} agl`}
                </span>
                {origemCota ? (
                  <span
                    className={`origem-cota ${origemCota}`}
                    title={
                      origemCota === 'dxf'
                        ? 'Cota do levantamento topografico'
                        : 'Cota dos mosaicos públicos, com dezenas de metros de resolução'
                    }
                  >
                    {origemCota === 'dxf' ? 'topo' : 'srtm'}
                  </span>
                ) : null}
              </button>

              <span className="accoes-rapidas">
                {waypoint.acoes.some((a) => a.tipo === 'tirarFoto') ? (
                  <span className="indicador" title="Tem acção de tirar foto">
                    <IconeFoto />
                  </span>
                ) : null}
                <span className="indicador" title={`Gimbal ${waypoint.gimbalPitch.toFixed(0)} graus`}>
                  <IconeGimbal />
                </span>
                <button type="button" title="Centrar no mapa" onClick={() => aoCentrar(waypoint.id)}>
                  <IconeCentrar />
                </button>
                <button type="button" title="Eliminar" onClick={() => aoEliminar(waypoint.id)}>
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
