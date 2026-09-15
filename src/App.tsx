import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLon, ModoAltitude, Rota, TipoAccao } from './nucleo/tipos.ts'
import { paraASL } from './nucleo/geodesia.ts'
import { calcularEstatisticas } from './nucleo/estatisticas.ts'
import { alturasAcimaDoSolo, converterModoAltitude, nivelarAcimaDoSolo } from './nucleo/altitude.ts'
import { calcularPerfil } from './nucleo/perfil.ts'
import { AGL_MAXIMO, PASSO_COLISAO, temErros, validarRota } from './nucleo/validacoes.ts'
import {
  acrescentarWaypoint,
  alterarWaypoint,
  alterarWaypoints,
  inserirWaypoint,
  removerWaypoints,
  rotaVazia,
  waypointNovo,
} from './nucleo/operacoes-rota.ts'
import {
  acrescentarAccaoEmLote,
  alterarAccao,
  moverAccao,
  removerAccao,
} from './nucleo/operacoes-accoes.ts'
import { acrescentarPOI, poiNovo, removerPOI } from './nucleo/operacoes-poi.ts'
import { chaveDaPosicao, useCotasTerreno } from './estado/useCotasTerreno.ts'
import { useEditorRota } from './estado/useEditorRota.ts'
import { useSeleccao } from './estado/useSeleccao.ts'
import { usePerfilTerreno } from './estado/usePerfilTerreno.ts'
import { FonteTerrariumAWS } from './terreno/terrarium.ts'
import { descodificarPNGBrowser } from './terreno/png-browser.ts'
import { criarProjeto, gravarRota, listarProjetos, listarRotas } from './dados/bd.ts'
import { droneComId } from './drones.ts'
import { Mapa, type CursorTerreno } from './mapa/Mapa.tsx'
import type { PontoRota3D } from './mapa/camada-rota-3d.ts'
import { BarraEstatisticas } from './ui/BarraEstatisticas.tsx'
import { ListaWaypoints, type LinhaWaypoint } from './ui/ListaWaypoints.tsx'
import { PainelPropriedades, type AlteracaoWaypoint } from './ui/PainelPropriedades.tsx'
import { ConfiguracoesRota } from './ui/ConfiguracoesRota.tsx'
import { BarraFicheiro } from './ui/BarraFicheiro.tsx'
import { PerfilTerreno } from './ui/PerfilTerreno.tsx'
import { PainelValidacoes } from './ui/PainelValidacoes.tsx'
import { IconeDesfazer, IconeRefazer, IconeTerreno } from './ui/icones.tsx'

/** Sever do Vouga: o ponto de descolagem da rota de referencia. */
const CENTRO_INICIAL: LatLon = { lat: 40.746552, lon: -8.41061 }

const fonteTerreno = new FonteTerrariumAWS({ descodificador: descodificarPNGBrowser })

export function App() {
  const editor = useEditorRota()
  const { rota, aplicar, carregar } = editor
  const seleccao = useSeleccao(rota)

  const [modo3D, setModo3D] = useState(false)
  const [modoPOI, setModoPOI] = useState(false)
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false)
  const [abaInferior, setAbaInferior] = useState<'perfil' | 'validacoes' | null>('perfil')
  const [registoFotografico, setRegistoFotografico] = useState(false)
  const [cursor, setCursor] = useState<CursorTerreno | null>(null)
  const [arranque, setArranque] = useState<string | null>(null)
  const [erroMapa, setErroMapa] = useState<string | null>(null)

  // --- arranque: recupera a ultima rota ou cria uma nova ---------------------
  useEffect(() => {
    let cancelado = false

    const iniciar = async (): Promise<void> => {
      const projetos = await listarProjetos()
      const projeto = projetos[0] ?? (await criarProjeto({ nome: 'Projeto sem nome' }))
      const rotas = await listarRotas(projeto.id)
      const existente = [...rotas].sort((a, b) => b.alteradaEm - a.alteradaEm)[0]

      if (existente) {
        if (!cancelado) carregar(existente)
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
      if (!cancelado) carregar(nova)
    }

    iniciar().catch((causa: unknown) => {
      if (!cancelado) {
        setArranque(causa instanceof Error ? causa.message : 'falha a abrir o projeto local')
      }
    })

    return () => {
      cancelado = true
    }
    // So `carregar` interessa aqui, e e estavel. Depender do editor inteiro faria
    // este efeito correr a cada render e repor a rota gravada por cima das edicoes.
  }, [carregar])

  // --- persistencia, com folga para nao gravar a cada pixel de arrasto -------
  useEffect(() => {
    if (!rota) return
    const temporizador = setTimeout(() => void gravarRota(rota), 400)
    return () => clearTimeout(temporizador)
  }, [rota])

  // --- cotas do terreno -----------------------------------------------------
  const posicoes = useMemo(() => {
    if (!rota) return []
    return [
      ...rota.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
      ...rota.pois.map((p) => ({ lat: p.lat, lon: p.lon })),
    ]
  }, [rota])
  const { cotas, erro: erroTerreno } = useCotasTerreno(posicoes, fonteTerreno)

  const alturasAGL = useMemo(
    () => (rota ? alturasAcimaDoSolo(rota, cotas, chaveDaPosicao) : []),
    [rota, cotas],
  )

  const linhas = useMemo<LinhaWaypoint[]>(() => {
    if (!rota) return []
    return rota.waypoints.map((waypoint, i) => {
      const acimaDoSolo = alturasAGL[i] ?? null
      return {
        waypoint,
        cotaTerreno: cotas.get(chaveDaPosicao(waypoint)) ?? null,
        acimaDoSolo,
        alerta:
          acimaDoSolo !== null &&
          (acimaDoSolo < rota.alturaMinimaAcimaDoSolo || acimaDoSolo > AGL_MAXIMO),
      }
    })
  }, [rota, cotas, alturasAGL])

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
        seleccionado: seleccao.ids.has(linha.waypoint.id),
        alerta: linha.alerta,
      })
    }
    return pontos
  }, [rota, linhas, seleccao.ids])

  const estatisticas = useMemo(() => (rota ? calcularEstatisticas(rota) : null), [rota])
  const drone = useMemo(() => (rota ? droneComId(rota.droneId) : null), [rota])

  // --- perfil do terreno e validacoes ---------------------------------------
  const amostrado = usePerfilTerreno(rota, fonteTerreno, PASSO_COLISAO)

  const perfil = useMemo(
    () =>
      rota
        ? calcularPerfil(rota, { pontos: amostrado.pontos, cotas: amostrado.cotas }, cotas, chaveDaPosicao)
        : null,
    [rota, amostrado.pontos, amostrado.cotas, cotas],
  )

  const validacoes = useMemo(() => {
    if (!rota || !drone) return []
    return validarRota(rota, drone, {
      cotas,
      chave: chaveDaPosicao,
      registoFotografico,
      ...(amostrado.cotas.length > 0
        ? { perfil: { pontos: amostrado.pontos, cotas: amostrado.cotas } }
        : {}),
    })
  }, [rota, drone, cotas, amostrado.pontos, amostrado.cotas, registoFotografico])

  const exportacaoBloqueada = temErros(validacoes)

  // --- alteracoes -----------------------------------------------------------
  const aoAdicionarWaypoint = useCallback(
    (lat: number, lon: number) => {
      if (modoPOI) {
        aplicar((atual) =>
          acrescentarPOI(
            atual,
            poiNovo({ lat, lon, altura: alturaPredefinida(atual), nome: `POI ${atual.pois.length + 1}` }),
          ),
        )
        setModoPOI(false)
        return
      }
      aplicar((atual) =>
        acrescentarWaypoint(
          atual,
          waypointNovo({ lat, lon, altura: alturaPredefinida(atual), index: atual.waypoints.length }),
        ),
      )
    },
    [aplicar, modoPOI],
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

  const alterarSeleccionados = useCallback(
    (alteracao: AlteracaoWaypoint) => {
      aplicar((atual) => alterarWaypoints(atual, [...seleccao.ids], alteracao))
    },
    [aplicar, seleccao.ids],
  )

  /** Soma o mesmo delta a cada waypoint, mantendo as diferencas entre eles. */
  const incrementarAltura = useCallback(
    (delta: number) => {
      aplicar((atual) => ({
        ...atual,
        waypoints: atual.waypoints.map((w) =>
          seleccao.ids.has(w.id) ? { ...w, altura: w.altura + delta } : w,
        ),
      }))
    },
    [aplicar, seleccao.ids],
  )

  const eliminarSeleccionados = useCallback(() => {
    if (seleccao.ids.size === 0) return
    aplicar((atual) => removerWaypoints(atual, [...seleccao.ids]))
    seleccao.limpar()
  }, [aplicar, seleccao])

  const acrescentarAccao = useCallback(
    (tipo: TipoAccao) => {
      aplicar((atual) => acrescentarAccaoEmLote(atual, [...seleccao.ids], tipo))
    },
    [aplicar, seleccao.ids],
  )

  const nivelar = useCallback(
    (alturaAcimaDoSolo: number) => {
      aplicar((atual) => {
        const resultado = nivelarAcimaDoSolo(atual, alturaAcimaDoSolo, cotas, chaveDaPosicao)
        return resultado.estado === 'convertida' ? resultado.rota : atual
      })
    },
    [aplicar, cotas],
  )

  const mudarModoAltitude = useCallback(
    (modo: ModoAltitude) => {
      aplicar((atual) => {
        const resultado = converterModoAltitude(atual, modo, cotas, chaveDaPosicao)
        return resultado.estado === 'convertida' ? resultado.rota : atual
      })
    },
    [aplicar, cotas],
  )

  /** Enquanto faltarem cotas, mudar de modo mexeria na posicao real da rota. */
  const impedimentoConversao = useMemo(() => {
    if (!rota) return null
    const emFalta = rota.waypoints.filter((w) => !cotas.has(chaveDaPosicao(w))).length
    if (emFalta === 0) return null
    return `A aguardar a cota do terreno de ${emFalta} waypoint${emFalta === 1 ? '' : 's'}. Mudar de modo agora deslocava a rota.`
  }, [rota, cotas])

  // --- atalhos --------------------------------------------------------------
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      const alvo = evento.target
      if (
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo instanceof HTMLSelectElement
      ) {
        return
      }

      const comando = evento.ctrlKey || evento.metaKey

      if (comando && evento.key.toLowerCase() === 'z') {
        evento.preventDefault()
        if (evento.shiftKey) editor.refazer()
        else editor.desfazer()
        return
      }
      if (comando && evento.key.toLowerCase() === 'y') {
        evento.preventDefault()
        editor.refazer()
        return
      }
      if (evento.shiftKey && evento.key.toLowerCase() === 'f') {
        evento.preventDefault()
        if (seleccao.ids.size > 0) acrescentarAccao('tirarFoto')
        return
      }
      if (evento.key === 'Delete' || evento.key === 'Backspace') {
        evento.preventDefault()
        eliminarSeleccionados()
        return
      }
      if (evento.key === 'Escape') {
        setModoPOI(false)
        setConfiguracoesAbertas(false)
        seleccao.limpar()
        return
      }
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault()
        seleccao.mover(evento.key === 'ArrowDown' ? 1 : -1)
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [editor, seleccao, eliminarSeleccionados, acrescentarAccao])

  if (arranque) {
    return (
      <div className="aviso-arranque">
        <h1>Nao foi possivel abrir o projeto</h1>
        <p>{arranque}</p>
      </div>
    )
  }

  if (!rota || !estatisticas || !drone) {
    return <div className="aviso-arranque">A abrir o projeto local...</div>
  }

  const cotaCursor = cursor?.cotaTerreno ?? null
  const unicoSeleccionado = seleccao.waypoints.length === 1 ? seleccao.waypoints[0] : null
  const aglSeleccionados = seleccao.waypoints.map((w) => {
    const i = rota.waypoints.findIndex((outro) => outro.id === w.id)
    return alturasAGL[i] ?? null
  })

  return (
    <div className="aplicacao">
      <header className="barra-superior">
        <div className="grupo-esquerda">
          <button
            type="button"
            className={configuracoesAbertas ? 'activo' : ''}
            onClick={() => setConfiguracoesAbertas((v) => !v)}
          >
            Configuracoes de rota de voo
          </button>
          <BarraEstatisticas estatisticas={estatisticas} />
        </div>

        <div className="titulo-rota">
          <strong>{rota.nome}</strong>
          <span className="subtitulo">{drone.nome}</span>
        </div>

        <div className="accoes-superiores">
          <BarraFicheiro
            rota={rota}
            drone={drone}
            cotas={cotas}
            chave={chaveDaPosicao}
            fonteTerreno={fonteTerreno}
            bloqueio={
              exportacaoBloqueada
                ? `${validacoes.filter((v) => v.severidade === 'erro').length} erro(s) de validacao impedem a exportacao`
                : null
            }
            aoImportar={(importada) => {
              carregar(importada.rota)
              seleccao.limpar()
            }}
          />
          <button
            type="button"
            className={modoPOI ? 'activo' : ''}
            title="Clicar no mapa cria um ponto de interesse"
            onClick={() => setModoPOI((v) => !v)}
          >
            POI
          </button>
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            disabled={!editor.podeDesfazer}
            onClick={editor.desfazer}
          >
            <IconeDesfazer />
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Shift+Z)"
            disabled={!editor.podeRefazer}
            onClick={editor.refazer}
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
          seleccionados={seleccao.ids}
          aoSeleccionar={seleccao.seleccionar}
          aoCentrar={() => undefined}
          aoEliminar={(id) => {
            aplicar((atual) => removerWaypoints(atual, [id]))
            seleccao.limpar()
          }}
        />

        <section className="zona-mapa">
          <Mapa
            rota={rota}
            pontos3D={pontos3D}
            seleccionados={seleccao.ids}
            modo3D={modo3D}
            modoPOI={modoPOI}
            centroInicial={CENTRO_INICIAL}
            aoAdicionarWaypoint={aoAdicionarWaypoint}
            aoInserirWaypoint={aoInserirWaypoint}
            aoMoverWaypoint={aoMoverWaypoint}
            aoSeleccionar={(id, juntar) => seleccao.seleccionar(id, juntar)}
            aoMoverCursor={setCursor}
            aoRemoverPOI={(id) => aplicar((atual) => removerPOI(atual, id))}
            aoErro={setErroMapa}
          />

          {configuracoesAbertas ? (
            <ConfiguracoesRota
              rota={rota}
              drone={drone}
              impedimentoConversao={impedimentoConversao}
              aoAlterarRota={editor.alterarRota}
              aoMudarModoAltitude={mudarModoAltitude}
              aoFechar={() => setConfiguracoesAbertas(false)}
            />
          ) : null}

          {abaInferior && perfil ? (
            <div className="painel-inferior">
              <nav className="abas abas-inferior" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={abaInferior === 'perfil'}
                  className={abaInferior === 'perfil' ? 'activo' : ''}
                  onClick={() => setAbaInferior('perfil')}
                >
                  Perfil de terreno
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={abaInferior === 'validacoes'}
                  className={`${abaInferior === 'validacoes' ? 'activo' : ''} ${
                    exportacaoBloqueada ? 'com-erro' : ''
                  }`}
                  onClick={() => setAbaInferior('validacoes')}
                >
                  Validacoes
                  {validacoes.length > 0 ? (
                    <span className="contador numerico">{validacoes.length}</span>
                  ) : null}
                </button>
                <label className="interruptor" title="Espera-se accao de foto em cada waypoint">
                  <input
                    type="checkbox"
                    checked={registoFotografico}
                    onChange={(e) => setRegistoFotografico(e.target.checked)}
                  />
                  Registo fotografico
                </label>
                <button type="button" className="fechar-inferior" onClick={() => setAbaInferior(null)}>
                  Ocultar
                </button>
              </nav>

              {abaInferior === 'perfil' ? (
                <PerfilTerreno
                  perfil={perfil}
                  aglMinimo={rota.alturaMinimaAcimaDoSolo}
                  aCarregar={amostrado.aCarregar}
                  erro={amostrado.erro}
                  seleccionados={new Set(seleccao.waypoints.map((w) => w.index))}
                  aoSeleccionarWaypoint={(indice) => {
                    const alvo = rota.waypoints[indice]
                    if (alvo) seleccao.substituir([alvo.id])
                  }}
                  aoNivelar={nivelar}
                  podeNivelar={rota.waypoints.length > 0 && cotas.size > 0}
                />
              ) : (
                <PainelValidacoes
                  validacoes={validacoes}
                  aoSeleccionarWaypoints={(indices) => {
                    const ids = indices
                      .map((i) => rota.waypoints[i]?.id)
                      .filter((id): id is string => id !== undefined)
                    seleccao.substituir(ids)
                  }}
                />
              )}
            </div>
          ) : null}

          {!abaInferior ? (
            <button
              type="button"
              className="mostrar-inferior"
              onClick={() => setAbaInferior('perfil')}
            >
              Perfil de terreno
              {exportacaoBloqueada ? <span className="ponto-erro" aria-hidden="true" /> : null}
            </button>
          ) : null}

          <div className="barra-inferior-mapa">
            {erroTerreno ?? erroMapa ? (
              <span className="erro">{erroTerreno ?? erroMapa}</span>
            ) : null}
            {modoPOI ? <span className="modo-activo">Clica no mapa para criar um POI</span> : null}
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

        <PainelPropriedades
          rota={rota}
          drone={drone}
          seleccionados={seleccao.waypoints}
          alturasAcimaDoSolo={aglSeleccionados}
          aoAlterar={alterarSeleccionados}
          aoIncrementarAltura={incrementarAltura}
          aoAcrescentarAccao={acrescentarAccao}
          aoAlterarAccao={(indice, accao) => {
            if (!unicoSeleccionado) return
            aplicar((atual) => alterarAccao(atual, unicoSeleccionado.id, indice, accao))
          }}
          aoRemoverAccao={(indice) => {
            if (!unicoSeleccionado) return
            aplicar((atual) => removerAccao(atual, unicoSeleccionado.id, indice))
          }}
          aoMoverAccao={(de, para) => {
            if (!unicoSeleccionado) return
            aplicar((atual) => moverAccao(atual, unicoSeleccionado.id, de, para))
          }}
        />
      </main>
    </div>
  )
}

/** Altura de um waypoint novo: a do ultimo, para a rota nao dar saltos. */
function alturaPredefinida(rota: Rota): number {
  return rota.waypoints.at(-1)?.altura ?? 60
}
