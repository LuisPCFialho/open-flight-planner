import type { Area, LatLon } from '../nucleo/tipos.ts'
import { areaDoContorno, centroDasAreas, envolvente, formatarArea } from '../nucleo/areas.ts'
import { importarAreas } from '../kmz/ficheiro.ts'
import { FonteTerrenoDXF } from '../terreno/fonte-dxf.ts'
import { lerDXF } from '../terreno/dxf.ts'

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

export function BotaoAreas({
  areas,
  aoImportar,
  aoFalhar,
}: {
  areas: readonly Area[] | undefined
  aoImportar: (importadas: AreasImportadas) => void
  aoFalhar: (mensagem: string) => void
}) {
  const total = areas?.reduce((soma, a) => soma + areaDoContorno(a.contorno), 0) ?? 0

  return (
    <label
      className={`botao-ficheiro ${areas?.length ? 'activo' : ''}`}
      title={
        areas?.length
          ? `${areas.length} área(s) de referência, ${formatarArea(total)} no total. Importar de novo substitui.`
          : 'Importar KMZ ou KML com polígonos, para ter no mapa o contorno da área a filmar'
      }
    >
      Área
      <input
        type="file"
        accept=".kmz,.kml"
        hidden
        onChange={(evento) => {
          const ficheiro = evento.target.files?.[0]
          evento.target.value = ''
          if (!ficheiro) return

          void importarAreas(ficheiro)
            .then(({ areas: lidas, avisos }) => {
              const soma = lidas.reduce((acc, a) => acc + areaDoContorno(a.contorno), 0)
              aoImportar({
                areas: lidas,
                resumo: [
                  `${ficheiro.name}: ${lidas.length} área(s), ${formatarArea(soma)}`,
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

          void ficheiro
            .text()
            .then((texto) => {
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
