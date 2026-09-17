import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Auth } from 'firebase/auth'
import type { Projeto, Rota } from '../nucleo/tipos.ts'
import { novoId } from '../nucleo/ids.ts'
import { copiarRota, rotaVazia } from '../nucleo/operacoes-rota.ts'
import type { Armazem, ProjetoComRotas, ResumoProjeto } from './tipos-armazem.ts'
import { anunciarMudanca } from './mudancas.ts'
import {
  deDocumentoProjeto,
  deDocumentoRota,
  paraDocumentoProjeto,
  paraDocumentoRota,
  type DocumentoProjeto,
  type DocumentoRota,
} from './linhas.ts'

/**
 * O armazem em Firestore, com uma conta por pessoa.
 *
 * Tudo o que e de alguem vive debaixo de `utilizadores/{uid}`. Isso nao e
 * arrumacao: e o que torna a regra de seguranca curta o suficiente para se
 * conferir de uma vez - quem le e escreve debaixo de um `uid` tem de ser esse
 * `uid`, e mais nada. Um campo `dono` em documentos soltos daria o mesmo
 * resultado com muito mais superficie para enganos.
 *
 * Nenhuma consulta aqui verifica de quem e o que vem. Quem verifica e o
 * servidor, por `firestore.rules`: a chave que o browser carrega esta a vista
 * de quem abrir as ferramentas de programador, e uma verificacao no cliente
 * seria decoracao.
 */

/** O maximo sao 500 operacoes por lote; abaixo disso ficamos com folga. */
const POR_LOTE = 400

export function armazemFirestore(bd: Firestore, autenticacao: Auth): Armazem {
  /*
   * Sem sessao nao ha caminho.
   *
   * Preferivel a devolver listas vazias: uma lista vazia lê-se como "não tens
   * projetos", que e a mensagem errada e a mais assustadora de todas.
   */
  const uid = (): string => {
    const utilizador = autenticacao.currentUser
    if (!utilizador) throw new Error('sessão terminada - volta a entrar')
    return utilizador.uid
  }

  const colProjetos = () => collection(bd, 'utilizadores', uid(), 'projetos')
  const colRotas = () => collection(bd, 'utilizadores', uid(), 'rotas')

  const lerProjetos = async (): Promise<Projeto[]> => {
    const resposta = await getDocs(query(colProjetos(), orderBy('criadoEm', 'desc')))
    return resposta.docs.map((d) => deDocumentoProjeto(d.id, d.data() as DocumentoProjeto))
  }

  const lerProjeto = async (id: string): Promise<Projeto | null> => {
    const documento = await getDoc(doc(colProjetos(), id))
    if (!documento.exists()) return null
    return deDocumentoProjeto(documento.id, documento.data() as DocumentoProjeto)
  }

  const lerRotasDoProjeto = async (projetoId: string): Promise<Rota[]> => {
    const resposta = await getDocs(query(colRotas(), where('projetoId', '==', projetoId)))
    return resposta.docs.map((d) => deDocumentoRota(d.id, d.data() as DocumentoRota))
  }

  const lerUmaRota = async (id: string): Promise<Rota | undefined> => {
    const documento = await getDoc(doc(colRotas(), id))
    if (!documento.exists()) return undefined
    return deDocumentoRota(documento.id, documento.data() as DocumentoRota)
  }

  /** Escreve as rotas em lotes, para nao bater no tecto de operacoes. */
  const escreverRotas = async (novas: readonly Rota[]): Promise<void> => {
    const alvo = colRotas()
    for (let i = 0; i < novas.length; i += POR_LOTE) {
      const lote = writeBatch(bd)
      for (const rota of novas.slice(i, i + POR_LOTE)) {
        lote.set(doc(alvo, rota.id), paraDocumentoRota(rota))
      }
      await lote.commit()
    }
  }

  const gravarProjeto = async (projeto: Projeto): Promise<Projeto> => {
    await setDoc(doc(colProjetos(), projeto.id), paraDocumentoProjeto(projeto))
    return projeto
  }

  return {
    remoto: true,

    listarProjetos: lerProjetos,

    /*
     * Uma contagem por projeto, no servidor.
     *
     * `getCountFromServer` conta sem trazer os documentos, e custa uma leitura
     * cada. Trazer as rotas todas para as contar no cliente custaria uma
     * leitura por rota e transferia o conteudo inteiro de cada uma - que aqui e
     * a rota completa, com waypoints e tudo - para mostrar um numero.
     */
    async listarResumos(): Promise<ResumoProjeto[]> {
      const lista = await lerProjetos()
      const alvo = colRotas()

      return Promise.all(
        lista.map(async (projeto) => {
          const contagem = await getCountFromServer(
            query(alvo, where('projetoId', '==', projeto.id)),
          )
          return { projeto, rotas: contagem.data().count }
        }),
      )
    },

    async criarProjeto(dados): Promise<Projeto> {
      const projeto = await gravarProjeto({
        id: novoId(),
        nome: dados.nome,
        cliente: dados.cliente ?? '',
        local: dados.local ?? '',
        criadoEm: Date.now(),
      })
      anunciarMudanca()
      return projeto
    },

    async renomearProjeto(id, alteracao): Promise<void> {
      const actual = await lerProjeto(id)
      if (!actual) throw new Error('projeto não encontrado')
      await gravarProjeto({ ...actual, ...alteracao })
      anunciarMudanca()
    },

    /*
     * Apagar um projeto tem de apagar as rotas a mao.
     *
     * O Firestore nao tem chaves estrangeiras nem `on delete cascade`: apagar
     * um documento nao toca em nada que aponte para ele. Sem isto, as rotas
     * ficavam la para sempre, invisiveis e a contar para a quota.
     */
    async apagarProjeto(id): Promise<void> {
      const rotas = await getDocs(query(colRotas(), where('projetoId', '==', id)))
      const alvo = colRotas()

      for (let i = 0; i < rotas.docs.length; i += POR_LOTE) {
        const lote = writeBatch(bd)
        for (const documento of rotas.docs.slice(i, i + POR_LOTE)) {
          lote.delete(doc(alvo, documento.id))
        }
        await lote.commit()
      }

      await deleteDoc(doc(colProjetos(), id))
      anunciarMudanca()
    },

    async duplicarProjeto(id): Promise<Projeto> {
      const original = await lerProjeto(id)
      if (!original) throw new Error('projeto não encontrado')
      const originais = await lerRotasDoProjeto(id)

      const copia = await gravarProjeto({
        ...original,
        id: novoId(),
        nome: `${original.nome} (copia)`,
        criadoEm: Date.now(),
      })
      await escreverRotas(originais.map((rota) => copiarRota(rota, copia.id)))
      anunciarMudanca()
      return copia
    },

    async lerProjetoComRotas(id): Promise<ProjetoComRotas | null> {
      const projeto = await lerProjeto(id)
      if (!projeto) return null
      return { projeto, rotas: await lerRotasDoProjeto(id) }
    },

    async gravarProjetoImportado(conteudo): Promise<Projeto> {
      await gravarProjeto(conteudo.projeto)
      await escreverRotas(conteudo.rotas)
      anunciarMudanca()
      return conteudo.projeto
    },

    listarRotas: lerRotasDoProjeto,
    lerRota: lerUmaRota,

    async criarRota(dados): Promise<Rota> {
      const rota = rotaVazia(dados)
      await escreverRotas([rota])
      anunciarMudanca()
      return rota
    },

    async gravarRota(rota): Promise<void> {
      await escreverRotas([{ ...rota, alteradaEm: Date.now() }])
      anunciarMudanca()
    },

    async renomearRota(id, nome): Promise<void> {
      const actual = await lerUmaRota(id)
      if (!actual) throw new Error('rota não encontrada')
      await escreverRotas([{ ...actual, nome, alteradaEm: Date.now() }])
      anunciarMudanca()
    },

    async duplicarRota(id): Promise<Rota> {
      const original = await lerUmaRota(id)
      if (!original) throw new Error('rota não encontrada')
      const copia = copiarRota(original, original.projetoId, `${original.nome} (copia)`)
      await escreverRotas([copia])
      anunciarMudanca()
      return copia
    },

    async apagarRota(id): Promise<void> {
      await deleteDoc(doc(colRotas(), id))
      anunciarMudanca()
    },

    async gravarTrocos(trocos): Promise<Rota[]> {
      const agora = Date.now()
      const novas = trocos.map((troco) => ({
        ...troco,
        id: novoId(),
        criadaEm: agora,
        alteradaEm: agora,
      }))
      await escreverRotas(novas)
      anunciarMudanca()
      return novas
    },
  }
}
