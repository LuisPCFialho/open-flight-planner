import { useMemo, useState } from 'react'
import { resolucaoNoTerreno } from '../nucleo/resolucao.ts'
import type { Area, Drone, ModoAltitude } from '../nucleo/tipos.ts'
import {
  gerarCobertura,
  rumoDoLadoMaisLongo,
  type Cobertura,
  type OpcoesCobertura,
} from '../nucleo/cobertura.ts'
import { areaDoContorno, formatarArea } from '../nucleo/areas.ts'
import { formatarDistancia } from '../nucleo/medicao.ts'
import { CampoNumerico, CampoSelecao } from './campos.tsx'

/**
 * Gerar a rota que cobre uma área importada.
 *
 * Importar o limite da parcela e ficar a olhar para ele não adianta nada: o que
 * se quer a seguir é a rota que o cobre. À mão são dezenas de waypoints
 * alinhados a olho, com o espaçamento certo, e depois outra vez para a parcela
 * do lado.
 *
 * O espaçamento não se escolhe aqui, e é de propósito: sai da câmara e da
 * altura. O que se decide é a altura e a sobreposição, que é como um
 * levantamento se especifica.
 */

type Props = {
  areas: readonly Area[]
  drone: Drone
  /** Waypoints que a rota já tem, porque a cobertura é acrescentada no fim. */
  waypointsExistentes: number
  /**
   * Modo de altitude da rota.
   *
   * A cobertura só faz sentido em AGL: o espaçamento sai da altura acima do
   * solo, e num terreno com relevo a mesma cota absoluta dá faixas de larguras
   * diferentes a cada passagem.
   */
  modoAltitude: ModoAltitude
  aoMudarParaAGL: () => void
  aoGerar: (cobertura: Cobertura, opcoes: OpcoesCobertura) => void
  aoFechar: () => void
}

/** Acima disto o aparelho recusa a rota, e vale mais dizê-lo antes de gerar. */
const WAYPOINTS_DEMAIS = 400

export function PainelCobertura({
  areas,
  drone,
  waypointsExistentes,
  modoAltitude,
  aoMudarParaAGL,
  aoGerar,
  aoFechar,
}: Props) {
  const [idDaArea, setIdDaArea] = useState(areas[0]?.id ?? '')
  const area = areas.find((a) => a.id === idDaArea) ?? areas[0]

  /*
   * Oitenta metros e a altura de trabalho de um levantamento, e nao os sessenta
   * que servem para inspeccionar. Mais alto, cada foto cobre mais terreno: a
   * mesma parcela sai com menos de metade das passagens e menos de metade das
   * fotos, sem perder sobreposicao.
   */
  const [altura, setAltura] = useState(80)
  const [lateral, setLateral] = useState(70)
  const [frontal, setFrontal] = useState(80)
  const [margem, setMargem] = useState(0)
  /*
   * Ligado por omissao, e com razao: desligado, o ficheiro exportado nao leva
   * accao de foto nenhuma. A rota voava e nao trazia nada, que e a pior maneira
   * de descobrir um engano - ja no campo, com a bateria gasta.
   */
  const [umPontoPorFoto, setUmPontoPorFoto] = useState(true)
  /** `null` enquanto ninguém lhe tocar: acompanha a forma da parcela. */
  const [rumo, setRumo] = useState<number | null>(null)

  const rumoSugerido = useMemo(
    () => (area ? rumoDoLadoMaisLongo(area.contorno) : 0),
    [area],
  )
  const rumoEfectivo = rumo ?? rumoSugerido

  const opcoes = useMemo<OpcoesCobertura>(
    () => ({
      alturaAcimaDoSolo: altura,
      fovHorizontalGraus: drone.camara.fovHorizontalGraus ?? 80,
      proporcao: drone.camara.proporcao ?? 4 / 3,
      sobreposicaoLateral: lateral / 100,
      sobreposicaoFrontal: frontal / 100,
      rumoGraus: rumoEfectivo,
      margem,
      umPontoPorFoto,
    }),
    [altura, drone, lateral, frontal, rumoEfectivo, margem, umPontoPorFoto],
  )

  const cobertura = useMemo(
    () => (area ? gerarCobertura(area.contorno, opcoes) : null),
    [area, opcoes],
  )

  const resolucao = cobertura ? resolucaoNoTerreno(drone.camara, cobertura.larguraDaFaixa) : null

  const waypointsNovos = cobertura?.passagens.reduce((soma, p) => soma + p.length, 0) ?? 0
  const total = waypointsExistentes + waypointsNovos

  return (
    <div className="painel-flutuante" role="dialog" aria-label="Cobrir área com passagens">
      <header className="painel-cabecalho">
        <h2>Cobrir área</h2>
        <button type="button" onClick={aoFechar} title="Fechar">
          Fechar
        </button>
      </header>

      <div className="painel-conteudo">
        {modoAltitude !== 'AGL' ? (
          <section className="grupo">
            <p className="nota">
              A rota está em {modoAltitude}, e a cobertura precisa de AGL: o espaçamento sai
              da altura acima do solo, e sobre relevo a mesma cota absoluta dá faixas de
              larguras diferentes a cada passagem.
            </p>
            <button type="button" onClick={aoMudarParaAGL}>
              Passar a rota para AGL
            </button>
          </section>
        ) : null}

        {areas.length > 1 ? (
          <section className="grupo">
            <CampoSelecao
              rotulo="Área"
              valor={idDaArea}
              opcoes={areas.map((a) => ({
                valor: a.id,
                rotulo: `${a.nome} (${formatarArea(areaDoContorno(a.contorno))})`,
              }))}
              aoAlterar={setIdDaArea}
            />
          </section>
        ) : null}

        <section className="grupo">
          <h3>Voo</h3>
          <CampoNumerico
            rotulo="Altura acima do solo"
            valor={altura}
            unidade=" m"
            min={5}
            max={120}
            incrementos={[10, 1]}
            aoAlterar={setAltura}
          />
          <CampoNumerico
            rotulo="Rumo das passagens"
            valor={rumoEfectivo}
            unidade="°"
            casas={1}
            min={0}
            max={180}
            incrementos={[45, 5]}
            aoAlterar={setRumo}
          />
          <CampoNumerico
            rotulo="Margem para fora do limite"
            valor={margem}
            unidade=" m"
            min={0}
            max={200}
            incrementos={[10, 5]}
            aoAlterar={setMargem}
          />
        </section>

        <section className="grupo">
          <h3>Sobreposição</h3>
          <CampoNumerico
            rotulo="Entre passagens"
            valor={lateral}
            unidade=" %"
            min={0}
            max={90}
            incrementos={[10, 5]}
            aoAlterar={setLateral}
          />
          <CampoNumerico
            rotulo="Entre fotos seguidas"
            valor={frontal}
            unidade=" %"
            min={0}
            max={95}
            incrementos={[10, 5]}
            aoAlterar={setFrontal}
          />
          <label className="interruptor">
            <input
              type="checkbox"
              checked={umPontoPorFoto}
              onChange={(evento) => setUmPontoPorFoto(evento.target.checked)}
            />
            <span>Um waypoint por foto</span>
          </label>
          <p className={umPontoPorFoto ? 'nota' : 'erro'}>
            {umPontoPorFoto
              ? 'Cada foto é um waypoint com a sua ação. É o que faz o ficheiro exportado tirar fotos, e o que enche a rota depressa.'
              : 'A rota fica com dois waypoints por passagem e o ficheiro exportado não leva ação de foto nenhuma: o intervalo de disparo tem de ser posto à mão no aparelho.'}
          </p>
        </section>

        {cobertura && area ? (
          <section className="grupo">
            <h3>O que isto dá</h3>
            <dl className="leitura-cobertura numerico">
              <dt>Área</dt>
              <dd>{formatarArea(areaDoContorno(area.contorno))}</dd>
              <dt>Faixa de uma foto</dt>
              <dd>
                {cobertura.larguraDaFaixa.toFixed(0)} &times;{' '}
                {cobertura.comprimentoDaFaixa.toFixed(0)} m
              </dd>
              {/*
                * É este o número que um caderno de encargos escreve, e não a
                * altura de voo. Sem megapíxeis na ficha do aparelho não se
                * calcula, e aí não se diz nada em vez de se inventar.
                */}
              {resolucao !== null ? (
                <>
                  <dt title="Centímetros de terreno em cada píxel da foto">Resolução</dt>
                  <dd>{resolucao.toFixed(1)} cm/px</dd>
                </>
              ) : null}
              <dt>Entre passagens</dt>
              <dd>{cobertura.espacamento.toFixed(1)} m</dd>
              <dt>Entre fotos</dt>
              <dd>{cobertura.intervaloEntreFotos.toFixed(1)} m</dd>
              <dt>Passagens</dt>
              <dd>{cobertura.passagens.length}</dd>
              <dt>Percurso</dt>
              <dd>{formatarDistancia(cobertura.distancia)}</dd>
              <dt>Fotos</dt>
              <dd>{cobertura.numeroDeFotos}</dd>
              <dt>Waypoints</dt>
              <dd>{waypointsNovos}</dd>
            </dl>

            {total > WAYPOINTS_DEMAIS ? (
              <p className="erro">
                A rota ficaria com {total} waypoints. Sobe a altura, baixa a sobreposição, ou
                desliga o waypoint por foto.
              </p>
            ) : null}
          </section>
        ) : null}

        <button
          type="button"
          disabled={!cobertura || cobertura.passagens.length === 0 || modoAltitude !== 'AGL'}
          onClick={() => {
            if (cobertura) aoGerar(cobertura, opcoes)
          }}
          title="Acrescenta as passagens no fim da rota. Desfaz-se com Ctrl+Z."
        >
          {waypointsExistentes > 0
            ? `Acrescentar ${waypointsNovos} waypoints à rota`
            : `Criar a rota com ${waypointsNovos} waypoints`}
        </button>
      </div>
    </div>
  )
}
