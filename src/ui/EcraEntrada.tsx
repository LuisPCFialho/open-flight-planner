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
}

export function EcraEntrada({ aoEntrar }: Props) {
  const [email, setEmail] = useState('')
  const [aEnviar, setAEnviar] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const submeter = async (): Promise<void> => {
    setAEnviar(true)
    setErro(null)
    const razao = await aoEntrar(email.trim())
    setAEnviar(false)
    if (razao) {
      setErro(razao)
      return
    }
    setEnviado(true)
  }

  return (
    <div className="ecra-entrada">
      <div className="cartao-entrada">
        <h1>Open Flight Planner</h1>
        <p className="subtitulo">
          Os teus projetos ficam na tua conta. Só tu os vês, em qualquer computador.
        </p>

        {enviado ? (
          <div className="entrada-enviada">
            <p>
              Se <strong>{email.trim()}</strong> tiver conta, a ligação de entrada está a caminho.
            </p>
            <p className="nota">
              Abre-a neste browser. A ligação serve uma vez e caduca ao fim de uma hora.
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
            <button type="submit" className="principal" disabled={aEnviar || email.trim() === ''}>
              {aEnviar ? 'A enviar...' : 'Receber ligação de entrada'}
            </button>
          </form>
        )}

        {erro ? <p className="aviso-ficheiro erro estatico">{erro}</p> : null}
      </div>
    </div>
  )
}
