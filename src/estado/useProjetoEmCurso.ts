import { useEffect, useState } from 'react'
import type { LatLon, Rota } from '../nucleo/tipos.ts'
import { rotaVazia } from '../nucleo/operacoes-rota.ts'
import { armazem } from '../dados/armazem.ts'
import type { FonteTerreno } from '../terreno/fonte.ts'

/**
 * Abrir o projeto: recuperar a ultima rota, ou criar a primeira.
 *
 * E a unica coisa que corre antes de haver interface, e por isso a unica cuja
 * falha deixa o ecra vazio sem explicacao. O erro e devolvido em vez de ser
 * engolido, para a aplicacao poder dize-lo.
 */

/** Qual das rotas abrir: a escolhida manda sobre a ultima alterada. */
export function rotaAAbrir(rotas: readonly Rota[], escolhida: string | null): Rota | undefined {
  const pedida = escolhida ? rotas.find((r) => r.id === escolhida) : undefined
  if (pedida) return pedida
  return [...rotas].sort((a, b) => b.alteradaEm - a.alteradaEm)[0]
}

export function useProjetoEmCurso(opcoes: {
  projetoAberto: string | null
  rotaAberta: string | null
  /** Onde nasce a primeira rota de um projeto novo. */
  centroInicial: LatLon
  fonteTerreno: FonteTerreno
  carregar: (rota: Rota) => void
  aoAbrirRota: (id: string) => void
}): { erro: string | null } {
  const [erro, setErro] = useState<string | null>(null)

  const { projetoAberto, rotaAberta, centroInicial, fonteTerreno, carregar, aoAbrirRota } = opcoes

  useEffect(() => {
    if (!projetoAberto) return
    let cancelado = false

    const iniciar = async (): Promise<void> => {
      const projetos = await armazem.listarProjetos()
      const projeto =
        projetos.find((p) => p.id === projetoAberto) ??
        projetos[0] ??
        (await armazem.criarProjeto({ nome: 'Projeto sem nome' }))

      const rotas = await armazem.listarRotas(projeto.id)
      const aAbrir = rotaAAbrir(rotas, rotaAberta)

      if (aAbrir) {
        if (cancelado) return
        carregar(aAbrir)
        aoAbrirRota(aAbrir.id)
        return
      }

      const cotaDescolagem = await fonteTerreno.cota(centroInicial.lat, centroInicial.lon)
      const nova = rotaVazia({
        nome: 'Rota sem nome',
        projetoId: projeto.id,
        droneId: 'mini5pro',
        pontoDescolagem: { ...centroInicial, cotaTerreno: cotaDescolagem },
      })

      /*
       * A verificacao vem antes da escrita, e nao depois.
       *
       * Em modo estrito o React corre este efeito duas vezes, e gravar primeiro
       * deixava na base de dados uma rota vazia orfa por cada projeto aberto
       * pela primeira vez.
       */
      if (cancelado) return
      await armazem.gravarRota(nova)
      if (cancelado) return
      carregar(nova)
      aoAbrirRota(nova.id)
    }

    iniciar().catch((causa: unknown) => {
      if (cancelado) return
      setErro(causa instanceof Error ? causa.message : 'falha a abrir o projeto local')
    })

    return () => {
      cancelado = true
    }
    /*
     * `carregar` e `aoAbrirRota` sao estaveis e ficam de fora de proposito.
     * Depender delas faria este efeito correr a cada render e repor a rota
     * gravada por cima das edicoes que estivessem a decorrer.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoAberto, rotaAberta, centroInicial, fonteTerreno])

  return { erro }
}
