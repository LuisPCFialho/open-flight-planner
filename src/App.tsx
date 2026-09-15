import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Area, LatLon, ModoAltitude, Rota, TipoAccao } from './nucleo/tipos.ts'
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
import { novoId } from './nucleo/ids.ts'
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
import { useEnquadramento } from './estado/useEnquadramento.ts'
import { useVooVirtual, type EstadoVoo } from './estado/useVooVirtual.ts'
import { FonteTerrariumAWS } from './terreno/terrarium.ts'
import { descodificarPNGBrowser } from './terreno/png-browser.ts'
import { FonteComposta, FonteTerrenoDXF } from './terreno/fonte-dxf.ts'
import { lerDXF } from './terreno/dxf.ts'
import { exportarKML } from './kmz/kml.ts'
import { importarAreas } from './kmz/ficheiro.ts'
import { areaDoContorno, centroDasAreas, formatarArea } from './nucleo/areas.ts'
import {
  apagarRota,
  bd,
  criarProjeto,
  criarRota,
  duplicarRota,
  gravarRota,
  listarProjetos,
  listarRotas,
  renomearRota,
} from './dados/bd.ts'
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
import { VistaCamara } from './ui/VistaCamara.tsx'
import { HudVoo } from './ui/HudVoo.tsx'
import { EcraProjetos } from './ui/EcraProjetos.tsx'
import { SelectorRota } from './ui/SelectorRota.tsx'
import { IconeDesfazer, IconeRefazer, IconeTerreno } from './ui/icones.tsx'

/** Sever do Vouga: o ponto de descolagem da rota de referencia. */
const CENTRO_INICIAL: LatLon = { lat: 40.746552, lon: -8.41061 }

const fonteMosaicos = new FonteTerrariumAWS({ descodificador: descodificarPNGBrowser })

export function App() {
  const [projetoAberto, setProjetoAberto] = useState<string | null>(null)
  const [rotaAberta, setRotaAberta] = useState<string | null>(null)
  const [centrarEm, setCentrarEm] = useState<{
    posicao: LatLon
    pedido: number
    envolvente?: [[number, number], [number, number]]
  } | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  /*
   * Envolve as operacoes que tocam na base de dados.
   *
   * Sem isto uma promessa rejeitada some-se: foi assim que um ciclo de
   * importacao entre a base de dados e as operacoes de projeto deixou o botao
   * de rota nova a nao fazer nada, sem uma palavra a dizer porque.
   */
  const tentar = useCallback(<T,>(promessa: Promise<T>, aoConseguir?: (valor: T) => void) => {
    promessa
      .then((valor) => {
        setFalha(null)
        aoConseguir?.(valor)
      })
      .catch((causa: unknown) => {
        setFalha(causa instanceof Error ? causa.message : 'a operacao falhou')
      })
  }, [])
  const [topografia, setTopografia] = useState<FonteTerrenoDXF | null>(null)
  const [avisoTopografia, setAvisoTopografia] = useState<string | null>(null)

  /*
   * A topografia importada manda dentro da area que cobre, e os mosaicos
   * publicos servem o resto. A fonte muda de identidade quando ha DXF novo, o
   * que faz as cotas ja lidas serem descartadas e pedidas de novo.
   */
  const fonteTerreno = useMemo(
    () => (topografia ? new FonteComposta(topografia, fonteMosaicos) : fonteMosaicos),
    [topografia],
  )

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

    if (!projetoAberto) return

    const iniciar = async (): Promise<void> => {
      const projetos = await listarProjetos()
      const projeto =
        projetos.find((p) => p.id === projetoAberto) ??
        projetos[0] ??
        (await criarProjeto({ nome: 'Projeto sem nome' }))
      const rotas = await listarRotas(projeto.id)
      const existente = [...rotas].sort((a, b) => b.alteradaEm - a.alteradaEm)[0]

      // Uma rota explicitamente escolhida manda sobre a ultima alterada.
      const escolhida = rotaAberta ? rotas.find((r) => r.id === rotaAberta) : undefined
      const aAbrir = escolhida ?? existente

      if (aAbrir) {
        if (!cancelado) {
          carregar(aAbrir)
          setRotaAberta(aAbrir.id)
        }
        return
      }

      const cotaDescolagem = await fonteTerreno.cota(CENTRO_INICIAL.lat, CENTRO_INICIAL.lon)
      const nova = rotaVazia({
        nome: 'Rota sem nome',
        projetoId: projeto.id,
        droneId: 'mini5pro',
        pontoDescolagem: { ...CENTRO_INICIAL, cotaTerreno: cotaDescolagem },
      })
      // A verificacao vem antes da escrita, e nao depois: em modo estrito o
      // React corre este efeito duas vezes, e gravar primeiro deixava na base de
      // dados uma rota vazia orfa por cada projeto aberto pela primeira vez.
      if (cancelado) return
      await gravarRota(nova)
      if (!cancelado) {
        carregar(nova)
        setRotaAberta(nova.id)
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar, projetoAberto, rotaAberta])

  /*
   * Persistencia, com folga para nao gravar a cada pixel de arrasto.
   *
   * A folga de 400 ms tinha um buraco: trocar de rota dentro desse intervalo
   * cancelava o temporizador e a ultima edicao nunca chegava a ser pedida a base
   * de dados. Nao havia promessa rejeitada, nao havia erro, a alteracao estava no
   * ecra - e ao reabrir a rota tinha desaparecido. A rota pendente fica agora num
   * `ref` para poder ser gravada a pedido, e nao so por tempo.
   */
  const porGravar = useRef<Rota | null>(null)

  useEffect(() => {
    if (!rota) return
    porGravar.current = rota
    const temporizador = setTimeout(() => {
      porGravar.current = null
      void gravarRota(rota)
    }, 400)
    return () => clearTimeout(temporizador)
  }, [rota])

  /** Grava ja o que estiver pendente. Chama-se antes de trocar de rota. */
  const gravarPendente = useCallback(() => {
    const pendente = porGravar.current
    if (!pendente) return
    porGravar.current = null
    void gravarRota(pendente)
  }, [])

  /*
   * Fechar o separador ou recarregar a pagina dentro da folga perdia a edicao
   * pela mesma razao. `visibilitychange` e o unico momento em que o browser
   * garante que ainda ha tempo de escrever; `beforeunload` ja nao o garante.
   */
  useEffect(() => {
    const aoEsconder = (): void => {
      if (document.visibilityState === 'hidden') gravarPendente()
    }
    document.addEventListener('visibilitychange', aoEsconder)
    window.addEventListener('pagehide', gravarPendente)
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder)
      window.removeEventListener('pagehide', gravarPendente)
    }
  }, [gravarPendente])

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
      const cotaTerreno = cotas.get(chaveDaPosicao(waypoint)) ?? null
      return {
        waypoint,
        cotaTerreno,
        acimaDoSolo,
        alerta:
          acimaDoSolo !== null &&
          (acimaDoSolo < rota.alturaMinimaAcimaDoSolo || acimaDoSolo > AGL_MAXIMO),
        origemCota:
          cotaTerreno === null
            ? null
            : fonteTerreno instanceof FonteComposta
              ? fonteTerreno.origemEm(waypoint.lat, waypoint.lon)
              : 'terrarium',
      }
    })
  }, [rota, cotas, alturasAGL, fonteTerreno])

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

  // --- voo virtual ----------------------------------------------------------
  const ultimoGravado = useRef<string | null>(null)

  const voo = useVooVirtual({
    aoGravarWaypoint: (estadoVoo: EstadoVoo) => {
      /*
       * O identificador nasce aqui fora, e nao dentro do updater.
       *
       * O React invoca os updaters duas vezes em modo estrito, e cada invocacao
       * gerava um identificador novo: o `ref` acabava a apontar para um waypoint
       * que nao era o que ficara na rota, e o Shift+F seguinte punha a foto num
       * waypoint inexistente, em silencio. E o mesmo defeito que ja tinha feito
       * o Shift+Espaco gravar dois waypoints, agora do lado da escrita.
       */
      const id = novoId()
      ultimoGravado.current = id

      aplicar((atual) =>
        acrescentarWaypoint(atual, {
          ...waypointNovo({
            lat: estadoVoo.posicao.lat,
            lon: estadoVoo.posicao.lon,
            altura: estadoVoo.altura,
            index: atual.waypoints.length,
          }),
          id,
          // O waypoint fica com a atitude em que a aeronave estava, que e a razao
          // de ser do voo virtual: enquadra-se e grava-se o que se esta a ver.
          gimbalPitch: estadoVoo.gimbalPitch,
          gimbalYaw: estadoVoo.gimbalYaw,
          modoGuinada: 'fixed',
          guinada: estadoVoo.guinada,
        }),
      )
    },
    aoInserirFoto: () => {
      const id = ultimoGravado.current
      if (!id) return
      aplicar((atual) => acrescentarAccaoEmLote(atual, [id], 'tirarFoto'))
    },
  })

  /** Alvo da vista de camara: a aeronave em voo, ou o waypoint seleccionado. */
  const alvoCamara = useMemo(() => {
    if (!rota) return null

    if (voo.activo) {
      const cota = cotas.get(chaveDaPosicao(voo.estado.posicao)) ?? rota.pontoDescolagem.cotaTerreno
      return {
        posicao: voo.estado.posicao,
        alturaASL: paraASL(voo.estado.altura, rota.modoAltitude, {
          cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
          cotaTerreno: cota,
        }),
        guinada: voo.estado.guinada,
        gimbalPitch: voo.estado.gimbalPitch,
        gimbalYaw: voo.estado.gimbalYaw,
      }
    }

    const waypoint = seleccao.waypoints.length === 1 ? seleccao.waypoints[0] : undefined
    if (!waypoint) return null
    const cota = cotas.get(chaveDaPosicao(waypoint))
    if (cota === undefined) return null

    return {
      posicao: { lat: waypoint.lat, lon: waypoint.lon },
      alturaASL: paraASL(waypoint.altura, rota.modoAltitude, {
        cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
        cotaTerreno: cota,
      }),
      guinada: waypoint.guinada ?? 0,
      gimbalPitch: waypoint.gimbalPitch,
      // A previsao de um waypoint ignorava a rotacao do gimbal e mostrava o que
      // a aeronave tinha pela frente, que nao e o que a foto vai apanhar.
      gimbalYaw: waypoint.gimbalYaw,
    }
  }, [rota, voo.activo, voo.estado, seleccao.waypoints, cotas])

  const { enquadramento, aCarregar: enquadramentoACarregar } = useEnquadramento(
    alvoCamara,
    drone ?? droneComId('mini5pro'),
    fonteMosaicos,
  )

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
      // Em voo virtual o teclado e todo dele: W, A, S, D e as setas pilotam.
      if (voo.activo) return

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
  }, [editor, seleccao, eliminarSeleccionados, acrescentarAccao, voo.activo])

  if (!projetoAberto) {
    return <EcraProjetos aoAbrir={setProjetoAberto} />
  }

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
          <SelectorRota
            rota={rota}
            aoAbrir={(id) => {
              gravarPendente()
              voo.parar()
              seleccao.limpar()
              setRotaAberta(id)
            }}
            aoRenomear={(nome) => {
              tentar(renomearRota(rota.id, nome))
              editor.alterarRota({ nome })
            }}
            aoCriar={() => {
              gravarPendente()
              voo.parar()
              tentar(
                criarRota({
                  nome: `Rota ${new Date().toLocaleDateString('pt-PT')}`,
                  projetoId: rota.projetoId,
                  droneId: rota.droneId,
                  pontoDescolagem: rota.pontoDescolagem,
                }),
                (nova) => {
                  seleccao.limpar()
                  setRotaAberta(nova.id)
                },
              )
            }}
            aoDuplicar={() => {
              gravarPendente()
              voo.parar()
              tentar(duplicarRota(rota.id), (copia) => {
                seleccao.limpar()
                setRotaAberta(copia.id)
              })
            }}
            aoApagar={() => {
              // Nada de gravar o que se vai apagar: a gravacao pendente e desta
              // rota, e deixa-la correr podia repo-la depois de apagada.
              porGravar.current = null
              voo.parar()
              tentar(
                apagarRota(rota.id).then(() =>
                  bd.rotas.where('projetoId').equals(rota.projetoId).toArray(),
                ),
                (restantes) => {
                  seleccao.limpar()
                  setRotaAberta(restantes[0]?.id ?? null)
                },
              )
            }}
          />
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
              gravarPendente()
              voo.parar()
              carregar(importada.rota)
              seleccao.limpar()
            }}
          />
          <button
            type="button"
            title="Voltar a lista de projetos"
            onClick={() => {
              gravarPendente()
              voo.parar()
              setRotaAberta(null)
              setProjetoAberto(null)
            }}
          >
            Projetos
          </button>
          <label
            className={`botao-ficheiro ${rota.areas?.length ? 'activo' : ''}`}
            title={
              rota.areas?.length
                ? `${rota.areas.length} area(s) de referencia, ${formatarArea(rota.areas.reduce((total, a) => total + areaDoContorno(a.contorno), 0))} no total. Importar de novo substitui.`
                : 'Importar KMZ ou KML com poligonos, para ter no mapa o contorno da area a filmar'
            }
          >
            Area
            <input
              type="file"
              accept=".kmz,.kml"
              hidden
              onChange={(evento) => {
                const ficheiro = evento.target.files?.[0]
                evento.target.value = ''
                if (!ficheiro) return

                void importarAreas(ficheiro)
                  .then(({ areas, avisos }) => {
                    editor.alterarRota({ areas })
                    setFalha(null)

                    const total = areas.reduce((soma, a) => soma + areaDoContorno(a.contorno), 0)
                    setAvisoTopografia(
                      [
                        `${ficheiro.name}: ${areas.length} area(s), ${formatarArea(total)}`,
                        ...avisos,
                      ].join('. '),
                    )

                    // Leva a vista ate la, com a area toda enquadrada: o
                    // ficheiro importado e quase sempre de outro sitio do mapa.
                    const centro = centroDasAreas(areas)
                    const envolvente = envolventeDasAreas(areas)
                    if (centro) {
                      setCentrarEm({
                        posicao: centro,
                        pedido: Date.now(),
                        ...(envolvente ? { envolvente } : {}),
                      })
                    }
                  })
                  .catch((causa: unknown) => {
                    setFalha(causa instanceof Error ? causa.message : 'falha a ler as areas')
                  })
              }}
            />
          </label>

          {rota.areas?.length ? (
            <button
              type="button"
              title="Retirar as areas de referencia do mapa"
              onClick={() => editor.alterarRota({ areas: [] })}
            >
              Sem area
            </button>
          ) : null}

          <label
            className={`botao-ficheiro ${topografia ? 'activo' : ''}`}
            title={
              topografia
                ? `Topografia activa: ${topografia.topografia.camadas.join(', ')}`
                : 'Importar topografia DXF em ETRS89 / PT-TM06'
            }
          >
            DXF
            <input
              type="file"
              accept=".dxf"
              hidden
              onChange={(evento) => {
                const ficheiro = evento.target.files?.[0]
                evento.target.value = ''
                if (!ficheiro) return
                void ficheiro
                  .text()
                  .then((texto) => {
                    const lida = lerDXF(texto)
                    setTopografia(new FonteTerrenoDXF(lida))
                    setAvisoTopografia(
                      `${ficheiro.name}: ${lida.triangulos.length} triangulos e ${lida.pontos.length} pontos cotados, nas camadas ${lida.camadas.join(', ')}`,
                    )
                  })
                  .catch((causa: unknown) => {
                    setTopografia(null)
                    setAvisoTopografia(
                      causa instanceof Error ? causa.message : 'nao foi possivel ler o DXF',
                    )
                  })
              }}
            />
          </label>
          <button
            type="button"
            title="Exportar KML para o Google Earth"
            disabled={rota.waypoints.length === 0}
            onClick={() => {
              // Uma excepcao aqui dentro sairia de um `onClick` sem ninguem a
              // apanha-la, e o que o utilizador via era o botao a nao fazer nada.
              try {
                const texto = exportarKML(rota, { cotas, chave: chaveDaPosicao })
                const url = URL.createObjectURL(
                  new Blob([texto], { type: 'application/vnd.google-earth.kml+xml' }),
                )
                const ligacao = document.createElement('a')
                ligacao.href = url
                ligacao.download = `${rota.nome.replace(/[^\w-]+/g, '-').toLowerCase()}.kml`
                document.body.appendChild(ligacao)
                ligacao.click()
                ligacao.remove()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
                setFalha(null)
              } catch (causa: unknown) {
                setFalha(causa instanceof Error ? causa.message : 'falha a exportar o KML')
              }
            }}
          >
            KML
          </button>
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
            className={voo.activo ? 'activo' : ''}
            title="Pilotar a aeronave pelo mapa e gravar waypoints com a atitude em que esta"
            onClick={() => {
              if (voo.activo) {
                voo.parar()
                return
              }
              const ultimo = rota.waypoints.at(-1)
              voo.arrancar({
                posicao: ultimo
                  ? { lat: ultimo.lat, lon: ultimo.lon }
                  : { lat: rota.pontoDescolagem.lat, lon: rota.pontoDescolagem.lon },
                altura: ultimo?.altura ?? 60,
                guinada: ultimo?.guinada ?? 0,
                gimbalPitch: ultimo?.gimbalPitch ?? -30,
                gimbalYaw: ultimo?.gimbalYaw ?? 0,
              })
            }}
          >
            Voo virtual
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
          aoCentrar={(id) => {
            const alvo = rota.waypoints.find((w) => w.id === id)
            if (!alvo) return
            setCentrarEm({ posicao: { lat: alvo.lat, lon: alvo.lon }, pedido: Date.now() })
            seleccao.seleccionar(id, false)
          }}
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
            enquadramento={enquadramento}
            seguir={voo.activo ? { posicao: voo.estado.posicao, guinada: voo.estado.guinada } : null}
            centrarEm={centrarEm}
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

          {alvoCamara ? (
            <VistaCamara
              posicao={alvoCamara.posicao}
              alturaASL={alvoCamara.alturaASL}
              enquadramento={enquadramento}
              aCarregar={enquadramentoACarregar}
              fovHorizontal={drone.camara.fovHorizontalGraus ?? 80}
              {...(voo.activo ? { aoApontar: voo.apontar } : {})}
            />
          ) : null}

          {voo.activo && alvoCamara ? (
            <HudVoo
              estado={voo.estado}
              modoAltitude={rota.modoAltitude}
              alturaASL={alvoCamara.alturaASL}
              cotaTerreno={cotas.get(chaveDaPosicao(voo.estado.posicao)) ?? null}
              aoGravar={voo.gravar}
              aoParar={voo.parar}
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
                    if (!alvo) return
                    seleccao.substituir([alvo.id])
                    setCentrarEm({ posicao: { lat: alvo.lat, lon: alvo.lon }, pedido: Date.now() })
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

                    // Leva a vista ao primeiro dos waypoints em causa.
                    const primeiro = indices[0] === undefined ? null : rota.waypoints[indices[0]]
                    if (primeiro) {
                      setCentrarEm({
                        posicao: { lat: primeiro.lat, lon: primeiro.lon },
                        pedido: Date.now(),
                      })
                    }
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
            {avisoTopografia ? (
              <span className={topografia ? 'modo-activo' : 'erro'}>{avisoTopografia}</span>
            ) : null}
            {falha ? <span className="erro">{falha}</span> : null}
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

/** Envolvente de todas as areas, na forma que o `fitBounds` do mapa espera. */
function envolventeDasAreas(areas: readonly Area[]): [[number, number], [number, number]] | null {
  const pontos = areas.flatMap((area) => area.contorno)
  const primeiro = pontos[0]
  if (!primeiro) return null

  let latMin = primeiro.lat
  let latMax = primeiro.lat
  let lonMin = primeiro.lon
  let lonMax = primeiro.lon
  for (const ponto of pontos) {
    latMin = Math.min(latMin, ponto.lat)
    latMax = Math.max(latMax, ponto.lat)
    lonMin = Math.min(lonMin, ponto.lon)
    lonMax = Math.max(lonMax, ponto.lon)
  }
  return [
    [lonMin, latMin],
    [lonMax, latMax],
  ]
}
