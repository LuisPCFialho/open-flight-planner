import { useCallback, useState } from 'react'

/**
 * Onde se estava quando a pagina fechou: que projeto, que rota.
 *
 * Recarregar a pagina - por engano, por uma actualizacao, ou porque o browser
 * decidiu - devolvia ao ecra de projetos. Quem estava a meio de uma rota tinha
 * de a ir procurar outra vez, e num projeto com varias campanhas isso e
 * escolher duas vezes em cada recarregamento.
 *
 * Guarda-se so o identificador, e nada mais. Quem o le e `useProjetoEmCurso`,
 * que ja sabe cair para o primeiro projeto quando o que pediu nao existe - um
 * projeto apagado, ou outra conta neste browser, nao deixam a aplicacao presa
 * num ecra vazio.
 */

/** Um valor que sobrevive ao recarregamento, e que nunca rebenta por causa disso. */
export function useValorGuardado(chave: string): [string | null, (valor: string | null) => void] {
  const [valor, setValor] = useState<string | null>(() => ler(chave))

  const guardar = useCallback(
    (novo: string | null) => {
      setValor(novo)
      escrever(chave, novo)
    },
    [chave],
  )

  return [valor, guardar]
}

/*
 * Os acessos vao todos em `try`.
 *
 * Numa janela privada, ou com os dados do sitio bloqueados, o proprio acesso ao
 * `localStorage` atira - nao devolve vazio. Sem isto, a aplicacao nao arrancava
 * de todo em vez de simplesmente esquecer onde estava, que e uma troca pessima.
 */
function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function escrever(chave: string, valor: string | null): void {
  try {
    if (valor === null) localStorage.removeItem(chave)
    else localStorage.setItem(chave, valor)
  } catch {
    /* Sem sitio onde guardar, o recarregamento volta ao ecra de projetos. */
  }
}

export const CHAVE_PROJETO = 'open-flight-planner:projeto-aberto'
export const CHAVE_ROTA = 'open-flight-planner:rota-aberta'
