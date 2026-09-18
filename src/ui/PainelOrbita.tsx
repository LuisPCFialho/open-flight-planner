import { useMemo, useState } from 'react'
import type { Drone, POI } from '../nucleo/tipos.ts'
import {
  apontaMesmoAoCentro,
  gerarOrbita,
  PASSO_MINIMO,
  type OpcoesOrbita,
} from '../nucleo/orbita.ts'
import { formatarDistancia } from '../nucleo/medicao.ts'
import { resolucaoNoTerreno } from '../nucleo/resolucao.ts'
import { CampoNumerico, CampoSelecao } from './campos.tsx'

/**
 * Voltar a um ponto, a olhar sempre para ele.
 *
 * A cobertura serve o que esta deitado. Para o que esta de pe - um posto de
 * transformacao, um mastro, um poste, a torre de um inversor - uma grelha por
 * cima ve o telhado e mais nada.
 *
 * Nao ha aqui campo para o angulo da camara, e e de proposito: com a aeronave a
 * `raio` metros do eixo e `altura` acima do alvo, o angulo que aponta ao alvo e
 * um so. Deixa-lo a mao dava uma volta inteira com o alvo a sair do
 * enquadramento a meio, que e o unico erro que uma orbita pode mesmo dar.
 */

type Props = {
  pois: readonly POI[]
  drone: Drone
  waypointsExistentes: number
  aoGerar: (opcoes: OpcoesOrbita) => void
  aoFechar: () => void
}

/** Acima disto o aparelho recusa a rota, e vale mais dize-lo antes de gerar. */
const WAYPOINTS_DEMAIS = 400

export function PainelOrbita({
  pois,
  drone,
  waypointsExistentes,
  aoGerar,
  aoFechar,
}: Props) {
  const [idDoPonto, setIdDoPonto] = useState(pois[0]?.id ?? '')
  const centro = pois.find((p) => p.id === idDoPonto) ?? pois[0]

  const [raio, setRaio] = useState(40)
  const [acimaDoPonto, setAcimaDoPonto] = useState(20)
  const [passoGraus, setPassoGraus] = useState(30)
  const [rumoInicial, setRumoInicial] = useState(0)
  const [horario, setHorario] = useState(true)
  const [comFoto, setComFoto] = useState(true)

  const opcoes = useMemo<OpcoesOrbita | null>(
    () =>
      centro
        ? { centro, raio, acimaDoPonto, passoGraus, rumoInicial, horario, comFoto }
        : null,
    [centro, raio, acimaDoPonto, passoGraus, rumoInicial, horario, comFoto],
  )

  const orbita = useMemo(() => (opcoes ? gerarOrbita(opcoes) : null), [opcoes])

  /*
   * A resolucao a que se ve o alvo, na distancia a que a aeronave esta dele.
   *
   * Nao e a mesma conta da cobertura: la a distancia e a altura, porque a camara
   * aponta a prumo ao chao. Aqui a camara aponta ao ponto, e a distancia e a
   * hipotenusa - raio e altura sao os catetos.
   */
  const distanciaAoAlvo = Math.hypot(raio, acimaDoPonto)
  const larguraVista = useMemo(() => {
    const fov = drone.camara.fovHorizontalGraus
    if (fov === undefined) return null
    return 2 * distanciaAoAlvo * Math.tan((fov * Math.PI) / 360)
  }, [drone, distanciaAoAlvo])
  const resolucao =
    larguraVista === null ? null : resolucaoNoTerreno(drone.camara, larguraVista)

  const total = waypointsExistentes + (orbita?.pontos.length ?? 0)

  return (
    <div className="painel-flutuante" role="dialog" aria-label="Orbitar um ponto">
      <header className="painel-cabecalho">
        <h2>Orbitar</h2>
        <button type="button" onClick={aoFechar} title="Fechar">
          Fechar
        </button>
      </header>

      <div className="painel-conteudo">
        {pois.length > 1 ? (
          <section className="grupo">
            <CampoSelecao
              rotulo="Ponto"
              valor={idDoPonto}
              opcoes={pois.map((p) => ({ valor: p.id, rotulo: p.nome }))}
              aoAlterar={setIdDoPonto}
            />
          </section>
        ) : null}

        <section className="grupo">
          <h3>A volta</h3>
          <CampoNumerico
            rotulo="Raio"
            valor={raio}
            unidade=" m"
            min={1}
            max={500}
            incrementos={[10, 5]}
            aoAlterar={setRaio}
          />
          <CampoNumerico
            rotulo="Acima do ponto"
            valor={acimaDoPonto}
            unidade=" m"
            min={-100}
            max={120}
            incrementos={[10, 5]}
            aoAlterar={setAcimaDoPonto}
          />
          <p className="nota">
            Contado a partir da altura do ponto de interesse, e não do solo: o que se quer
            enquadrar é o próprio ponto, e é dele que sai o ângulo da câmara.
          </p>
          <CampoNumerico
            rotulo="Passo"
            valor={passoGraus}
            unidade="°"
            min={PASSO_MINIMO}
            max={120}
            incrementos={[15, 5]}
            aoAlterar={setPassoGraus}
          />
          <CampoNumerico
            rotulo="Começar no rumo"
            valor={rumoInicial}
            unidade="°"
            min={0}
            max={359}
            incrementos={[45]}
            aoAlterar={(v) => setRumoInicial(((v % 360) + 360) % 360)}
          />
          <div className="alternador">
            <button
              type="button"
              className={horario ? 'activo' : ''}
              onClick={() => setHorario(true)}
            >
              Sentido horário
            </button>
            <button
              type="button"
              className={horario ? '' : 'activo'}
              onClick={() => setHorario(false)}
            >
              Contrário
            </button>
          </div>
          <label className="interruptor">
            <input
              type="checkbox"
              checked={comFoto}
              onChange={(evento) => setComFoto(evento.target.checked)}
            />
            <span>Uma foto em cada ponto</span>
          </label>
          <p className="nota">
            {comFoto
              ? 'Com foto, a aeronave para em cada ponto: uma foto tirada em movimento numa curva sai arrastada, e uma órbita é toda ela curva.'
              : 'Sem foto, a aeronave passa suave por todos os pontos. Serve para filmar a volta de seguida.'}
          </p>
        </section>

        {orbita && centro ? (
          <section className="grupo">
            <h3>O que isto dá</h3>
            <dl className="leitura-cobertura numerico">
              <dt>Waypoints</dt>
              <dd>{orbita.pontos.length}</dd>
              <dt title="Negativo é a apontar para baixo">Câmara</dt>
              <dd>{orbita.gimbalPitch.toFixed(1)}&deg;</dd>
              <dt>Altura de voo</dt>
              <dd>{orbita.altura.toFixed(0)} m</dd>
              <dt>Distância ao alvo</dt>
              <dd>{distanciaAoAlvo.toFixed(1)} m</dd>
              {/*
                * A resolucao no alvo, e nao no chao: a camara aponta ao ponto e
                * a distancia e a hipotenusa. Sem megapixeis na ficha nao se
                * calcula, e ai nao se diz nada em vez de se inventar.
                */}
              {resolucao !== null ? (
                <>
                  <dt title="Centímetros de alvo em cada píxel da foto">Resolução no alvo</dt>
                  <dd>{resolucao.toFixed(1)} cm/px</dd>
                </>
              ) : null}
              <dt>Percurso</dt>
              <dd>{formatarDistancia(orbita.distancia)}</dd>
            </dl>

            {/*
              * Quando o estabilizador nao chega la, a promessa deste painel -
              * a camara sempre no alvo - deixa de se cumprir, e isso tem de se
              * ver antes de gerar e nao depois de voar.
              */}
            {!apontaMesmoAoCentro(raio, acimaDoPonto) ? (
              <p className="erro">
                A esta distância e a esta altura, apontar ao ponto exigia mais do que os 45&deg;
                para cima que o estabilizador faz. A câmara fica no limite e o ponto sai por
                cima do enquadramento: afasta-te dele, ou sobe.
              </p>
            ) : null}

            {total > WAYPOINTS_DEMAIS ? (
              <p className="erro">
                A rota ficaria com {total} waypoints. Aumenta o passo.
              </p>
            ) : null}
          </section>
        ) : null}

        <button
          type="button"
          className="principal"
          disabled={!opcoes || !orbita || orbita.pontos.length === 0}
          onClick={() => {
            if (opcoes) aoGerar(opcoes)
          }}
        >
          Acrescentar à rota
        </button>
      </div>
    </div>
  )
}
