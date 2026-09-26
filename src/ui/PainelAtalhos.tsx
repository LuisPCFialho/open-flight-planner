/**
 * A folha de atalhos.
 *
 * Todos estes comandos ja existiam e nenhum estava escrito em lado nenhum. O
 * voo virtual tem catorze teclas - W A S D, Q E, Z C, as quatro setas, R, e o
 * Alt para o ajuste fino - e a unica maneira de as descobrir era ler o
 * comentario no topo de `useVooVirtual.ts`, o que ninguem faz.
 *
 * Nao se abre sozinha. Abre com `?`, que e onde toda a gente a procura, e com o
 * botao que esta ao lado dela na barra para quem nao sabe disso.
 */

type Props = {
  aoFechar: () => void
}

type Atalho = { teclas: string[]; descricao: string }

const EDICAO: readonly Atalho[] = [
  { teclas: ['Ctrl', 'Z'], descricao: 'Desfazer' },
  { teclas: ['Ctrl', 'Shift', 'Z'], descricao: 'Refazer' },
  { teclas: ['Ctrl', 'A'], descricao: 'Seleccionar todos os waypoints da rota' },
  { teclas: ['Delete'], descricao: 'Eliminar o que está seleccionado' },
  { teclas: ['↑'], descricao: 'Seleccionar o waypoint anterior' },
  { teclas: ['↓'], descricao: 'Seleccionar o waypoint seguinte' },
  { teclas: ['Esc'], descricao: 'Sair do modo em que se está' },
]

const RATO: readonly Atalho[] = [
  { teclas: ['clique'], descricao: 'Com "Criar waypoints" ligado, põe um ponto no mapa' },
  { teclas: ['Alt', 'clique'], descricao: 'Num troço, insere um ponto no meio dele' },
  { teclas: ['Ctrl', 'clique'], descricao: 'Junta ou tira o ponto da selecção' },
  { teclas: ['Shift', 'clique'], descricao: 'Selecciona o intervalo até ao ponto, na lista ou no mapa' },
]

const VOO: readonly Atalho[] = [
  { teclas: ['W', 'A', 'S', 'D'], descricao: 'Deslocar a aeronave' },
  { teclas: ['Q', 'E'], descricao: 'Rodar a aeronave' },
  { teclas: ['Z', 'C'], descricao: 'Descer e subir' },
  { teclas: ['↑', '↓'], descricao: 'Inclinar a câmara' },
  { teclas: ['←', '→'], descricao: 'Rodar a câmara em relação à aeronave' },
  { teclas: ['R'], descricao: 'Pôr a câmara a olhar em frente' },
  { teclas: ['Alt'], descricao: 'Segurar para tudo andar a um quinto, para enquadrar' },
  { teclas: ['Shift', 'Espaço'], descricao: 'Gravar o waypoint na posição e atitude actuais' },
  { teclas: ['Shift', 'F'], descricao: 'Gravar o waypoint e acrescentar-lhe a foto' },
]

function Lista({ titulo, atalhos }: { titulo: string; atalhos: readonly Atalho[] }) {
  return (
    <section className="grupo">
      <h3>{titulo}</h3>
      <dl className="lista-atalhos">
        {atalhos.map((atalho) => (
          <div key={atalho.descricao} className="atalho">
            <dt>
              {atalho.teclas.map((tecla) => (
                <kbd key={tecla}>{tecla}</kbd>
              ))}
            </dt>
            <dd>{atalho.descricao}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function PainelAtalhos({ aoFechar }: Props) {
  return (
    <div className="painel-flutuante painel-atalhos" role="dialog" aria-label="Atalhos de teclado">
      <header className="painel-cabecalho">
        <h2>Atalhos</h2>
        <button type="button" onClick={aoFechar} title="Fechar">
          Fechar
        </button>
      </header>

      <div className="painel-conteudo">
        <Lista titulo="Editar a rota" atalhos={EDICAO} />
        <Lista titulo="Rato no mapa" atalhos={RATO} />
        <Lista titulo="Voo virtual" atalhos={VOO} />
        <p className="nota">
          Nenhum destes funciona enquanto estiveres a escrever num campo, o que é de propósito:
          escrever 60 numa altura não pode apagar a selecção.
        </p>
      </div>
    </div>
  )
}
