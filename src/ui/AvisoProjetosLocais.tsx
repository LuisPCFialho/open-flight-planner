import { useEffect, useState } from 'react'
import { armazem } from '../dados/armazem.ts'
import { enviarProjetosLocais, quantosProjetosLocais } from '../dados/migracao.ts'

/**
 * O aviso de que ha trabalho guardado nesta maquina que ainda nao esta na conta.
 *
 * So aparece quando ha armazem remoto e ha mesmo projetos locais. Sem ele, quem
 * usou a ferramenta antes de haver contas entrava, via a lista vazia e concluia
 * que tinha perdido tudo - que e exactamente o que o comentario em `bd.ts`
 * avisa que nao pode acontecer.
 *
 * Dispensa-se, e fica dispensado: a escolha guarda-se neste browser, que e o
 * unico sitio onde a pergunta faz sentido.
 */

const DISPENSADO = 'open-flight-planner:migracao-dispensada'

function foiDispensado(): boolean {
  try {
    return localStorage.getItem(DISPENSADO) === 'sim'
  } catch {
    // Numa janela privada o acesso atira. Perguntar outra vez e o mal menor.
    return false
  }
}

function dispensar(): void {
  try {
    localStorage.setItem(DISPENSADO, 'sim')
  } catch {
    /* Sem sitio onde guardar a escolha, ela vale para esta visita. */
  }
}

export function AvisoProjetosLocais() {
  const [quantos, setQuantos] = useState(0)
  const [escondido, setEscondido] = useState(() => foiDispensado())
  const [aEnviar, setAEnviar] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!armazem.remoto || escondido) return
    let vivo = true
    quantosProjetosLocais()
      .then((total) => {
        if (vivo) setQuantos(total)
      })
      .catch(() => {
        // Sem IndexedDB nao ha nada para migrar, e o aviso simplesmente nao aparece.
      })
    return () => {
      vivo = false
    }
  }, [escondido])

  if (!armazem.remoto || escondido || quantos === 0) return null

  const enviar = async (): Promise<void> => {
    setAEnviar(true)
    setErro(null)
    try {
      const enviados = await enviarProjetosLocais(armazem)
      setResultado(
        enviados === 1
          ? 'Um projeto copiado para a tua conta.'
          : `${String(enviados)} projetos copiados para a tua conta.`,
      )
      dispensar()
    } catch (causa: unknown) {
      setErro(causa instanceof Error ? causa.message : 'falha a copiar os projetos')
    } finally {
      setAEnviar(false)
    }
  }

  return (
    <div className="aviso-migracao">
      {resultado ? (
        <p>
          {resultado} O que estava neste computador continua lá, intacto.{' '}
          <button type="button" className="ligacao" onClick={() => setEscondido(true)}>
            Fechar
          </button>
        </p>
      ) : (
        <>
          <p>
            Há {quantos === 1 ? 'um projeto guardado' : `${String(quantos)} projetos guardados`}{' '}
            neste computador, de antes de haver contas. Queres copiá-
            {quantos === 1 ? 'lo' : 'los'} para a tua conta? Nada é apagado daqui.
          </p>
          <div className="aviso-migracao-accoes">
            <button type="button" className="principal" disabled={aEnviar} onClick={() => void enviar()}>
              {aEnviar ? 'A copiar...' : 'Copiar para a minha conta'}
            </button>
            <button
              type="button"
              onClick={() => {
                dispensar()
                setEscondido(true)
              }}
            >
              Não, obrigado
            </button>
          </div>
        </>
      )}
      {erro ? <p className="erro">{erro}</p> : null}
    </div>
  )
}
