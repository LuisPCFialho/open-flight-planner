import { useCallback, useMemo, useRef, useState } from 'react'
import type { LatLon, ModoAltitude, Rota, TipoAccao } from './nucleo/tipos.ts'
import { calcularEstatisticas } from './nucleo/estatisticas.ts'
import { alturasAcimaDoSolo, converterModoAltitude, nivelarAcimaDoSolo } from './nucleo/altitude.ts'
import { calcularPerfil } from './nucleo/perfil.ts'
import { aplicarModoAosWaypoints } from './nucleo/camara-trajecto.ts'
import { AGL_MAXIMO, PASSO_COLISAO, temErros, validarRota } from './nucleo/validacoes.ts'
import {
  acrescentarWaypoint,
  alterarWaypoint,
  alterarWaypoints,
  inserirWaypoint,
  removerWaypoints,
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
import { repetirDeslocado, repetirEmSentidoContrario } from './nucleo/repeticao.ts'
import { acrescentarCobertura } from './nucleo/cobertura.ts'
import { dividirPorAutonomia } from './nucleo/baterias.ts'
import { chaveDaPosicao, useCotasTerreno } from './estado/useCotasTerreno.ts'
import { useEditorRota } from './estado/useEditorRota.ts'
import { useSeleccao } from './estado/useSeleccao.ts'
import { usePerfilTerreno } from './estado/usePerfilTerreno.ts'
import { useEnquadramento } from './estado/useEnquadramento.ts'
import { useVooVirtual, type EstadoVoo } from './estado/useVooVirtual.ts'
import { useReplay } from './estado/useReplay.ts'
import { useAtalhos } from './estado/useAtalhos.ts'
import { linhasDaRota, pontos3DdaRota } from './estado/derivados.ts'
import { usePersistenciaDaRota } from './estado/usePersistencia.ts'
import { useProjetoEmCurso } from './estado/useProjetoEmCurso.ts'
import {
  aeronaveDoReplay,
  aeronaveDoVoo,
  aeronaveNoPerfil,
  alvoDaCamara,
  arestasDoEnquadramento,
} from './estado/alvo-camara.ts'
import { FonteTerrariumAWS } from './terreno/terrarium.ts'
import { descodificarPNGBrowser } from './terreno/png-browser.ts'
import { FonteComposta, FonteTerrenoDXF } from './terreno/fonte-dxf.ts'
import { exportarKML } from './kmz/kml.ts'
import { descarregarTexto, nomeSeguro } from './descarregar.ts'
import { envolvente } from './nucleo/areas.ts'
import { armazem } from './dados/armazem.ts'
import { droneComId } from './drones.ts'
import { Mapa } from './mapa/Mapa.tsx'
import { LeituraCursor, useCanalCursor } from './ui/LeituraCursor.tsx'
import { Bussola, type Orientacao } from './ui/Bussola.tsx'
import { ControlosVista } from './ui/ControlosVista.tsx'
import { PainelCobertura } from './ui/PainelCobertura.tsx'
import { Regua } from './ui/Regua.tsx'
import { BotaoAreas, BotaoTopografia } from './ui/BotoesImportar.tsx'
import { BarraModos } from './ui/BarraModos.tsx'
import { useCanal } from './ui/canal.ts'
import { PuxadorPainel, useLarguraPersistida } from './ui/PuxadorPainel.tsx'
import { encolherPaineis, useLarguraDaJanela } from './ui/larguras.ts'
import type { PontoRota3D } from './mapa/camada-rota-3d.ts'
import type { DroneNoMapa } from './mapa/camada-drones.ts'
import { BarraEstatisticas } from './ui/BarraEstatisticas.tsx'
import { ListaWaypoints, type LinhaWaypoint } from './ui/ListaWaypoints.tsx'
import { PainelPropriedades, type AlteracaoWaypoint } from './ui/PainelPropriedades.tsx'
import { ConfiguracoesRota } from './ui/ConfiguracoesRota.tsx'
import { BarraFicheiro } from './ui/BarraFicheiro.tsx'
import { PerfilTerreno } from './ui/PerfilTerreno.tsx'
import { PainelValidacoes } from './ui/PainelValidacoes.tsx'
import { VistaCamara, type TamanhoCamara } from './ui/VistaCamara.tsx'
import { HudVoo } from './ui/HudVoo.tsx'
import { PlayerReplay } from './ui/PlayerReplay.tsx'
import { EcraProjetos } from './ui/EcraProjetos.tsx'
import { SelectorRota } from './ui/SelectorRota.tsx'

/** Sever do Vouga: o ponto de descolagem da rota de referencia. */
const CENTRO_INICIAL: LatLon = { lat: 40.746552, lon: -8.41061 }

/** O que a barra de estado diz enquanto um modo de clique esta ligado. */
const AJUDA_DO_MODO: Record<'waypoint' | 'poi' | 'medir', string> = {
  waypoint: 'Clica no mapa para acrescentar waypoints. Escape para sair.',
  poi: 'Clica no mapa para criar um ponto de interesse.',
  medir: 'Clica no mapa para medir. Escape para sair.',
}

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
        setFalha(causa instanceof Error ? causa.message : 'a operação falhou')
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

  /*
   * O relevo entra ligado.
   *
   * O que se planeia aqui sao voos a altura constante acima do solo sobre
   * encostas: em planta, uma rota que passa rente a um cabeco e uma rota que
   * passa a cem metros dele desenham-se igual. O relevo e a unica vista em que
   * essa diferenca se ve, e nao vale a pena esconde-la atras de um botao.
   */
  const [modo3D, setModo3D] = useState(true)
  const [rotaVisivel, setRotaVisivel] = useState(true)
  const [tamanhoCamara, setTamanhoCamara] = useState<TamanhoCamara>('normal')
  /**
   * O que um clique no mapa faz.
   *
   * `navegar` e o estado de repouso e nao cria nada: o botao esquerdo serve
   * para deslocar a vista e escolher waypoints, e mais nada. Antes qualquer
   * clique em qualquer sitio deixava la um waypoint, o que enche uma rota de
   * pontos por engano so de andar a olhar para o terreno.
   *
   * Os modos sao exclusivos de proposito: ligar um desliga os outros, e assim
   * ha sempre uma so resposta a pergunta "o que acontece se eu clicar aqui".
   */
  const [modoMapa, setModoMapa] = useState<'navegar' | 'waypoint' | 'poi' | 'medir'>('navegar')
  const [configuracoesAbertas, setConfiguracoesAbertas] = useState(false)
  const [abaInferior, setAbaInferior] = useState<'perfil' | 'validacoes' | null>('perfil')
  const [registoFotografico, setRegistoFotografico] = useState(false)
  /*
   * A leitura sob o cursor vive fora do estado da aplicacao.
   *
   * Em `useState`, cada movimento do rato renderizava toda a arvore para mudar
   * tres numeros na barra de estado, e isso sozinho custava metade do
   * orcamento de cada fotograma. Ver `LeituraCursor`.
   */
  const canalCursor = useCanalCursor()
  /** Orientacao do mapa, pelo mesmo caminho e pela mesma razao que o cursor. */
  const canalOrientacao = useCanal<Orientacao>({ rumo: 0, inclinacao: 0 })
  const [pedidoDeNorte, setPedidoDeNorte] = useState(0)
  const [coberturaAberta, setCoberturaAberta] = useState(false)
  /**
   * A regua vive fora da rota e fora do historico.
   *
   * E um instrumento de medida, nao parte do plano: nao se exporta, nao se
   * grava, e desfazer nao deve apagar pontos de medicao quando o que se queria
   * era desfazer uma alteracao a rota.
   */
  const [medicao, setMedicao] = useState<readonly LatLon[]>([])
  const [sombreado, setSombreado] = useState(true)
  const [larguraEsquerda, setLarguraEsquerda] = useLarguraPersistida('painel-esquerdo', 240)
  const [larguraDireita, setLarguraDireita] = useLarguraPersistida('painel-direito', 300)

  /*
   * As larguras guardadas sao uma preferencia, e uma preferencia escolhida num
   * ecra grande nao serve num pequeno. Numa janela estreita os paineis sao
   * apertados para o mapa ficar com espaco util; alargar a janela devolve a
   * largura escolhida, sem ninguem ter de arrastar outra vez.
   */
  const paineis = encolherPaineis(useLarguraDaJanela(), {
    esquerda: larguraEsquerda,
    direita: larguraDireita,
  })
  const [erroMapa, setErroMapa] = useState<string | null>(null)

  // --- arranque: recupera a ultima rota ou cria uma nova ---------------------
  const { erro: arranque } = useProjetoEmCurso({
    projetoAberto,
    rotaAberta,
    centroInicial: CENTRO_INICIAL,
    fonteTerreno,
    carregar,
    aoAbrirRota: setRotaAberta,
  })

  /*
   * Gravar a rota, com folga, e a pedido antes de trocar de rota.
   *
   * Sem a gravacao a pedido, trocar de rota dentro da folga perdia a ultima
   * edicao sem uma palavra. O detalhe esta em `usePersistencia`.
   */
  const { gravarPendente, esquecerPendente } = usePersistenciaDaRota(rota, armazem.gravarRota)

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

  const linhas = useMemo<LinhaWaypoint[]>(
    () => (rota ? linhasDaRota(rota, cotas, alturasAGL, fonteTerreno) : []),
    [rota, cotas, alturasAGL, fonteTerreno],
  )

  const pontos3D = useMemo<PontoRota3D[]>(
    () => (rota ? pontos3DdaRota(rota, linhas, seleccao.ids) : []),
    [rota, linhas, seleccao.ids],
  )

  /**
   * Intervalo aceite acima do solo. O minimo e da rota; o tecto e o legal.
   *
   * Memorizado porque vai para o mapa e decide a cor de cada troço: um objecto
   * novo a cada render punha a geometria a ser reconstruida sem nada ter mudado.
   */
  const intervaloAGL = useMemo(
    () => ({ minimo: rota?.alturaMinimaAcimaDoSolo ?? 30, maximo: AGL_MAXIMO }),
    [rota?.alturaMinimaAcimaDoSolo],
  )

  const estatisticas = useMemo(() => (rota ? calcularEstatisticas(rota) : null), [rota])
  const drone = useMemo(() => (rota ? droneComId(rota.droneId) : null), [rota])

  /**
   * Em quantos voos esta rota se divide, e onde.
   *
   * A validacao ja dizia que a rota nao cabe na autonomia e ficava por ali. O
   * que falta a seguir e sempre o mesmo trabalho: descobrir onde cortar, e
   * cortar.
   */
  const divisao = useMemo(
    () => (rota && drone ? dividirPorAutonomia(rota, drone) : null),
    [rota, drone],
  )

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

  const replay = useReplay(rota)

  /** Quem manda na camara, por ordem: o leitor, o voo virtual, a seleccao. */
  const comandoDaCamara = useMemo(
    () => ({
      replay: replay.activo ? replay.estado : null,
      voo: voo.activo ? voo.estado : null,
      seleccionado: seleccao.waypoints.length === 1 ? (seleccao.waypoints[0] ?? null) : null,
    }),
    [replay.activo, replay.estado, voo.activo, voo.estado, seleccao.waypoints],
  )

  const alvoCamara = useMemo(
    () => (rota ? alvoDaCamara(rota, cotas, comandoDaCamara) : null),
    [rota, cotas, comandoDaCamara],
  )

  /**
   * A aeronave desenhada no mapa: a do leitor, ou a do voo virtual.
   *
   * Nunca as duas: sao duas aeronaves no mesmo sitio, e abrir uma para a outra.
   */
  const aeronaveNoMapa = useMemo<DroneNoMapa | null>(() => {
    if (!alvoCamara) return null
    if (comandoDaCamara.replay) return aeronaveDoReplay(comandoDaCamara.replay, alvoCamara.alturaASL)
    if (comandoDaCamara.voo) return aeronaveDoVoo(comandoDaCamara.voo, alvoCamara.alturaASL)
    return null
  }, [comandoDaCamara.replay, comandoDaCamara.voo, alvoCamara])

  const aeronaveNoCorte = useMemo(
    () =>
      perfil && comandoDaCamara.replay && alvoCamara
        ? aeronaveNoPerfil(perfil, comandoDaCamara.replay, alvoCamara.alturaASL)
        : null,
    [perfil, comandoDaCamara.replay, alvoCamara],
  )

  const { enquadramento, aCarregar: enquadramentoACarregar } = useEnquadramento(
    alvoCamara,
    drone ?? droneComId('mini5pro'),
    fonteMosaicos,
  )

  /**
   * A piramide do enquadramento, em 3D.
   *
   * O poligono no chao ja dizia o que a camara apanha; as arestas dizem de que
   * altura e com que inclinacao - um poligono igual pode vir de um voo rasante
   * ou de um voo alto a olhar para baixo.
   */
  const arestasEnquadramento = useMemo(
    () => (alvoCamara ? arestasDoEnquadramento(alvoCamara, enquadramento) : []),
    [alvoCamara, enquadramento],
  )

  /** Liga o modo, ou volta a navegar se ele ja estiver ligado. */
  const alternarModo = useCallback((modo: 'waypoint' | 'poi' | 'medir') => {
    setModoMapa((actual) => {
      const proximo = actual === modo ? 'navegar' : modo
      // Sair da regua limpa o que estava medido; deixar la ficava a pairar.
      if (actual === 'medir' && proximo !== 'medir') setMedicao([])
      return proximo
    })
  }, [])

  // --- alteracoes -----------------------------------------------------------
  const aoClicarNoMapa = useCallback(
    (lat: number, lon: number) => {
      if (modoMapa === 'medir') {
        setMedicao((anteriores) => [...anteriores, { lat, lon }])
        return
      }

      if (modoMapa === 'poi') {
        aplicar((atual) =>
          acrescentarPOI(
            atual,
            poiNovo({ lat, lon, altura: alturaPredefinida(atual), nome: `POI ${atual.pois.length + 1}` }),
          ),
        )
        // Um POI de cada vez: marca-se e volta-se a navegar.
        setModoMapa('navegar')
        return
      }

      if (modoMapa === 'waypoint') {
        aplicar((atual) =>
          acrescentarWaypoint(
            atual,
            waypointNovo({ lat, lon, altura: alturaPredefinida(atual), index: atual.waypoints.length }),
          ),
        )
      }
    },
    [aplicar, modoMapa],
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
  useAtalhos(
    {
      desfazer: editor.desfazer,
      refazer: editor.refazer,
      fotografar: () => {
        if (seleccao.ids.size > 0) acrescentarAccao('tirarFoto')
      },
      eliminar: eliminarSeleccionados,
      escapar: () => {
        // Escape volta sempre a navegar, seja qual for o modo em curso.
        setModoMapa('navegar')
        setConfiguracoesAbertas(false)
        seleccao.limpar()
      },
      mover: seleccao.mover,
    },
    voo.activo,
  )

  if (!projetoAberto) {
    return <EcraProjetos aoAbrir={setProjetoAberto} />
  }

  if (arranque) {
    return (
      <div className="aviso-arranque">
        <h1>Não foi possível abrir o projeto</h1>
        <p>{arranque}</p>
      </div>
    )
  }

  if (!rota || !estatisticas || !drone) {
    return <div className="aviso-arranque">A abrir o projeto local...</div>
  }

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
            Configurações de rota de voo
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
              tentar(armazem.renomearRota(rota.id, nome))
              editor.alterarRota({ nome })
            }}
            aoCriar={() => {
              gravarPendente()
              voo.parar()
              tentar(
                armazem.criarRota({
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
              tentar(armazem.duplicarRota(rota.id), (copia) => {
                seleccao.limpar()
                setRotaAberta(copia.id)
              })
            }}
            aoApagar={() => {
              // Nada de gravar o que se vai apagar: a gravacao pendente e desta
              // rota, e deixa-la correr podia repo-la depois de apagada.
              esquecerPendente()
              voo.parar()
              tentar(
                armazem
                  .apagarRota(rota.id)
                  .then(() => armazem.listarRotas(rota.projetoId)),
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
                ? `${validacoes.filter((v) => v.severidade === 'erro').length} erro(s) de validação impedem a exportação`
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
            title="Voltar à lista de projetos"
            onClick={() => {
              gravarPendente()
              voo.parar()
              setRotaAberta(null)
              setProjetoAberto(null)
            }}
          >
            Projetos
          </button>
          <BotaoAreas
            areas={rota.areas}
            aoFalhar={setFalha}
            aoImportar={({ areas, resumo, centro, caixa }) => {
              editor.alterarRota({ areas })
              setFalha(null)
              setAvisoTopografia(resumo)
              if (centro) {
                setCentrarEm({
                  posicao: centro,
                  pedido: Date.now(),
                  ...(caixa ? { envolvente: caixa } : {}),
                })
              }
            }}
          />

          {divisao && divisao.trocos.length > 1 ? (
            <button
              type="button"
              title={`A rota não cabe numa bateria. Divide-se em ${divisao.trocos.length} voos, cada um com a sua ida e regresso, e cada um fica uma rota deste projeto.`}
              onClick={() => {
                gravarPendente()
                voo.parar()
                tentar(armazem.gravarTrocos(divisao.trocos), (novas) => {
                  seleccao.limpar()
                  const primeira = novas[0]
                  if (primeira) setRotaAberta(primeira.id)
                  setAvisoTopografia(
                    `${novas.length} voos criados a partir de "${rota.nome}". A rota original fica como estava.`,
                  )
                })
              }}
            >
              {divisao.trocos.length} baterias
            </button>
          ) : null}

          {rota.areas?.length ? (
            <button
              type="button"
              className={coberturaAberta ? 'activo' : ''}
              title="Gerar as passagens que cobrem a área importada"
              onClick={() => setCoberturaAberta((aberto) => !aberto)}
            >
              Cobrir
            </button>
          ) : null}

          {rota.areas?.length ? (
            <button
              type="button"
              title="Retirar as áreas de referência do mapa"
              onClick={() => editor.alterarRota({ areas: [] })}
            >
              Sem área
            </button>
          ) : null}

          <BotaoTopografia
            topografia={topografia}
            aoImportar={(fonte, resumo) => {
              setTopografia(fonte)
              setAvisoTopografia(resumo)
            }}
            aoFalhar={(mensagem) => {
              setTopografia(null)
              setAvisoTopografia(mensagem)
            }}
          />
          <button
            type="button"
            title="Exportar KML para o Google Earth"
            disabled={rota.waypoints.length === 0}
            onClick={() => {
              // Uma excepcao aqui dentro sairia de um `onClick` sem ninguem a
              // apanha-la, e o que o utilizador via era o botao a nao fazer nada.
              try {
                descarregarTexto(
                  exportarKML(rota, { cotas, chave: chaveDaPosicao }),
                  nomeSeguro(rota.nome, 'kml', 'rota'),
                  'application/vnd.google-earth.kml+xml',
                )
                setFalha(null)
              } catch (causa: unknown) {
                setFalha(causa instanceof Error ? causa.message : 'falha a exportar o KML')
              }
            }}
          >
            KML
          </button>
          <BarraModos
            rota={rota}
            modoMapa={modoMapa}
            aoAlternarModo={alternarModo}
            voo={voo}
            replay={replay}
            modo3D={modo3D}
            aoAlternar3D={() => setModo3D((v) => !v)}
            podeDesfazer={editor.podeDesfazer}
            podeRefazer={editor.podeRefazer}
            aoDesfazer={editor.desfazer}
            aoRefazer={editor.refazer}
          />
        </div>
      </header>

      <main
        className="corpo"
        style={{
          gridTemplateColumns: `${paineis.esquerda}px 5px minmax(0, 1fr) 5px ${paineis.direita}px`,
        }}
      >
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

        <PuxadorPainel
          lado="esquerda"
          largura={paineis.esquerda}
          aoRedimensionar={setLarguraEsquerda}
          rotulo="Largura da lista de trajetórias"
        />

        <section className="zona-mapa">
          <div className="vista-mapa">
            <Mapa
              rota={rota}
              pontos3D={pontos3D}
              aeronave={aeronaveNoMapa}
              arestasEnquadramento={arestasEnquadramento}
            intervaloAcimaDoSolo={intervaloAGL}
            sombreado={sombreado}
            medicao={medicao}
              seleccionados={seleccao.ids}
              modo3D={modo3D}
              modoMapa={modoMapa}
              enquadramento={enquadramento}
              seguir={
                replay.activo && replay.estado
                  ? { posicao: replay.estado.posicao }
                  : voo.activo
                    ? { posicao: voo.estado.posicao }
                    : null
              }
              centrarEm={centrarEm}
              aoMudarVisibilidadeDaRota={setRotaVisivel}
              aoEliminarWaypoint={(id) => {
                aplicar((atual) => removerWaypoints(atual, [id]))
                seleccao.limpar()
              }}
              centroInicial={CENTRO_INICIAL}
              aoClicarNoMapa={aoClicarNoMapa}
              aoInserirWaypoint={aoInserirWaypoint}
              aoMoverWaypoint={aoMoverWaypoint}
              aoSeleccionar={(id, juntar) => seleccao.seleccionar(id, juntar)}
              aoMoverCursor={canalCursor.escrever}
            aoMudarOrientacao={canalOrientacao.escrever}
            apontarANorte={pedidoDeNorte}
              aoRemoverPOI={(id) => aplicar((atual) => removerPOI(atual, id))}
              aoErro={setErroMapa}
            />

            <Bussola canal={canalOrientacao} aoApontarANorte={() => setPedidoDeNorte(Date.now())} />

            <ControlosVista sombreado={sombreado} aoMudarSombreado={setSombreado} />

            {coberturaAberta && (rota.areas ?? []).length > 0 && drone ? (
              <PainelCobertura
                areas={rota.areas ?? []}
                drone={drone}
                waypointsExistentes={rota.waypoints.length}
                modoAltitude={rota.modoAltitude}
                aoMudarParaAGL={() => mudarModoAltitude('AGL')}
                aoGerar={(cobertura, opcoesCobertura) => {
                  aplicar((atual) =>
                    acrescentarCobertura(atual, cobertura, {
                      alturaAcimaDoSolo: opcoesCobertura.alturaAcimaDoSolo,
                      comFoto: opcoesCobertura.umPontoPorFoto,
                    }),
                  )
                  // Uma cobertura com fotos e um registo fotografico: liga-se a
                  // validacao que avisa de pontos que fiquem sem a sua foto.
                  if (opcoesCobertura.umPontoPorFoto) setRegistoFotografico(true)
                  seleccao.limpar()
                  setCoberturaAberta(false)
                }}
                aoFechar={() => setCoberturaAberta(false)}
              />
            ) : null}

            {configuracoesAbertas ? (
              <ConfiguracoesRota
                rota={rota}
                drone={drone}
                impedimentoConversao={impedimentoConversao}
                aoAlterarRota={editor.alterarRota}
                aoMudarModoAltitude={mudarModoAltitude}
                aoFixarCamaraNosWaypoints={() =>
                  aplicar((atual) => aplicarModoAosWaypoints(atual, atual.modoCamaraTrajecto))
                }
                aoFechar={() => setConfiguracoesAbertas(false)}
              />
            ) : null}

            {/*
              * Perdeu-se a rota de vista: oferece-se o caminho de volta.
              *
              * Navegar em 3D leva mais longe do que se pensa, e sem isto so se
              * volta procurando o sitio outra vez a mao.
              */}
            {!rotaVisivel && rota.waypoints.length > 0 && !voo.activo ? (
              <button
                type="button"
                className="voltar-a-rota"
                title="A rota ficou fora da vista"
                onClick={() => {
                  const caixa = envolvente(rota.waypoints)
                  const primeiro = rota.waypoints[0]
                  if (!primeiro) return
                  setCentrarEm({
                    posicao: { lat: primeiro.lat, lon: primeiro.lon },
                    pedido: Date.now(),
                    ...(caixa ? { envolvente: caixa } : {}),
                  })
                }}
              >
                Centrar na rota
              </button>
            ) : null}

            {alvoCamara ? (
              <VistaCamara
              areas={rota.areas}
                posicao={alvoCamara.posicao}
                alturaASL={alvoCamara.alturaASL}
                enquadramento={enquadramento}
                aCarregar={enquadramentoACarregar}
                fovHorizontal={drone.camara.fovHorizontalGraus ?? 80}
                tamanho={tamanhoCamara}
                aoMudarTamanho={setTamanhoCamara}
                {...(voo.activo ? { aoApontar: voo.apontar } : {})}
              />
            ) : null}

            {voo.activo && alvoCamara ? (
              <HudVoo
                estado={voo.estado}
                modoAltitude={rota.modoAltitude}
                alturaASL={alvoCamara.alturaASL}
                cotaTerreno={cotas.get(chaveDaPosicao(voo.estado.posicao)) ?? null}
                velocidade={voo.velocidade}
                aoAlterarVelocidade={voo.alterarVelocidade}
                aoGravar={voo.gravar}
                aoParar={voo.parar}
              />
            ) : null}

            {/*
              * As barras que flutuam sobre o mapa empilham-se em vez de se
              * sobreporem: o leitor e a regua sao para usar ao mesmo tempo -
              * mede-se uma distancia com a aeronave parada onde interessa - e
              * ambos moravam no mesmo sitio do ecra.
              */}
            {replay.activo || modoMapa === 'medir' ? (
              <div className="barras-flutuantes">
                {modoMapa === 'medir' ? (
                  <Regua
                    pontos={medicao}
                    aoDesfazerPonto={() => setMedicao((pontos) => pontos.slice(0, -1))}
                    aoLimpar={() => setMedicao([])}
                    aoFechar={() => alternarModo('medir')}
                  />
                ) : null}
                {replay.activo ? (
                  <PlayerReplay replay={replay} totalWaypoints={rota.waypoints.length} />
                ) : null}
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
              {modoMapa !== 'navegar' ? (
                <span className="modo-activo">{AJUDA_DO_MODO[modoMapa]}</span>
              ) : null}
              {avisoTopografia ? (
                <span className={topografia ? 'modo-activo' : 'erro'}>{avisoTopografia}</span>
              ) : null}
              {falha ? <span className="erro">{falha}</span> : null}
              <LeituraCursor canal={canalCursor} ondulacaoGeoide={rota.ondulacaoGeoide} />
              <span>WGS 84</span>
            </div>
          </div>

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
                  Validações
                  {validacoes.length > 0 ? (
                    <span className="contador numerico">{validacoes.length}</span>
                  ) : null}
                </button>
                <label className="interruptor" title="Espera-se acção de foto em cada waypoint">
                  <input
                    type="checkbox"
                    checked={registoFotografico}
                    onChange={(e) => setRegistoFotografico(e.target.checked)}
                  />
                  Registo fotográfico
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
                  aeronave={aeronaveNoCorte}
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
        </section>

        <PuxadorPainel
          lado="direita"
          largura={paineis.direita}
          aoRedimensionar={setLarguraDireita}
          rotulo="Largura do painel de propriedades"
        />

        <PainelPropriedades
          rota={rota}
          drone={drone}
          seleccionados={seleccao.waypoints}
          alturasAcimaDoSolo={aglSeleccionados}
          aoAlterar={alterarSeleccionados}
          aoIncrementarAltura={incrementarAltura}
          aoRepetirDeslocado={(opcoes) => {
            aplicar((atual) => repetirDeslocado(atual, seleccao.ids, opcoes))
          }}
          aoRepetirEmSentidoContrario={() => {
            aplicar((atual) => repetirEmSentidoContrario(atual, seleccao.ids))
          }}
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

