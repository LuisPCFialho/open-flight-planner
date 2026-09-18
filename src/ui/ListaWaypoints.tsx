import { useMemo, useState } from 'react'
import type { Rota, Waypoint } from '../nucleo/tipos.ts'
import { IconeCentrar, IconeEliminar, IconeFoto, IconeGimbal } from './icones.tsx'
import { CRITERIOS, filtrar, type Criterio } from './filtro-waypoints.ts'

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
  /** Indices que alguma validacao apontou. Alimenta o filtro "Assinalados". */
  assinalados: ReadonlySet<number>
  aoSeleccionar: (id: string, juntar: boolean, intervalo: boolean) => void
  aoCentrar: (id: string) => void
  aoEliminar: (id: string) => void
}

export function ListaWaypoints({
  rota,
  linhas,
  seleccionados,
  assinalados,
  aoSeleccionar,
  aoCentrar,
  aoEliminar,
}: Props) {
  const [criterio, setCriterio] = useState<Criterio>('todos')
  const [procura, setProcura] = useState('')

  const visiveis = useMemo(
    () => filtrar(linhas, criterio, procura, assinalados),
    [linhas, criterio, procura, assinalados],
  )
  const filtrada = visiveis.length !== linhas.length

  return (
    <div className="painel painel-esquerdo">
      <header className="painel-cabecalho">
        <h2>Lista de trajetórias</h2>
        <span className="etiqueta-modo">{rota.modoAltitude}</span>
      </header>

      {/*
        * O filtro so aparece quando a lista e grande de mais para se ler.
        *
        * Numa rota de dez pontos e ruido; numa cobertura de trezentos e a unica
        * maneira de la encontrar alguma coisa.
        */}
      {linhas.length > 20 ? (
        <div className="filtro-waypoints">
          <input
            type="search"
            className="numerico"
            value={procura}
            placeholder="Nº"
            aria-label="Procurar waypoint pelo número"
            onChange={(evento) => setProcura(evento.target.value)}
          />
          <div className="alternador">
            {CRITERIOS.map((c) => (
              <button
                key={c.valor}
                type="button"
                title={c.ajuda}
                className={criterio === c.valor ? 'activo' : ''}
                onClick={() => setCriterio(c.valor)}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {linhas.length === 0 ? (
        <p className="vazio">
          Liga "Criar waypoints" na barra de cima e clica no mapa.
          <br />
          Alt e clique num troço insere um ponto intermédio.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="vazio">Nenhum waypoint corresponde ao filtro.</p>
      ) : (
        <ol className="lista-waypoints">
          {visiveis.map(({ waypoint, acimaDoSolo, alerta, origemCota }) => (
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

      {/*
        * Quantos ficaram de fora.
        *
        * Sem isto, um filtro esquecido ligado e uma rota que parece ter trinta
        * waypoints quando tem trezentos, e a conta que se faz por cima dela sai
        * toda errada.
        */}
      {filtrada ? (
        <p className="filtro-resumo numerico">
          {visiveis.length} de {linhas.length}
        </p>
      ) : null}
    </div>
  )
}
