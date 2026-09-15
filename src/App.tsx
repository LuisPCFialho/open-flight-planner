import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon, Rota } from './nucleo/tipos.ts'
import { paraASL } from './nucleo/geodesia.ts'
import { calcularEstatisticas } from './nucleo/estatisticas.ts'
import {
  acrescentarWaypoint,
  alterarWaypoint,
  inserirWaypoint,
  removerWaypoints,
  rotaVazia,
  waypointNovo,
} from './nucleo/operacoes-rota.ts'
import {
  desfazer,
  historicoInicial,
  podeDesfazer,
  podeRefazer,
  refazer,
  registar,
  substituir,
  type Historico,
} from './estado/historico.ts'
import { chaveDaPosicao, useCotasTerreno } from './estado/useCotasTerreno.ts'
import { FonteTerrariumAWS } from './terreno/terrarium.ts'
import { descodificarPNGBrowser } from './terreno/png-browser.ts'
import { criarProjeto, gravarRota, listarProjetos, listarRotas } from './dados/bd.ts'
import { Mapa, type CursorTerreno } from './mapa/Mapa.tsx'
import type { PontoRota3D } from './mapa/camada-rota-3d.ts'
import { BarraEstatisticas } from './ui/BarraEstatisticas.tsx'
import { ListaWaypoints, type LinhaWaypoint } from './ui/ListaWaypoints.tsx'
import { IconeDesfazer, IconeRefazer, IconeTerreno } from './ui/icones.tsx'

/** Intervalo seguro acima do solo, em metros. Fora dele o ponto fica assinalado. */
const AGL_MINIMO = 30
const AGL_MAXIMO = 120

/** Sever do Vouga: o ponto de descolagem da rota de referencia. */
const CENTRO_INICIAL: LatLon = { lat: 40.746552, lon: -8.41061 }

const fonteTerreno = new FonteTerrariumAWS({ descodificador: descodificarPNGBrowser })

export function App() {
  const [historico, setHistorico] = useState<Historico<Rota> | null>(null)
  const [seleccionados, setSeleccionados] = useState<ReadonlySet<string>>(new Set())
  const [modo3D, setModo3D] = useState(false)
  const [cursor, setCursor] = useState<CursorTerreno | null>(null)
  const [arranque, setArranque] = useState<string | null>(null)
  const [erroMapa, setErroMapa] = useState<string | null>(null)
  const ultimoSeleccionado = useRef<string | null>(null)

  const rota = historico?.presente ?? null

  // --- arranque: recupera a ultima rota ou cria uma nova ---------------------
  useEffect(() => {
    let cancelado = false

    const iniciar = async (): Promise<void> => {
      const projetos = await listarProjetos()
      const projeto = projetos[0] ?? (await criarProjeto({ nome: 'Projeto sem nome' }))
      const rotas = await listarRotas(projeto.id)
      const existente = rotas.sort((a, b) => b.alteradaEm - a.alteradaEm)[0]

      if (existente) {
        if (!cancelado) setHistorico(historicoInicial(existente))
        return
      }

      const cotaDescolagem = await fonteTerreno.cota(CENTRO_INICIAL.lat, CENTRO_INICIAL.lon)
      const nova = rotaVazia({
        nome: 'Rota sem nome',
        projetoId: projeto.id,
        droneId: 'mini5pro',
        pontoDescolagem: { ...CENTRO_INICIAL, cotaTerreno: cotaDescolagem },
      })
      await gravarRota(nova)
      if (!cancelado) setHistorico(historicoInicial(nova))
    }

    iniciar().catch((causa: unknown) => {
      if (!cancelado) {
        setArranque(causa instanceof Error ? causa.message : 'falha a abrir o projeto local')
      }
    })

    return () => {
      cancelado = true
    }
  }, [])

  // --- persistencia, com folga para nao gravar a cada pixel de arrasto -------
  useEffect(() => {
    if (!rota) return
    const temporizador = setTimeout(() => {
      void gravarRota(rota)
    }, 400)
    return () => clearTimeout(temporizador)
  }, [rota])

  // --- cotas do terreno sob cada waypoint -----------------------------------
  const posicoes = useMemo(
    () => rota?.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })) ?? [],
    [rota],
  )
  const { cotas, erro: erroTerreno } = useCotasTerreno(posicoes, fonteTerreno)

  const linhas = useMemo<LinhaWaypoint[]>(() => {
    if (!rota) return []
    return rota.waypoints.map((waypoint) => {
      const cota = cotas.get(chaveDaPosicao(waypoint)) ?? null
      if (cota === null) {
        return { waypoint, cotaTerreno: null, acimaDoSolo: null, alerta: false }
      }
      const asl = paraASL(waypoint.altura, rota.modoAltitude, {
        cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
        cotaTerreno: cota,
      })
      const acimaDoSolo = asl - cota
      return {
        waypoint,
        cotaTerreno: cota,
        acimaDoSolo,
        alerta: acimaDoSolo < AGL_MINIMO || acimaDoSolo > AGL_MAXIMO,
      }
    })
  }, [rota, cotas])

  const pontos3D = useMemo<PontoRota3D[]>(() => {
    if (!rota) return []
    const pontos: PontoRota3D[] = []
    for (const linha of linhas) {
      if (linha.cotaTerreno === null) continue
      pontos.push({
        lat: linha.waypoint.lat,
        lon: linha.waypoint.lon,
        alturaVoo: paraASL(linha.waypoint.altura, rota.modoAltitude, {
          cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
          cotaTerreno: linha.cotaTerreno,
        }),
        cotaTerreno: linha.cotaTerreno,
        seleccionado: seleccionados.has(linha.waypoint.id),
        alerta: linha.alerta,
      })
    }
    return pontos
  }, [rota, linhas, seleccionados])

  const estatisticas = useMemo(
    () => (rota ? calcularEstatisticas(rota) : null),
    [rota],
  )

  // --- alteracoes a rota ----------------------------------------------------
  const aplicar = useCallback((transformacao: (atual: Rota) => Rota, comPasso = true) => {
    setHistorico((anterior) => {
      if (!anterior) return anterior
      const nova = transformacao(anterior.presente)
      return comPasso ? registar(anterior, nova) : substituir(anterior, nova)
    })
  }, [])

  const aoAdicionarWaypoint = useCallback(
    (lat: number, lon: number) => {
      aplicar((atual) =>
        acrescentarWaypoint(
          atual,
          waypointNovo({ lat, lon, altura: alturaPredefinida(atual), index: atual.waypoints.length }),
        ),
      )
    },
    [aplicar],
  )

  const aoInserirWaypoint = useCallback(
    (posicao: number, lat: number, lon: number) => {
      aplicar((atual) =>
        inserirWaypoint(
          atual,
          waypointNovo({ lat, lon, altura: alturaPredefinida(atual), index: posicao }),
          posicao,
        ),
      )
    },
    [aplicar],
  )

  const aoMoverWaypoint = useCallback(
    (id: string, lat: number, lon: number, definitivo: boolean) => {
      aplicar((atual) => alterarWaypoint(atual, id, { lat, lon }), definitivo)
    },
    [aplicar],
  )

  const eliminarSeleccionados = useCallback(() => {
    if (seleccionados.size === 0) return
    aplicar((atual) => removerWaypoints(atual, [...seleccionados]))
    setSeleccionados(new Set())
  }, [aplicar, seleccionados])

  // --- seleccao -------------------------------------------------------------
  const seleccionar = useCallback(
    (id: string, juntar: boolean, intervalo = false) => {
      setSeleccionados((anteriores) => {
        if (intervalo && ultimoSeleccionado.current && rota) {
          const indices = rota.waypoints.map((w) => w.id)
          const de = indices.indexOf(ultimoSeleccionado.current)
          const para = indices.indexOf(id)
          if (de >= 0 && para >= 0) {
            const [inicio, fim] = de <= para ? [de, para] : [para, de]
            return new Set(indices.slice(inicio, fim + 1))
          }
        }
        if (!juntar) {
          ultimoSeleccionado.current = id
          return new Set([id])
        }
        const novos = new Set(anteriores)
        if (novos.has(id)) novos.delete(id)
        else novos.add(id)
        ultimoSeleccionado.current = id
        return novos
      })
    },
    [rota],
  )

  // --- atalhos --------------------------------------------------------------
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      const alvo = evento.target
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) return

      const comando = evento.ctrlKey || evento.metaKey
      if (comando && evento.key.toLowerCase() === 'z') {
        evento.preventDefault()
        setHistorico((anterior) =>
          anterior ? (evento.shiftKey ? refazer(anterior) : desfazer(anterior)) : anterior,
        )
        return
      }
      if (comando && evento.key.toLowerCase() === 'y') {
        evento.preventDefault()
        setHistorico((anterior) => (anterior ? refazer(anterior) : anterior))
        return
      }
      if (evento.key === 'Delete' || evento.key === 'Backspace') {
        evento.preventDefault()
        eliminarSeleccionados()
        return
      }
      if ((evento.key === 'ArrowDown' || evento.key === 'ArrowUp') && rota) {
        evento.preventDefault()
        const ids = rota.waypoints.map((w) => w.id)
        if (ids.length === 0) return
        const actual = ultimoSeleccionado.current ? ids.indexOf(ultimoSeleccionado.current) : -1
        const passo = evento.key === 'ArrowDown' ? 1 : -1
        const seguinte = ids[Math.max(0, Math.min(ids.length - 1, actual + passo))]
        if (seguinte) seleccionar(seguinte, false)
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [eliminarSeleccionados, rota, seleccionar])

  if (arranque) {
    return (
      <div className="aviso-arranque">
        <h1>Nao foi possivel abrir o projeto</h1>
        <p>{arranque}</p>
      </div>
    )
  }

  if (!rota || !historico || !estatisticas) {
    return <div className="aviso-arranque">A abrir o projeto local...</div>
  }

  const cotaCursor = cursor?.cotaTerreno ?? null

  return (
    <div className="aplicacao">
      <header className="barra-superior">
        <BarraEstatisticas estatisticas={estatisticas} />

        <div className="titulo-rota">
          <strong>{rota.nome}</strong>
          <span className="subtitulo">{rota.droneId}</span>
        </div>

        <div className="accoes-superiores">
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            disabled={!podeDesfazer(historico)}
            onClick={() => setHistorico((a) => (a ? desfazer(a) : a))}
          >
            <IconeDesfazer />
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Shift+Z)"
            disabled={!podeRefazer(historico)}
            onClick={() => setHistorico((a) => (a ? refazer(a) : a))}
          >
            <IconeRefazer />
          </button>
          <button
            type="button"
            className={modo3D ? 'activo' : ''}
            onClick={() => setModo3D((v) => !v)}
            title="Alternar entre 2D e 3D"
          >
            <IconeTerreno />
            {modo3D ? '3D' : '2D'}
          </button>
        </div>
      </header>

      <main className="corpo">
        <ListaWaypoints
          rota={rota}
          linhas={linhas}
          seleccionados={seleccionados}
          aoSeleccionar={seleccionar}
          aoCentrar={() => undefined}
          aoEliminar={(id) => {
            aplicar((atual) => removerWaypoints(atual, [id]))
            setSeleccionados((anteriores) => {
              const novos = new Set(anteriores)
              novos.delete(id)
              return novos
            })
          }}
        />

        <section className="zona-mapa">
          <Mapa
            rota={rota}
            pontos3D={pontos3D}
            seleccionados={seleccionados}
            modo3D={modo3D}
            centroInicial={CENTRO_INICIAL}
            aoAdicionarWaypoint={aoAdicionarWaypoint}
            aoInserirWaypoint={aoInserirWaypoint}
            aoMoverWaypoint={aoMoverWaypoint}
            aoSeleccionar={(id, juntar) => seleccionar(id, juntar)}
            aoMoverCursor={setCursor}
            aoErro={setErroMapa}
          />

          <div className="barra-inferior-mapa">
            {erroTerreno ?? erroMapa ? (
              <span className="erro">{erroTerreno ?? erroMapa}</span>
            ) : null}
            <span className="numerico">
              {cursor ? `${cursor.lat.toFixed(6)}, ${cursor.lon.toFixed(6)}` : '--'}
            </span>
            <span className="numerico" title="Cota ortometrica do terreno sob o cursor">
              ASL: {cotaCursor === null ? '--' : `${cotaCursor.toFixed(1)} m`}
            </span>
            <span className="numerico" title="Altura elipsoidal do terreno sob o cursor">
              HAE: {cotaCursor === null ? '--' : `${(cotaCursor + rota.ondulacaoGeoide).toFixed(1)} m`}
            </span>
            <span>WGS 84</span>
          </div>
        </section>
      </main>
    </div>
  )
}

/** Altura de um waypoint novo: a do ultimo, para a rota nao dar saltos. */
function alturaPredefinida(rota: Rota): number {
  return rota.waypoints.at(-1)?.altura ?? 60
}
