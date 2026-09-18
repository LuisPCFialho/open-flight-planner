import { descarregarTexto, nomeSeguro } from '../descarregar.ts'
import { useRef, useState } from 'react'
import type { Projeto } from '../nucleo/tipos.ts'
import { armazem } from '../dados/armazem.ts'
import { useConsulta } from '../dados/useConsulta.ts'
import { deFicheiro, paraFicheiro, FicheiroInvalido } from '../dados/projetos.ts'
import { useSessao } from '../dados/sessao.ts'
import { AvisoProjetosLocais } from './AvisoProjetosLocais.tsx'
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
  const sessao = useSessao()

  const { dados: linhas, erro: erroDaLista } = useConsulta(() => armazem.listarResumos(), [])

  const exportar = async (projeto: Projeto): Promise<void> => {
    const conteudo = await armazem.lerProjetoComRotas(projeto.id)
    if (!conteudo) return

    descarregarTexto(
      JSON.stringify(paraFicheiro(conteudo), null, 2),
      nomeSeguro(projeto.nome, 'json', 'projeto'),
      'application/json',
    )
  }

  const importar = async (ficheiro: File): Promise<void> => {
    try {
      const conteudo = deFicheiro(JSON.parse(await ficheiro.text()))
      await armazem.gravarProjetoImportado(conteudo)
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
        <h1>Open Flight Planner</h1>
        <span className="subtitulo-produto">
          Rotas de waypoints para DJI Fly e Pilot 2, sem conversão pelo meio
        </span>
        <div className="accoes-superiores">
          {sessao.estado === 'dentro' ? (
            <span className="conta">
              <span className="conta-email" title="Só tu vês estes projetos">
                {sessao.email}
              </span>
              <button type="button" onClick={() => void sessao.sair()}>
                Sair
              </button>
            </span>
          ) : null}
          <button type="button" onClick={() => void armazem.criarProjeto({ nome: 'Projeto sem nome' })}>
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

      <AvisoProjetosLocais />

      {erro ?? erroDaLista ? (
        <p className="aviso-ficheiro erro estatico">{erro ?? erroDaLista}</p>
      ) : null}

      <div className="lista-projetos">
        {linhas === undefined ? (
          <p className="vazio">
            {armazem.remoto ? 'A ler os teus projetos...' : 'A abrir a base de dados local...'}
          </p>
        ) : linhas.length === 0 ? (
          <div className="vazio vazio-projetos">
            <h2>Ainda não há projetos</h2>
            <p>
              Um projeto é uma obra, e leva dentro as rotas todas que se voarem lá. Cria um, ou
              traz um ficheiro JSON exportado noutro posto.
            </p>
          </div>
        ) : (
          <ul className="cartoes-projeto">
            {linhas.map(({ projeto, rotas }) => (
              <li key={projeto.id} className="cartao-projeto">
                <div className="cartao-titulo">
                  {aRenomear === projeto.id ? (
                    <input
                      autoFocus
                      className="nome-em-edicao"
                      defaultValue={projeto.nome}
                      onBlur={(e) => {
                        void armazem.renomearProjeto(projeto.id, {
                          nome: e.target.value.trim() || projeto.nome,
                        })
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
                  <span className="cartao-rotas numerico" title="Rotas neste projeto">
                    {rotas} {rotas === 1 ? 'rota' : 'rotas'}
                  </span>
                </div>

                <div className="cartao-campos">
                  <label>
                    <span>Cliente</span>
                    <input
                      defaultValue={projeto.cliente}
                      placeholder="por preencher"
                      onBlur={(e) =>
                        void armazem.renomearProjeto(projeto.id, { cliente: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Local</span>
                    <input
                      defaultValue={projeto.local}
                      placeholder="por preencher"
                      onBlur={(e) =>
                        void armazem.renomearProjeto(projeto.id, { local: e.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="cartao-rodape">
                  <span className="cartao-data numerico">
                    {new Date(projeto.criadoEm).toLocaleDateString('pt-PT')}
                  </span>
                  <span className="accoes-linha">
                    <button type="button" onClick={() => setARenomear(projeto.id)} title="Renomear">
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => void armazem.duplicarProjeto(projeto.id)}
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
                        if (window.confirm(aviso)) void armazem.apagarProjeto(projeto.id)
                      }}
                    >
                      <IconeEliminar />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
