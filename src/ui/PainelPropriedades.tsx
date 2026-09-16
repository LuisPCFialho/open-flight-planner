import { useState } from 'react'
import type { Accao, Drone, ModoGuinada, Rota, TipoAccao, TipoCurva, Waypoint } from '../nucleo/tipos.ts'
import { valorComum } from '../nucleo/edicao-lote.ts'
import { CampoNumerico, CampoSelecao, Deslizador } from './campos.tsx'
import { EditorAccoes } from './EditorAccoes.tsx'
import { RepetirTroco } from './RepetirTroco.tsx'

type Aba = 'parametros' | 'accoes'

export type AlteracaoWaypoint = Partial<Omit<Waypoint, 'id' | 'index'>>

type Props = {
  rota: Rota
  drone: Drone
  seleccionados: readonly Waypoint[]
  /** Altura acima do solo de cada waypoint seleccionado, `null` se a cota ainda nao chegou. */
  alturasAcimaDoSolo: readonly (number | null)[]
  aoAlterar: (alteracao: AlteracaoWaypoint) => void
  aoIncrementarAltura: (delta: number) => void
  aoAcrescentarAccao: (tipo: TipoAccao) => void
  aoAlterarAccao: (indice: number, accao: Accao) => void
  aoRemoverAccao: (indice: number) => void
  aoMoverAccao: (de: number, para: number) => void
  aoRepetirDeslocado: (opcoes: { afastamento: number; rumoGraus: number; quantas: number }) => void
  aoRepetirEmSentidoContrario: () => void
}

const CURVAS: readonly { valor: TipoCurva; rotulo: string }[] = [
  { valor: 'pararNoPonto', rotulo: 'Trajetória reta. A aeronave para' },
  { valor: 'passarSuave', rotulo: 'Trajetória curva. A aeronave passa' },
]

const GUINADAS: readonly { valor: ModoGuinada; rotulo: string }[] = [
  { valor: 'followWayline', rotulo: 'Ao longo da rota' },
  { valor: 'towardPOI', rotulo: 'Apontar ao POI' },
  { valor: 'fixed', rotulo: 'Rumo fixo' },
  { valor: 'manual', rotulo: 'Manual' },
]

export function PainelPropriedades(props: Props) {
  const [aba, setAba] = useState<Aba>('parametros')
  const { rota, drone, seleccionados } = props

  if (seleccionados.length === 0) {
    return (
      <aside className="painel painel-direito">
        <header className="painel-cabecalho">
          <h2>Propriedades</h2>
        </header>
        <p className="vazio">
          Selecciona um waypoint na lista ou no mapa.
          <br />
          Ctrl e clique junta a selecção, shift selecciona um intervalo.
        </p>
      </aside>
    )
  }

  const unico = seleccionados.length === 1 ? (seleccionados[0] ?? null) : null
  const titulo = unico
    ? `Waypoint ${unico.index + 1}`
    : `${seleccionados.length} pontos de passagem`

  return (
    <aside className="painel painel-direito">
      <header className="painel-cabecalho">
        <h2>{titulo}</h2>
      </header>

      <nav className="abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'parametros'}
          className={aba === 'parametros' ? 'activo' : ''}
          onClick={() => setAba('parametros')}
        >
          Parâmetros
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'accoes'}
          className={aba === 'accoes' ? 'activo' : ''}
          onClick={() => setAba('accoes')}
        >
          Acções
        </button>
      </nav>

      <div className="painel-conteudo">
        {aba === 'parametros' ? (
          <>
            <Parametros {...props} />
            <RepetirTroco
              seleccionados={seleccionados}
              aoRepetirDeslocado={props.aoRepetirDeslocado}
              aoRepetirEmSentidoContrario={props.aoRepetirEmSentidoContrario}
            />
          </>
        ) : null}
        {aba === 'accoes' ? (
          <EditorAccoes
            drone={drone}
            waypoint={unico}
            numeroSeleccionados={seleccionados.length}
            aoAcrescentar={props.aoAcrescentarAccao}
            aoAlterar={props.aoAlterarAccao}
            aoRemover={props.aoRemoverAccao}
            aoMover={props.aoMoverAccao}
          />
        ) : null}
      </div>

      {unico ? (
        <footer className="painel-rodape numerico">
          {unico.lat.toFixed(7)}, {unico.lon.toFixed(7)}
        </footer>
      ) : null}

      {rota.pois.length === 0 && aba === 'parametros' ? null : null}
    </aside>
  )
}

function Parametros({
  rota,
  seleccionados,
  alturasAcimaDoSolo,
  aoAlterar,
  aoIncrementarAltura,
}: Props) {
  const altura = valorComum(seleccionados, (w) => w.altura)
  const velocidade = valorComum(seleccionados, (w) => w.velocidade ?? rota.velocidadeGlobal)
  const curva = valorComum(seleccionados, (w) => w.tipoCurva)
  const guinada = valorComum(seleccionados, (w) => w.modoGuinada)
  const rumo = valorComum(seleccionados, (w) => w.guinada ?? 0)
  const pitch = valorComum(seleccionados, (w) => w.gimbalPitch)
  const yaw = valorComum(seleccionados, (w) => w.gimbalYaw)
  const poi = valorComum(seleccionados, (w) => w.poiId ?? '')

  const agl = alturasAcimaDoSolo.filter((v): v is number => v !== null)
  const mostraGuinadaFixa = guinada === 'fixed'
  const mostraPOI = guinada === 'towardPOI'

  return (
    <>
      <CampoNumerico
        rotulo={`Altitude da trajetoria (${rota.modoAltitude})`}
        valor={altura}
        unidade=" m"
        incrementos={[100, 10]}
        aoAlterar={(v) => aoAlterar({ altura: v })}
        aoIncrementar={aoIncrementarAltura}
      />

      {agl.length > 0 ? (
        <p className="leitura-auxiliar numerico">
          Acima do solo:{' '}
          {agl.length === seleccionados.length && Math.max(...agl) - Math.min(...agl) < 0.5
            ? `${agl[0]?.toFixed(0)} m`
            : `${Math.min(...agl).toFixed(0)} a ${Math.max(...agl).toFixed(0)} m`}
        </p>
      ) : null}

      <CampoNumerico
        rotulo="Velocidade da trajetória"
        valor={velocidade}
        unidade=" m/s"
        casas={1}
        min={0.5}
        max={23}
        passo={0.5}
        aoAlterar={(v) => aoAlterar({ velocidade: v })}
      />

      <CampoSelecao
        rotulo="Tipo de trajetória"
        valor={curva}
        opcoes={CURVAS}
        aoAlterar={(v) => aoAlterar({ tipoCurva: v })}
      />

      <CampoSelecao
        rotulo="Guinada da aeronave"
        valor={guinada}
        opcoes={GUINADAS.map((g) => ({
          ...g,
          desactivada: g.valor === 'towardPOI' && rota.pois.length === 0,
        }))}
        aoAlterar={(v) => aoAlterar({ modoGuinada: v })}
      />

      {mostraGuinadaFixa ? (
        <CampoNumerico
          rotulo="Rumo fixo"
          valor={rumo}
          unidade=" graus"
          min={-180}
          max={180}
          incrementos={[45, 10]}
          aoAlterar={(v) => aoAlterar({ guinada: v })}
        />
      ) : null}

      {mostraPOI ? (
        <CampoSelecao
          rotulo="Ponto de interesse"
          valor={poi}
          opcoes={rota.pois.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          aoAlterar={(v) => aoAlterar({ poiId: v })}
        />
      ) : null}

      <Deslizador
        rotulo="Inclinação do estabilizador"
        valor={pitch}
        min={-90}
        max={45}
        passo={0.1}
        unidade=" graus"
        aoAlterar={(v) => aoAlterar({ gimbalPitch: v })}
      />

      <Deslizador
        rotulo="Guinada do estabilizador"
        valor={yaw}
        min={-180}
        max={180}
        passo={1}
        unidade=" graus"
        casas={0}
        aoAlterar={(v) => aoAlterar({ gimbalYaw: v })}
      />
    </>
  )
}
