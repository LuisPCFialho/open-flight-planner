import type { Rota } from '../nucleo/tipos.ts'
import type { ComandosVoo } from '../estado/useVooVirtual.ts'
import type { Replay } from '../estado/useReplay.ts'
import { IconeDesfazer, IconeRefazer, IconeTerreno } from './icones.tsx'

/**
 * Os comandos que mudam o que o rato faz e o que a vista mostra.
 *
 * Estao separados dos botoes de ficheiro porque sao de outra natureza: nenhum
 * deles toca na rota gravada. Ligam e desligam modos, e sair de qualquer um
 * deles deixa tudo como estava.
 *
 * O `Criar waypoints` existe por si e nao por arrumacao: sem ele, qualquer
 * clique no mapa a olhar para o terreno deixava la um waypoint.
 */

export type ModoMapa = 'navegar' | 'waypoint' | 'poi' | 'medir'

type Props = {
  rota: Rota
  modoMapa: ModoMapa
  /** Liga o modo, ou volta a navegar se ele ja estiver ligado. */
  aoAlternarModo: (modo: 'waypoint' | 'poi' | 'medir') => void
  voo: ComandosVoo
  replay: Replay
  modo3D: boolean
  aoAlternar3D: () => void
  podeDesfazer: boolean
  podeRefazer: boolean
  aoDesfazer: () => void
  aoRefazer: () => void
}

/** Altura de arranque do voo virtual quando a rota ainda nao tem waypoints. */
const ALTURA_DE_ARRANQUE = 60

export function BarraModos({
  rota,
  modoMapa,
  aoAlternarModo,
  voo,
  replay,
  modo3D,
  aoAlternar3D,
  podeDesfazer,
  podeRefazer,
  aoDesfazer,
  aoRefazer,
}: Props) {
  return (
    <>
      <button
        type="button"
        className={modoMapa === 'waypoint' ? 'activo' : ''}
        title="Enquanto estiver ligado, clicar no mapa acrescenta um waypoint. Alt e clique num troço insere no meio."
        onClick={() => aoAlternarModo('waypoint')}
      >
        Criar waypoints
      </button>

      <button
        type="button"
        className={modoMapa === 'poi' ? 'activo' : ''}
        title="Clicar no mapa cria um ponto de interesse"
        onClick={() => aoAlternarModo('poi')}
      >
        POI
      </button>

      <button
        type="button"
        className={modoMapa === 'medir' ? 'activo' : ''}
        title="Medir distâncias e áreas no mapa, sem mexer na rota"
        onClick={() => aoAlternarModo('medir')}
      >
        Medir
      </button>

      <button
        type="button"
        className={voo.activo ? 'activo' : ''}
        title="Pilotar a aeronave pelo mapa e gravar waypoints com a atitude em que está"
        onClick={() => {
          if (voo.activo) {
            voo.parar()
            return
          }
          /*
           * A aeronave arranca de onde a rota acabou, e com a atitude que la
           * ficou. Arrancar do ponto de descolagem obrigava a repetir o
           * caminho todo de cada vez que se retomava o trabalho.
           */
          const ultimo = rota.waypoints.at(-1)
          voo.arrancar({
            posicao: ultimo
              ? { lat: ultimo.lat, lon: ultimo.lon }
              : { lat: rota.pontoDescolagem.lat, lon: rota.pontoDescolagem.lon },
            altura: ultimo?.altura ?? ALTURA_DE_ARRANQUE,
            guinada: ultimo?.guinada ?? 0,
            gimbalPitch: ultimo?.gimbalPitch ?? -30,
            gimbalYaw: ultimo?.gimbalYaw ?? 0,
          })
        }}
      >
        Voo virtual
      </button>

      <button
        type="button"
        className={replay.activo ? 'activo' : ''}
        disabled={rota.waypoints.length < 2}
        title="Percorrer a rota no tempo, para ver o voo antes de o fazer"
        onClick={() => {
          if (replay.activo) {
            replay.fechar()
            return
          }
          // Os dois não correm ao mesmo tempo: são duas aeronaves no mesmo sítio.
          if (voo.activo) voo.parar()
          replay.abrir()
        }}
      >
        Replay
      </button>

      <button type="button" title="Desfazer (Ctrl+Z)" disabled={!podeDesfazer} onClick={aoDesfazer}>
        <IconeDesfazer />
      </button>

      <button
        type="button"
        title="Refazer (Ctrl+Shift+Z)"
        disabled={!podeRefazer}
        onClick={aoRefazer}
      >
        <IconeRefazer />
      </button>

      <button
        type="button"
        className={modo3D ? 'activo' : ''}
        onClick={aoAlternar3D}
        title="Alternar entre 2D e 3D"
      >
        <IconeTerreno />
        {modo3D ? '3D' : '2D'}
      </button>
    </>
  )
}
