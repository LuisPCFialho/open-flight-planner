import type { Area, LatLon } from '../nucleo/tipos.ts'
import { areaDoContorno, centroDasAreas, envolvente, formatarArea } from '../nucleo/areas.ts'
import { importarAreas } from '../kmz/ficheiro.ts'
import { FonteTerrenoDXF } from '../terreno/fonte-dxf.ts'

/**
 * Os dois botoes que trazem ficheiros de fora para dentro da rota.
 *
 * Estao juntos porque sao a mesma sequencia - escolher, ler, dizer o que veio ou
 * porque nao veio - e porque a parte que interessa nao e o botao, e o que
 * acontece quando o ficheiro nao e o que se esperava. Um KMZ so com marcadores,
 * um DXF noutro sistema de coordenadas: o que o operador tem de ver e uma frase
 * que diga o que falta, e nao um botao que nao faz nada.
 *
 * Limpar `evento.target.value` depois de ler e o que permite escolher o mesmo
 * ficheiro outra vez. Sem isso, corrigir o desenho e voltar a importa-lo nao
 * dava sinal nenhum.
 */

/** O que um ficheiro de areas traz, ja com a geometria calculada. */
export type AreasImportadas = {
  areas: Area[]
  /** Uma linha a dizer o que veio, ja com os avisos do ficheiro. */
  resumo: string
  centro: LatLon | null
  /** Para enquadrar a vista: o ficheiro e quase sempre de outro sitio do mapa. */
  caixa: [[number, number], [number, number]] | null
}

/**
 * Importa poligonos de um KMZ ou KML.
 *
 * Serve os dois tipos de area, que entram pelo mesmo caminho e so diferem no
 * que querem dizer: o limite do que ha para filmar, ou um sitio por onde a rota
 * nao pode passar. Quem decide e o botao por onde se importa, e nao o ficheiro.
 */
export function BotaoAreas({
  areas,
  aoImportar,
  aoFalhar,
  tipo = 'referencia',
}: {
  areas: readonly Area[] | undefined
  aoImportar: (importadas: AreasImportadas) => void
  aoFalhar: (mensagem: string) => void
  tipo?: 'referencia' | 'exclusao'
}) {
  const interdita = tipo === 'exclusao'
  const minhas = (areas ?? []).filter((a) => (a.tipo === 'exclusao') === interdita)
  const total = minhas.reduce((soma, a) => soma + areaDoContorno(a.contorno), 0)

  return (
    <label
      className={`botao-ficheiro ${minhas.length ? 'activo' : ''}${interdita ? ' interdita' : ''}`}
      title={
        minhas.length
          ? `${minhas.length} ${interdita ? 'zona(s) interdita(s)' : 'área(s) de referência'}, ${formatarArea(total)} no total. Importar de novo substitui.`
          : interdita
            ? 'Importar KMZ ou KML com polígonos por onde a rota não pode passar - o posto de transformação, a parcela do vizinho, o corredor de uma linha'
            : 'Importar KMZ ou KML com polígonos, para ter no mapa o contorno da área a filmar'
      }
    >
      {interdita ? 'Zona interdita' : 'Área'}
      <input
        type="file"
        accept=".kmz,.kml"
        /*
         * O tipo vai no elemento para se poderem distinguir os dois campos de
         * fora. Sao dois ficheiros com o mesmo `accept`, e sem isto um ensaio
         * de ponta a ponta nao tem como dizer em qual esta a carregar - foi
         * assim que o percurso critico partiu ao aparecer o segundo botao.
         */
        data-tipo={tipo}
        hidden
        onChange={(evento) => {
          const ficheiro = evento.target.files?.[0]
          evento.target.value = ''
          if (!ficheiro) return

          void importarAreas(ficheiro)
            .then(({ areas: lidas, avisos }) => {
              const marcadas = lidas.map((a) => ({ ...a, tipo }))
              const soma = lidas.reduce((acc, a) => acc + areaDoContorno(a.contorno), 0)
              aoImportar({
                areas: marcadas,
                resumo: [
                  `${ficheiro.name}: ${lidas.length} ${interdita ? 'zona(s) interdita(s)' : 'área(s)'}, ${formatarArea(soma)}`,
                  ...avisos,
                ].join('. '),
                centro: centroDasAreas(lidas),
                caixa: envolvente(lidas.flatMap((a) => a.contorno)),
              })
            })
            .catch((causa: unknown) => {
              aoFalhar(causa instanceof Error ? causa.message : 'falha a ler as áreas')
            })
        }}
      />
    </label>
  )
}

export function BotaoTopografia({
  topografia,
  aoImportar,
  aoFalhar,
}: {
  topografia: FonteTerrenoDXF | null
  aoImportar: (fonte: FonteTerrenoDXF, resumo: string) => void
  aoFalhar: (mensagem: string) => void
}) {
  return (
    <label
      className={`botao-ficheiro ${topografia ? 'activo' : ''}`}
      title={
        topografia
          ? `Topografia activa: ${topografia.topografia.camadas.join(', ')}`
          : 'Importar topografia DXF em ETRS89 / PT-TM06'
      }
    >
      DXF
      <input
        type="file"
        accept=".dxf"
        hidden
        onChange={(evento) => {
          const ficheiro = evento.target.files?.[0]
          evento.target.value = ''
          if (!ficheiro) return

          /*
           * O leitor de DXF entra a pedido.
           *
           * Traz consigo o analisador de DXF, que so faz falta a quem importa
           * topografia - e isso e uma vez por projecto, quando ha. Carregado de
           * origem, atrasava o arranque de toda a gente.
           */
          void ficheiro
            .text()
            .then(async (texto) => {
              const { lerDXF } = await import('../terreno/dxf.ts')
              const lida = lerDXF(texto)
              aoImportar(
                new FonteTerrenoDXF(lida),
                `${ficheiro.name}: ${lida.triangulos.length} triangulos e ${lida.pontos.length} pontos cotados, nas camadas ${lida.camadas.join(', ')}`,
              )
            })
            .catch((causa: unknown) => {
              aoFalhar(causa instanceof Error ? causa.message : 'não foi possível ler o DXF')
            })
        }}
      />
    </label>
  )
}
