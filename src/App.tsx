import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LatLon, ModoAltitude, Rota, TipoAccao } from './nucleo/tipos.ts'
import { paraASL } from './nucleo/geodesia.ts'
import { calcularEstatisticas } from './nucleo/estatisticas.ts'
import { alturasAcimaDoSolo, converterModoAltitude, nivelarAcimaDoSolo } from './nucleo/altitude.ts'
import { calcularPerfil } from './nucleo/perfil.ts'
import {
  aplicarModoAosWaypoints,
  atitudeNoWaypoint,
  guinadaEfectiva,
} from './nucleo/camara-trajecto.ts'
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
import { repetirDeslocado, repetirEmSentidoContrario } from './nucleo/repeticao.ts'
import { acrescentarCobertura } from './nucleo/cobertura.ts'
import { chaveDaPosicao, useCotasTerreno } from './estado/useCotasTerreno.ts'
import { useEditorRota } from './estado/useEditorRota.ts'
import { useSeleccao } from './estado/useSeleccao.ts'
import { usePerfilTerreno } from './estado/usePerfilTerreno.ts'
import { useEnquadramento } from './estado/useEnquadramento.ts'
import { useVooVirtual, type EstadoVoo } from './estado/useVooVirtual.ts'
import { useReplay } from './estado/useReplay.ts'
import { FonteTerrariumAWS } from './terreno/terrarium.ts'
import { descodificarPNGBrowser } from './terreno/png-browser.ts'
import { FonteComposta, FonteTerrenoDXF } from './terreno/fonte-dxf.ts'
import { lerDXF } from './terreno/dxf.ts'
import { exportarKML } from './kmz/kml.ts'
import { importarAreas } from './kmz/ficheiro.ts'
import { areaDoContorno, centroDasAreas, envolvente, formatarArea } from './nucleo/areas.ts'
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
import { Mapa } from './mapa/Mapa.tsx'
import { LeituraCursor, useCanalCursor } from './ui/LeituraCursor.tsx'
import { Bussola, type Orientacao } from './ui/Bussola.tsx'
import { ControlosVista } from './ui/ControlosVista.tsx'
import { PainelCobertura } from './ui/PainelCobertura.tsx'
import { Regua } from './ui/Regua.tsx'
import { useCanal } from './ui/canal.ts'
import { PuxadorPainel, useLarguraPersistida } from './ui/PuxadorPainel.tsx'
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
import { IconeDesfazer, IconeRefazer, IconeTerreno } from './ui/icones.tsx'

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

  const [modo3D, setModo3D] = useState(false)
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
  const [exageroVertical, setExageroVertical] = useState(1)
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
    for (const [i, linha] of linhas.entries()) {
      if (linha.cotaTerreno === null) continue
      /*
       * Os angulos vem do modo de camara da rota, e nao so do que esta gravado
       * no waypoint. E o que faz o aparelho desenhado no mapa mostrar o que a
       * camara vai mesmo fazer quando se escolhe seguir o proximo waypoint ou
       * olhar para o terreno.
       */
      const atitude = atitudeNoWaypoint(rota, i)
      pontos.push({
        lat: linha.waypoint.lat,
        lon: linha.waypoint.lon,
        alturaVoo: paraASL(linha.waypoint.altura, rota.modoAltitude, {
          cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
          cotaTerreno: linha.cotaTerreno,
        }),
        cotaTerreno: linha.cotaTerreno,
        guinada: atitude.guinada,
        gimbalPitch: atitude.gimbalPitch,
        gimbalYaw: atitude.gimbalYaw,
        seleccionado: seleccao.ids.has(linha.waypoint.id),
        alerta: linha.alerta,
        /*
         * O aparelho so se desenha onde o utilizador escolheu. Em todos os
         * waypoints enchia o mapa: numa rota de cobertura sao dezenas,
         * sobrepostos, e o que se via era um tapete de aparelhos em vez do
         * terreno que se anda a estudar.
         */
        comAparelho: seleccao.ids.has(linha.waypoint.id),
      })
    }
    return pontos
  }, [rota, linhas, seleccao.ids])

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

  /**
   * Alvo da vista de camara, por ordem de quem manda: a aeronave do leitor, a
   * do voo virtual, ou o waypoint seleccionado.
   */
  const alvoCamara = useMemo(() => {
    if (!rota) return null

    if (replay.activo && replay.estado) {
      const estadoReplay = replay.estado
      /*
       * A cota sob a aeronave interpola-se entre a dos dois waypoints do troco.
       * As cotas conhecidas sao as dos waypoints, e a meio do caminho nao ha
       * nenhuma; o erro e o desvio do terreno em relacao a recta que os une, e
       * para saber para onde a camara olha isso chega.
       */
      const daqui = rota.waypoints[estadoReplay.indice]
      const ali = rota.waypoints[estadoReplay.indice + 1]
      const cotaDaqui = daqui ? cotas.get(chaveDaPosicao(daqui)) : undefined
      const cotaAli = ali ? cotas.get(chaveDaPosicao(ali)) : undefined
      const cota =
        cotaDaqui === undefined
          ? rota.pontoDescolagem.cotaTerreno
          : cotaAli === undefined
            ? cotaDaqui
            : cotaDaqui + (cotaAli - cotaDaqui) * estadoReplay.fraccao

      return {
        posicao: estadoReplay.posicao,
        alturaASL: paraASL(estadoReplay.altura, rota.modoAltitude, {
          cotaDescolagem: rota.pontoDescolagem.cotaTerreno,
          cotaTerreno: cota,
        }),
        guinada: estadoReplay.atitude.guinada,
        gimbalPitch: estadoReplay.atitude.gimbalPitch,
        gimbalYaw: estadoReplay.atitude.gimbalYaw,
      }
    }

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
      // O rumo sai do modo de guinada, e nao do campo: em `followWayline` o
      // campo esta por preencher e lia-se zero, ou seja a previsao mostrava o
      // que estava a norte em vez do que a foto ia apanhar.
      guinada: guinadaEfectiva(rota, waypoint.index),
      gimbalPitch: waypoint.gimbalPitch,
      // A previsao de um waypoint ignorava a rotacao do gimbal e mostrava o que
      // a aeronave tinha pela frente, que nao e o que a foto vai apanhar.
      gimbalYaw: waypoint.gimbalYaw,
    }
  }, [rota, replay.activo, replay.estado, voo.activo, voo.estado, seleccao.waypoints, cotas])

  /**
   * A aeronave do leitor, desenhada em 3D a percorrer a rota.
   *
   * Vem a parte dos waypoints: metida nos pontos da rota, o troco de voo
   * passaria por ela e a linha ficava com um desvio que nao existe.
   */
  const aeronaveDoReplay = useMemo<DroneNoMapa | null>(() => {
    if (!rota || !replay.activo || !replay.estado || !alvoCamara) return null
    const estadoReplay = replay.estado

    return {
      lat: estadoReplay.posicao.lat,
      lon: estadoReplay.posicao.lon,
      alturaVoo: alvoCamara.alturaASL,
      guinada: estadoReplay.atitude.guinada,
      gimbalPitch: estadoReplay.atitude.gimbalPitch,
      gimbalYaw: estadoReplay.atitude.gimbalYaw,
      seleccionado: false,
      alerta: false,
      comAparelho: true,
      // Maior e pintada de verde, para nao se confundir com os waypoints por
      // onde passa.
      aumento: 1.7,
      tinta: [0.31, 0.85, 0.45, 0.55],
    }
  }, [rota, replay.activo, replay.estado, alvoCamara])

  /**
   * Onde a aeronave do leitor cai no corte do terreno.
   *
   * O percurso sai do proprio perfil, e nao de uma conta paralela: o troco e
   * percorrido a velocidade constante, portanto a fraccao de tempo dentro dele
   * e a mesma fraccao de distancia.
   */
  const aeronaveNoPerfil = useMemo(() => {
    if (!perfil || !replay.activo || !replay.estado || !alvoCamara) return null
    const estadoReplay = replay.estado

    const daqui = perfil.waypoints.find((m) => m.indice === estadoReplay.indice)
    if (!daqui) return null
    const ali = perfil.waypoints.find((m) => m.indice === estadoReplay.indice + 1)

    const percurso =
      ali && !estadoReplay.parada
        ? daqui.percurso + (ali.percurso - daqui.percurso) * estadoReplay.fraccao
        : daqui.percurso

    return { percurso, aslVoo: alvoCamara.alturaASL }
  }, [perfil, replay.activo, replay.estado, alvoCamara])

  const { enquadramento, aCarregar: enquadramentoACarregar } = useEnquadramento(
    alvoCamara,
    drone ?? droneComId('mini5pro'),
    fonteMosaicos,
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
        // Escape volta sempre a navegar, seja qual for o modo em curso.
        setModoMapa('navegar')
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
          <label
            className={`botao-ficheiro ${rota.areas?.length ? 'activo' : ''}`}
            title={
              rota.areas?.length
                ? `${rota.areas.length} área(s) de referência, ${formatarArea(rota.areas.reduce((total, a) => total + areaDoContorno(a.contorno), 0))} no total. Importar de novo substitui.`
                : 'Importar KMZ ou KML com polígonos, para ter no mapa o contorno da área a filmar'
            }
          >
            Área
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
                        `${ficheiro.name}: ${areas.length} área(s), ${formatarArea(total)}`,
                        ...avisos,
                      ].join('. '),
                    )

                    // Leva a vista ate la, com a area toda enquadrada: o
                    // ficheiro importado e quase sempre de outro sitio do mapa.
                    const centro = centroDasAreas(areas)
                    const caixa = envolvente(areas.flatMap((a) => a.contorno))
                    if (centro) {
                      setCentrarEm({
                        posicao: centro,
                        pedido: Date.now(),
                        ...(caixa ? { envolvente: caixa } : {}),
                      })
                    }
                  })
                  .catch((causa: unknown) => {
                    setFalha(causa instanceof Error ? causa.message : 'falha a ler as áreas')
                  })
              }}
            />
          </label>

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
                      causa instanceof Error ? causa.message : 'não foi possível ler o DXF',
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
            className={modoMapa === 'waypoint' ? 'activo' : ''}
            title="Enquanto estiver ligado, clicar no mapa acrescenta um waypoint. Alt e clique num troço insere no meio."
            onClick={() => alternarModo('waypoint')}
          >
            Criar waypoints
          </button>
          <button
            type="button"
            className={modoMapa === 'poi' ? 'activo' : ''}
            title="Clicar no mapa cria um ponto de interesse"
            onClick={() => alternarModo('poi')}
          >
            POI
          </button>
          <button
            type="button"
            className={modoMapa === 'medir' ? 'activo' : ''}
            title="Medir distâncias e áreas no mapa, sem mexer na rota"
            onClick={() => alternarModo('medir')}
          >
            Medir
          </button>
          <button
            type="button"
            className={voo.activo ? 'activo' : ''}
            title="Pilotar a aeronave pelo mapa e gravar waypoints com a atitude em que está"
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
            className={replay.activo ? 'activo' : ''}
            disabled={rota.waypoints.length < 2}
            title="Percorrer a rota no tempo, para ver o voo antes de o fazer"
            onClick={() => {
              if (replay.activo) {
                replay.fechar()
                return
              }
              // Os dois não correm ao mesmo tempo: são duas aeronaves no mesmo sítio.
              if (voo.activo) voo.parar()
              replay.abrir()
            }}
          >
            Replay
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

      <main
        className="corpo"
        style={{
          gridTemplateColumns: `${larguraEsquerda}px 5px minmax(0, 1fr) 5px ${larguraDireita}px`,
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
          largura={larguraEsquerda}
          aoRedimensionar={setLarguraEsquerda}
          rotulo="Largura da lista de trajetórias"
        />

        <section className="zona-mapa">
          <div className="vista-mapa">
            <Mapa
              rota={rota}
              pontos3D={pontos3D}
              aeronave={aeronaveDoReplay}
            intervaloAcimaDoSolo={intervaloAGL}
            exageroVertical={exageroVertical}
            sombreado={sombreado}
            medicao={medicao}
              seleccionados={seleccao.ids}
              modo3D={modo3D}
              modoMapa={modoMapa}
              enquadramento={enquadramento}
              seguir={
                replay.activo && replay.estado
                  ? {
                      posicao: replay.estado.posicao,
                      guinada: replay.estado.atitude.guinada,
                    }
                  : voo.activo
                    ? { posicao: voo.estado.posicao, guinada: voo.estado.guinada }
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

            <ControlosVista
              modo3D={modo3D}
              exageroVertical={exageroVertical}
              aoMudarExagero={setExageroVertical}
              sombreado={sombreado}
              aoMudarSombreado={setSombreado}
            />

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
                  Validacoes
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
                  aeronave={aeronaveNoPerfil}
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
          largura={larguraDireita}
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

