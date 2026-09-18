import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * A rede por baixo da aplicacao.
 *
 * Uma excepcao em qualquer componente desmonta a arvore inteira, e o que o React
 * deixa no lugar e um `<div>` vazio. Para quem esta a usar isto, uma pagina
 * branca de repente e indistinguivel de "perdi o trabalho todo" - e nao e isso
 * que se passa: os projetos e as rotas estao na IndexedDB, que nao foi tocada,
 * e recarregar traz tudo de volta.
 *
 * E por isso que esta rede existe. Nao e para esconder a avaria: e para dizer as
 * duas coisas que ninguem consegue adivinhar sozinho diante de um ecra branco -
 * que o trabalho esta gravado, e o que fazer a seguir.
 *
 * Nao tenta recuperar. Um `setState` a voltar a montar a mesma arvore que
 * acabou de rebentar rebenta outra vez, e o que fica e um pisca-pisca. O
 * recarregar e do utilizador, de proposito.
 *
 * Tem de ser uma classe: os ganchos nao apanham excepcoes de renderizacao e nao
 * ha equivalente em funcao. E a unica classe do projecto, e e por esta razao.
 */

type Props = { children: ReactNode }
type Estado = { causa: Error | null }

export class Rede extends Component<Props, Estado> {
  override state: Estado = { causa: null }

  static getDerivedStateFromError(causa: unknown): Estado {
    return { causa: causa instanceof Error ? causa : new Error(String(causa)) }
  }

  override componentDidCatch(causa: Error, informacao: ErrorInfo): void {
    /*
     * A consola e o unico sitio para onde isto pode ir.
     *
     * Nao ha servidor nenhum a quem reportar, e nao vai passar a haver por causa
     * disto: a promessa do README e que os dados nao saem da maquina, e um
     * relatorio de erro leva pedacos do que estava no ecra. Quem quiser ajudar a
     * corrigir copia daqui e abre um issue.
     */
    console.error('Open Flight Planner: excepcao nao apanhada', causa, informacao.componentStack)
  }

  override render(): ReactNode {
    const { causa } = this.state
    if (!causa) return this.props.children

    return (
      <div className="ecra-avaria" role="alert">
        <div className="avaria-cartao">
          <h1>A aplicação parou</h1>
          <p>
            <strong>O teu trabalho não se perdeu.</strong> Os projetos e as rotas estão gravados
            neste browser e não foram tocados por isto. Recarrega a página e vais encontrá-los
            onde estavam.
          </p>
          <p className="nota">
            Se voltar a acontecer no mesmo sítio, vale a pena contar como - é assim que se
            corrige. O detalhe abaixo é o que faz falta para isso, e há uma cópia igual na
            consola do browser.
          </p>

          <div className="avaria-accoes">
            <button type="button" className="principal" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            <a
              href="https://github.com/LuisPCFialho/open-flight-planner/issues/new"
              target="_blank"
              rel="noreferrer noopener"
            >
              Contar o que aconteceu
            </a>
          </div>

          <details className="avaria-detalhe">
            <summary>Detalhe técnico</summary>
            <pre className="numerico">
              {causa.name}: {causa.message}
              {causa.stack ? `\n\n${causa.stack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
