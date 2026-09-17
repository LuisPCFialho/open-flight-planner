import { App } from './App.tsx'
import { useSessao } from './dados/sessao.ts'
import { EcraEntrada } from './ui/EcraEntrada.tsx'

/**
 * Quem decide se ha aplicacao ou ecra de entrada.
 *
 * Fica acima do `App` de proposito. O `App` levanta o mapa, o terreno e a rota
 * em curso logo nos primeiros ganchos, e esses nao se podem pendurar de uma
 * condicao. Perguntar aqui, antes de ele existir, e o que garante que nada vai
 * a base antes de se saber quem esta a pedir.
 *
 * Sem armazem remoto configurado nao ha entrada nenhuma: o estado e `local` e
 * passa-se directamente a aplicacao, como sempre foi.
 */
export function Raiz() {
  const sessao = useSessao()

  if (sessao.estado === 'a-carregar') {
    return (
      <div className="ecra-arranque">
        <p>A verificar a sessão...</p>
      </div>
    )
  }

  if (sessao.estado === 'fora') return <EcraEntrada aoEntrar={sessao.entrar} />

  return <App />
}
