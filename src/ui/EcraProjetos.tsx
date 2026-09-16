import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Projeto } from '../nucleo/tipos.ts'
import { bd, criarProjeto, apagarProjeto } from '../dados/bd.ts'
import {
  deFicheiro,
  duplicarProjeto,
  gravarProjetoImportado,
  lerProjetoComRotas,
  paraFicheiro,
  renomearProjeto,
  FicheiroInvalido,
} from '../dados/projetos.ts'
import { IconeCarregar, IconeDescarregar, IconeEliminar } from './icones.tsx'

/**
 * Lista de projetos.
 *
 * Apagar um projeto leva as rotas todas com ele, por isso pede confirmacao
 * dizendo quantas sao. Nao ha desfazer nesta operacao, ao contrario do que se
 * passa dentro de uma rota.
 */

type Props = {
  aoAbrir: (projetoId: string) => void
}

export function EcraProjetos({ aoAbrir }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aRenomear, setARenomear] = useState<string | null>(null)

  const linhas = useLiveQuery(async () => {
    const projetos = await bd.projetos.orderBy('criadoEm').reverse().toArray()
    return Promise.all(
      projetos.map(async (projeto) => ({
        projeto,
        rotas: await bd.rotas.where('projetoId').equals(projeto.id).count(),
      })),
    )
  }, [])

  const exportar = async (projeto: Projeto): Promise<void> => {
    const conteudo = await lerProjetoComRotas(projeto.id)
    if (!conteudo) return

    const texto = JSON.stringify(paraFicheiro(conteudo), null, 2)
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
    const ligacao = document.createElement('a')
    ligacao.href = url
    ligacao.download = `${projeto.nome.replace(/[^\w-]+/g, '-').toLowerCase()}.json`
    document.body.appendChild(ligacao)
    ligacao.click()
    ligacao.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importar = async (ficheiro: File): Promise<void> => {
    try {
      const conteudo = deFicheiro(JSON.parse(await ficheiro.text()))
      await gravarProjetoImportado(conteudo)
      setErro(null)
    } catch (causa: unknown) {
      setErro(
        causa instanceof FicheiroInvalido || causa instanceof Error
          ? causa.message
          : 'não foi possível ler o ficheiro',
      )
    }
  }

  return (
    <div className="ecra-projetos">
      <header className="barra-superior">
        <h1>Projetos</h1>
        <span />
        <div className="accoes-superiores">
          <button type="button" onClick={() => void criarProjeto({ nome: 'Projeto sem nome' })}>
            Novo projeto
          </button>
          <button type="button" onClick={() => entrada.current?.click()}>
            <IconeCarregar />
            Importar JSON
          </button>
          <input
            ref={entrada}
            type="file"
            accept=".json"
            hidden
            onChange={(evento) => {
              const ficheiro = evento.target.files?.[0]
              if (ficheiro) void importar(ficheiro)
              evento.target.value = ''
            }}
          />
        </div>
      </header>

      {erro ? <p className="aviso-ficheiro erro estatico">{erro}</p> : null}

      <div className="lista-projetos">
        {linhas === undefined ? (
          <p className="vazio">A abrir a base de dados local...</p>
        ) : linhas.length === 0 ? (
          <p className="vazio">
            Ainda não há projetos. Cria um, ou importa um JSON exportado noutro posto.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cliente</th>
                <th>Local</th>
                <th className="numerico">Rotas</th>
                <th>Criado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ projeto, rotas }) => (
                <tr key={projeto.id}>
                  <td>
                    {aRenomear === projeto.id ? (
                      <input
                        autoFocus
                        defaultValue={projeto.nome}
                        onBlur={(e) => {
                          void renomearProjeto(projeto.id, { nome: e.target.value.trim() || projeto.nome })
                          setARenomear(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') setARenomear(null)
                        }}
                      />
                    ) : (
                      <button type="button" className="ligacao" onClick={() => aoAbrir(projeto.id)}>
                        {projeto.nome}
                      </button>
                    )}
                  </td>
                  <td>
                    <input
                      defaultValue={projeto.cliente}
                      placeholder="cliente"
                      onBlur={(e) => void renomearProjeto(projeto.id, { cliente: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={projeto.local}
                      placeholder="local"
                      onBlur={(e) => void renomearProjeto(projeto.id, { local: e.target.value })}
                    />
                  </td>
                  <td className="numerico">{rotas}</td>
                  <td className="numerico">
                    {new Date(projeto.criadoEm).toLocaleDateString('pt-PT')}
                  </td>
                  <td className="accoes-linha">
                    <button type="button" onClick={() => setARenomear(projeto.id)} title="Renomear">
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicarProjeto(projeto.id)}
                      title="Duplicar com todas as rotas"
                    >
                      Duplicar
                    </button>
                    <button type="button" onClick={() => void exportar(projeto)} title="Exportar JSON">
                      <IconeDescarregar />
                    </button>
                    <button
                      type="button"
                      title="Apagar o projeto e as suas rotas"
                      onClick={() => {
                        const aviso =
                          rotas > 0
                            ? `Apagar "${projeto.nome}" leva ${rotas} rota${rotas === 1 ? '' : 's'}. Não há desfazer.`
                            : `Apagar "${projeto.nome}"?`
                        if (window.confirm(aviso)) void apagarProjeto(projeto.id)
                      }}
                    >
                      <IconeEliminar />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
