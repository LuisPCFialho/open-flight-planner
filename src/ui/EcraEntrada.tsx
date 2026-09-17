import { useState } from 'react'

/**
 * Entrada por ligacao enviada para o correio.
 *
 * Nao ha palavra-passe: nem para escolher, nem para recuperar, nem para esta
 * aplicacao guardar. O que se prova e o acesso a caixa de correio, que e o que
 * qualquer recuperacao de palavra-passe acaba por provar de qualquer maneira -
 * so que sem uma palavra a mais para alguem reutilizar de outro sitio.
 *
 * O ecra diz sempre que a ligacao foi enviada, mesmo quando o endereco nao tem
 * conta. Dizer "esse endereco nao existe" seria dizer a quem perguntasse quais
 * os enderecos que tem conta aqui.
 */

type Props = {
  aoEntrar: (email: string) => Promise<string | null>
  /**
   * Presente quando a ligacao foi aberta noutro browser - tipicamente no
   * telemovel, porque foi la que o correio chegou. Falta o endereco para
   * concluir, e o que se pede e uma confirmacao, nao outra ligacao.
   */
  aoConcluir: ((email: string) => Promise<string | null>) | null
}

export function EcraEntrada({ aoEntrar, aoConcluir }: Props) {
  const [email, setEmail] = useState('')
  const [aTrabalhar, setATrabalhar] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const aConcluir = aoConcluir !== null

  const submeter = async (): Promise<void> => {
    setATrabalhar(true)
    setErro(null)
    const razao = await (aoConcluir ?? aoEntrar)(email.trim())
    setATrabalhar(false)
    if (razao) {
      setErro(razao)
      return
    }
    // A conclusao muda a sessao e este ecra sai; o pedido de ligacao fica aqui.
    if (!aConcluir) setEnviado(true)
  }

  return (
    <div className="ecra-entrada">
      <div className="cartao-entrada">
        <h1>Open Flight Planner</h1>
        <p className="subtitulo">
          {aConcluir
            ? 'Confirma o endereço para onde a ligação foi enviada. É a última coisa que falta.'
            : 'Os teus projetos ficam na tua conta. Só tu os vês, em qualquer computador.'}
        </p>

        {enviado ? (
          <div className="entrada-enviada">
            <p>
              Se <strong>{email.trim()}</strong> tiver conta, a ligação de entrada está a caminho.
            </p>
            <p className="nota">
              Abre-a de preferência neste browser. A ligação serve uma vez e caduca.
            </p>
            <button
              type="button"
              className="ligacao"
              onClick={() => {
                setEnviado(false)
                setErro(null)
              }}
            >
              Usar outro endereço
            </button>
          </div>
        ) : (
          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              void submeter()
            }}
          >
            <label htmlFor="email-entrada">Endereço de correio</label>
            <input
              id="email-entrada"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              placeholder="nome@empresa.pt"
              onChange={(evento) => setEmail(evento.target.value)}
            />
            <button
              type="submit"
              className="principal"
              disabled={aTrabalhar || email.trim() === ''}
            >
              {aTrabalhar
                ? 'A trabalhar...'
                : aConcluir
                  ? 'Concluir entrada'
                  : 'Receber ligação de entrada'}
            </button>
          </form>
        )}

        {erro ? <p className="aviso-ficheiro erro estatico">{erro}</p> : null}
      </div>
    </div>
  )
}
