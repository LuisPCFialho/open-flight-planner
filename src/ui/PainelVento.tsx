import { useRef } from 'react'
import type { Vento } from '../nucleo/tipos.ts'
import { quadrante, SEM_VENTO } from '../nucleo/vento.ts'
import { CampoNumerico } from './campos.tsx'

/**
 * O vento que se espera, escrito a mao.
 *
 * Nao ha previsao nenhuma a ser buscada e isso e deliberado: uma previsao a 24
 * horas para um sitio concreto vale o que vale, e quem planeia ja a foi ver. O
 * que falta e o passo a seguir - saber o que aquele numero faz a esta rota - e
 * para isso basta que ele entre.
 *
 * A direccao arrasta-se na rosa. E um campo de graus a fingir de desenho, e nao
 * ha aqui nenhuma vaidade: `de onde sopra` contra `para onde vai` e o engano
 * mais repetido que ha nisto, e uma seta que se ve apontar para o centro da rosa
 * nao se presta a esse engano como um numero se presta.
 */

type Props = {
  vento: Vento | undefined
  aoAlterar: (vento: Vento | undefined) => void
}

const RAIO = 34
const CENTRO = 40

/** Graus a partir de um ponto na rosa, com o norte em cima. */
function rumoDoPonto(x: number, y: number): number {
  const graus = (Math.atan2(x - CENTRO, CENTRO - y) * 180) / Math.PI
  return Math.round(((graus % 360) + 360) % 360)
}

export function PainelVento({ vento, aoAlterar }: Props) {
  const rosa = useRef<SVGSVGElement>(null)
  const actual = vento ?? SEM_VENTO
  const ligado = vento !== undefined

  /* O arrasto e o clique sao a mesma coisa: ler o ponto e escrever o rumo. */
  const apontar = (evento: { clientX: number; clientY: number }) => {
    const svg = rosa.current
    if (!svg) return
    const caixa = svg.getBoundingClientRect()
    if (caixa.width === 0) return
    const escala = 80 / caixa.width
    const x = (evento.clientX - caixa.left) * escala
    const y = (evento.clientY - caixa.top) * escala
    aoAlterar({ ...actual, rumo: rumoDoPonto(x, y) })
  }

  /*
   * A seta aponta para o centro, porque o vento vem de la para aqui. Desenhada
   * ao contrario - a sair do centro - dizia exactamente o oposto a quem olhasse
   * depressa, que e como se olha para isto.
   */
  const radianos = (actual.rumo * Math.PI) / 180
  const de = {
    x: CENTRO + RAIO * Math.sin(radianos),
    y: CENTRO - RAIO * Math.cos(radianos),
  }
  const para = {
    x: CENTRO + 9 * Math.sin(radianos),
    y: CENTRO - 9 * Math.cos(radianos),
  }

  return (
    <section className="grupo grupo-vento">
      <h3>Vento</h3>

      {!ligado ? (
        <>
          <p className="nota">
            Sem vento apontado, nada do que se calcula abaixo muda. Aponta o que o boletim
            disser para o dia e a hora do voo.
          </p>
          <button type="button" onClick={() => aoAlterar({ velocidade: 5, rumo: 0 })}>
            Apontar o vento
          </button>
        </>
      ) : (
        <>
          <div className="vento-linha">
            <svg
              ref={rosa}
              className="rosa-dos-ventos"
              viewBox="0 0 80 80"
              width="80"
              height="80"
              role="img"
              aria-label={`Vento de ${actual.rumo} graus, ${quadrante(actual.rumo)}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                apontar(e)
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) apontar(e)
              }}
            >
              <circle className="rosa-fundo" cx={CENTRO} cy={CENTRO} r={RAIO} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => {
                const r = (g * Math.PI) / 180
                const fora = g % 90 === 0 ? RAIO : RAIO - 3
                return (
                  <line
                    key={g}
                    className="rosa-marca"
                    x1={CENTRO + (RAIO - 6) * Math.sin(r)}
                    y1={CENTRO - (RAIO - 6) * Math.cos(r)}
                    x2={CENTRO + fora * Math.sin(r)}
                    y2={CENTRO - fora * Math.cos(r)}
                  />
                )
              })}
              <text className="rosa-norte" x={CENTRO} y={13}>
                N
              </text>
              <line className="rosa-seta" x1={de.x} y1={de.y} x2={para.x} y2={para.y} />
              <path
                className="rosa-ponta"
                d={`M ${para.x} ${para.y} L ${para.x + 5 * Math.sin(radianos + 2.5)} ${
                  para.y - 5 * Math.cos(radianos + 2.5)
                } L ${para.x + 5 * Math.sin(radianos - 2.5)} ${
                  para.y - 5 * Math.cos(radianos - 2.5)
                } Z`}
              />
            </svg>

            <div className="vento-campos">
              <CampoNumerico
                rotulo="Velocidade"
                valor={actual.velocidade}
                unidade=" m/s"
                casas={1}
                min={0}
                max={30}
                passo={0.5}
                incrementos={[1]}
                aoAlterar={(v) => aoAlterar({ ...actual, velocidade: v })}
              />
              <CampoNumerico
                rotulo="Vem de"
                valor={actual.rumo}
                unidade="°"
                min={0}
                max={359}
                incrementos={[45]}
                aoAlterar={(v) => aoAlterar({ ...actual, rumo: ((v % 360) + 360) % 360 })}
              />
              <p className="leitura-auxiliar numerico">
                {actual.velocidade.toFixed(1)} m/s de {quadrante(actual.rumo)}
              </p>
            </div>
          </div>

          <p className="nota">
            A duração estimada só muda nos troços em que manter a velocidade pedida exigiria
            mais do que o aparelho faz em missão. A bateria gasta-se mais depressa contra o
            vento, mas isso não se calcula aqui: exigiria a curva de potência do aparelho, que
            não é publicada.
          </p>

          <button type="button" onClick={() => aoAlterar(undefined)}>
            Tirar o vento
          </button>
        </>
      )}
    </section>
  )
}
