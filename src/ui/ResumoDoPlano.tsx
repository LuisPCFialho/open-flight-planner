import { useState } from 'react'
import type { Drone, Rota } from '../nucleo/tipos.ts'
import type { Estatisticas } from '../nucleo/estatisticas.ts'
import type { Validacao } from '../nucleo/validacoes.ts'
import { formatarDistancia, formatarDuracao } from '../nucleo/estatisticas.ts'
import { areaDoContorno, formatarArea } from '../nucleo/areas.ts'
import { areasDeReferencia, zonasInterditas } from '../nucleo/interdicoes.ts'
import { janelaSolar, ELEVACAO_MINIMA_PREDEFINIDA } from '../nucleo/sol.ts'

/**
 * O plano em uma pagina, para levar para o terreno.
 *
 * Quem vai a obra nao leva o planeador: leva um telemovel com o ficheiro e, se
 * tiver juizo, um papel com o que combinou consigo proprio na vespera. Isto e
 * esse papel - os numeros que decidem se o voo corre bem, as coordenadas de
 * onde levantar, e as validacoes que ficaram por resolver.
 *
 * Sai tambem impresso. A folha de estilo de impressao tira tudo o resto da
 * pagina, porque o que se quer no papel e isto e nada mais.
 *
 * Nao leva mapa. Capturar a tela do MapLibre obrigava a manter o buffer de
 * desenho vivo em todos os fotogramas, o que se paga sempre para servir uma
 * coisa que se usa uma vez - e uma captura de ecra faz o mesmo trabalho.
 */

type Props = {
  rota: Rota
  drone: Drone | null
  estatisticas: Estatisticas | null
  validacoes: readonly Validacao[]
  /**
   * Altura acima do solo de cada waypoint. `null` onde a cota ainda nao chegou,
   * e esses ficam de fora do intervalo em vez de o puxarem para zero.
   */
  acimaDoSolo: readonly (number | null)[]
  aoFechar: () => void
}

function intervalo(brutos: readonly (number | null)[]): string {
  const valores = brutos.filter((v): v is number => v !== null)
  if (valores.length === 0) return '--'
  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)
  return minimo.toFixed(0) === maximo.toFixed(0)
    ? `${minimo.toFixed(0)} m`
    : `${minimo.toFixed(0)} a ${maximo.toFixed(0)} m`
}

function coordenadas(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}

export function ResumoDoPlano({
  rota,
  drone,
  estatisticas,
  validacoes,
  acimaDoSolo,
  aoFechar,
}: Props) {
  /*
   * O instante em que o resumo foi aberto, lido uma vez.
   *
   * E o que se quer: isto e uma fotografia do plano naquele momento, e nao um
   * painel que se actualiza. Lido a cada render, a data podia mudar entre dois
   * redesenhos do React sem nada ter acontecido.
   */
  const [feitoEm] = useState(() => Date.now())

  const referencia = areasDeReferencia(rota.areas)
  const interditas = zonasInterditas(rota.areas)
  const areaTotal = referencia.reduce((soma, a) => soma + areaDoContorno(a.contorno), 0)

  const janela = janelaSolar(
    rota.pontoDescolagem.lat,
    rota.pontoDescolagem.lon,
    feitoEm,
    ELEVACAO_MINIMA_PREDEFINIDA,
  )
  const hora = (instante: number | null): string =>
    instante === null
      ? '--'
      : new Date(instante).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const erros = validacoes.filter((v) => v.severidade === 'erro')
  const avisos = validacoes.filter((v) => v.severidade === 'aviso')

  return (
    <div className="painel-flutuante resumo-do-plano" role="dialog" aria-label="Resumo do plano">
      <header className="painel-cabecalho nao-imprimir">
        <h2>Resumo do plano</h2>
        <div>
          <button type="button" onClick={() => window.print()}>
            Imprimir
          </button>
          <button type="button" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </header>

      <div className="painel-conteudo resumo-conteudo">
        <h1 className="resumo-titulo">{rota.nome}</h1>
        <p className="resumo-subtitulo">
          {drone?.nome ?? 'aparelho por escolher'} · plano feito em{' '}
          {new Date(feitoEm).toLocaleDateString()}
        </p>

        <section className="grupo">
          <h3>O voo</h3>
          <dl className="resumo-lista numerico">
            <dt>Waypoints</dt>
            <dd>{estatisticas?.numeroWaypoints ?? 0}</dd>
            <dt>Fotos</dt>
            <dd>{estatisticas?.numeroFotos ?? 0}</dd>
            <dt>Percurso</dt>
            <dd>{estatisticas ? formatarDistancia(estatisticas.distancia3D) : '--'}</dd>
            <dt>Duração estimada</dt>
            <dd>{estatisticas ? formatarDuracao(estatisticas.duracao) : '--'}</dd>
            <dt>Velocidade</dt>
            <dd>{rota.velocidadeGlobal} m/s</dd>
            <dt>Altura acima do solo</dt>
            <dd>{intervalo(acimaDoSolo)}</dd>
            <dt>Modo de altitude</dt>
            <dd>{rota.modoAltitude}</dd>
          </dl>
        </section>

        <section className="grupo">
          <h3>Descolagem e regresso</h3>
          <dl className="resumo-lista numerico">
            <dt>Ponto de descolagem</dt>
            <dd>{coordenadas(rota.pontoDescolagem.lat, rota.pontoDescolagem.lon)}</dd>
            <dt>Cota do terreno</dt>
            <dd>{rota.pontoDescolagem.cotaTerreno.toFixed(0)} m</dd>
            <dt>Altura de segurança</dt>
            <dd>{rota.alturaSegurancaDescolagem} m</dd>
            <dt>Altura de regresso</dt>
            <dd>{rota.alturaRTH} m</dd>
            <dt>No fim da rota</dt>
            <dd>{rota.acaoFinal}</dd>
            <dt>Se perder o sinal</dt>
            <dd>{rota.acaoPerdaSinal}</dd>
          </dl>
        </section>

        <section className="grupo">
          <h3>Sol, hoje</h3>
          <dl className="resumo-lista numerico">
            <dt>Acima de {ELEVACAO_MINIMA_PREDEFINIDA}&deg;</dt>
            <dd>
              {janela.inicio === null
                ? 'não abre'
                : `${hora(janela.inicio)} – ${hora(janela.fim)}`}
            </dd>
            <dt>Meio-dia solar</dt>
            <dd>
              {hora(janela.meioDiaSolar)}, {janela.elevacaoMaxima.toFixed(0)}&deg;
            </dd>
          </dl>
          <p className="resumo-nota">
            Céu limpo. Confirma a previsão e o vento antes de sair.
          </p>
        </section>

        {referencia.length > 0 || interditas.length > 0 ? (
          <section className="grupo">
            <h3>Limites</h3>
            <dl className="resumo-lista numerico">
              {referencia.length > 0 ? (
                <>
                  <dt>Área a filmar</dt>
                  <dd>
                    {formatarArea(areaTotal)} em {referencia.length}{' '}
                    {referencia.length === 1 ? 'parcela' : 'parcelas'}
                  </dd>
                </>
              ) : null}
              {interditas.length > 0 ? (
                <>
                  <dt>Zonas interditas</dt>
                  <dd>{interditas.map((z) => z.nome).join(', ')}</dd>
                </>
              ) : null}
            </dl>
          </section>
        ) : null}

        <section className="grupo">
          <h3>Por resolver</h3>
          {erros.length === 0 && avisos.length === 0 ? (
            <p className="resumo-nota">Nada. A rota passa em todas as validações.</p>
          ) : (
            <ul className="resumo-validacoes">
              {[...erros, ...avisos].map((v) => (
                <li key={v.id} className={v.severidade}>
                  <strong>{v.severidade === 'erro' ? 'Erro' : 'Aviso'}:</strong> {v.titulo}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/*
          * A nota que tem de ir no papel.
          *
          * Nenhuma rota saida desta ferramenta foi voada ainda. Quem leva isto
          * para o terreno tem de saber que esta a verificar a ferramenta tanto
          * como a voar a rota.
          */}
        <p className="resumo-aviso">
          Nenhuma rota exportada por esta ferramenta foi voada até hoje. Confirma no simulador
          e mantém o comando à mão.
        </p>
      </div>
    </div>
  )
}
