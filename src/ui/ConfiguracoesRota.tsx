import type {
  Drone,
  ModoAltitude,
  ModoDescolagem,
  Rota,
} from '../nucleo/tipos.ts'
import type { ModoCamaraTrajecto } from '../nucleo/camara-trajecto.ts'
import { DRONES } from '../drones.ts'
import { CampoNumerico, CampoSelecao } from './campos.tsx'
import { IconeDescolagem } from './icones.tsx'
import { PainelVento } from './PainelVento.tsx'
import { ACCOES_FINAIS, PERDA_SINAL } from './nomes.ts'

const MODOS_ALTITUDE: readonly { valor: ModoAltitude; rotulo: string; ajuda: string }[] = [
  { valor: 'ASL', rotulo: 'ASL', ajuda: 'Acima do nível médio do mar' },
  { valor: 'ALT', rotulo: 'ALT', ajuda: 'Relativa à cota do ponto de descolagem' },
  { valor: 'AGL', rotulo: 'AGL', ajuda: 'Acima do solo em cada ponto' },
]

const MODOS_CAMARA: readonly {
  valor: ModoCamaraTrajecto
  rotulo: string
  ajuda: string
}[] = [
  {
    valor: 'manter',
    rotulo: 'Manter',
    ajuda: 'Cada waypoint fica com os ângulos que lá estiverem gravados',
  },
  {
    valor: 'proximoWaypoint',
    rotulo: 'Seguir o percurso',
    ajuda: 'A câmara vai a olhar para o waypoint seguinte, como quem segue o caminho',
  },
  {
    valor: 'terreno',
    rotulo: 'Olhar o terreno',
    ajuda: 'A câmara aponta a prumo ao solo, para levantamento',
  },
]

type Props = {
  rota: Rota
  drone: Drone
  /** `null` enquanto nao for possivel converter, com a razao para mostrar. */
  impedimentoConversao: string | null
  aoAlterarRota: (alteracao: Partial<Rota>) => void
  aoMudarModoAltitude: (modo: ModoAltitude) => void
  /** Escreve os ângulos do modo em cada waypoint, e volta ao modo Manter. */
  aoFixarCamaraNosWaypoints: () => void
  aoFechar: () => void
}

export function ConfiguracoesRota({
  rota,
  drone,
  impedimentoConversao,
  aoAlterarRota,
  aoMudarModoAltitude,
  aoFixarCamaraNosWaypoints,
  aoFechar,
}: Props) {
  return (
    <div className="painel-flutuante" role="dialog" aria-label="Configurações de rota de voo">
      <header className="painel-cabecalho">
        <h2>Configurações de rota de voo</h2>
        <button type="button" onClick={aoFechar} title="Fechar">
          Fechar
        </button>
      </header>

      <div className="painel-conteudo">
        <section className="grupo">
          <h3>
            <IconeDescolagem /> Ponto de descolagem
          </h3>
          <p className="leitura-auxiliar numerico">
            {rota.pontoDescolagem.lat.toFixed(6)}, {rota.pontoDescolagem.lon.toFixed(6)}
            <br />
            Cota do terreno: {rota.pontoDescolagem.cotaTerreno.toFixed(1)} m ASL
            {'  '}({(rota.pontoDescolagem.cotaTerreno + rota.ondulacaoGeoide).toFixed(1)} m HAE)
          </p>
        </section>

        <section className="grupo">
          <h3>Descolagem</h3>
          <div className="alternador">
            {(['subidaDireta', 'descolagemSegura'] as ModoDescolagem[]).map((modo) => (
              <button
                key={modo}
                type="button"
                className={rota.modoDescolagem === modo ? 'activo' : ''}
                onClick={() => aoAlterarRota({ modoDescolagem: modo })}
              >
                {modo === 'subidaDireta' ? 'Subida direta' : 'Descolagem segura'}
              </button>
            ))}
          </div>
          <CampoNumerico
            rotulo="Altura de descolagem segura"
            valor={rota.alturaSegurancaDescolagem}
            unidade=" m"
            min={0}
            max={500}
            incrementos={[100, 10]}
            desactivado={rota.modoDescolagem !== 'descolagemSegura'}
            aoAlterar={(v) => aoAlterarRota({ alturaSegurancaDescolagem: v })}
          />
        </section>

        <section className="grupo">
          <h3>Modo de altitude da trajetória</h3>
          <div className="alternador">
            {MODOS_ALTITUDE.map((modo) => (
              <button
                key={modo.valor}
                type="button"
                title={modo.ajuda}
                className={rota.modoAltitude === modo.valor ? 'activo' : ''}
                disabled={impedimentoConversao !== null && rota.modoAltitude !== modo.valor}
                onClick={() => aoMudarModoAltitude(modo.valor)}
              >
                {modo.rotulo}
              </button>
            ))}
          </div>
          <p className="nota">
            {impedimentoConversao ??
              'Mudar de modo reescreve as alturas sem mexer na posição real de nenhum waypoint.'}
          </p>
        </section>

        <section className="grupo">
          <h3>Câmara ao longo do trajeto</h3>
          <div className="alternador">
            {MODOS_CAMARA.map((modo) => (
              <button
                key={modo.valor}
                type="button"
                title={modo.ajuda}
                className={rota.modoCamaraTrajecto === modo.valor ? 'activo' : ''}
                onClick={() => aoAlterarRota({ modoCamaraTrajecto: modo.valor })}
              >
                {modo.rotulo}
              </button>
            ))}
          </div>
          <p className="nota">
            {MODOS_CAMARA.find((m) => m.valor === rota.modoCamaraTrajecto)?.ajuda}
            {'. '}
            Entre dois waypoints a câmara passa de uma atitude para a outra pelo caminho,
            em vez de corrigir tudo de uma vez à chegada.
          </p>
          <button
            type="button"
            disabled={rota.modoCamaraTrajecto === 'manter'}
            onClick={aoFixarCamaraNosWaypoints}
            title="Escreve os ângulos calculados em cada waypoint, para depois se poderem acertar à mão"
          >
            Fixar nos waypoints
          </button>
        </section>

        <section className="grupo">
          <h3>Voo</h3>
          <CampoNumerico
            rotulo="Velocidade de voo global"
            valor={rota.velocidadeGlobal}
            unidade=" m/s"
            casas={1}
            min={0.5}
            max={23}
            passo={0.5}
            aoAlterar={(v) => aoAlterarRota({ velocidadeGlobal: v })}
          />
          <CampoSelecao
            rotulo="Ao terminar"
            valor={rota.acaoFinal}
            opcoes={ACCOES_FINAIS}
            aoAlterar={(v) => aoAlterarRota({ acaoFinal: v })}
          />
          <CampoSelecao
            rotulo="Se perder o sinal"
            valor={rota.acaoPerdaSinal}
            opcoes={PERDA_SINAL}
            aoAlterar={(v) => aoAlterarRota({ acaoPerdaSinal: v })}
          />
          <CampoNumerico
            rotulo="Altura de regresso"
            valor={rota.alturaRTH}
            unidade=" m"
            min={20}
            max={500}
            incrementos={[100, 10]}
            aoAlterar={(v) => aoAlterarRota({ alturaRTH: v })}
          />
        </section>

        <PainelVento vento={rota.vento} aoAlterar={(vento) => aoAlterarRota({ vento })} />

        <section className="grupo">
          <h3>Limites acima do solo</h3>
          <CampoNumerico
            rotulo="Altura mínima acima do solo"
            valor={rota.alturaMinimaAcimaDoSolo}
            unidade=" m"
            min={1}
            max={120}
            incrementos={[10, 5]}
            aoAlterar={(v) => aoAlterarRota({ alturaMinimaAcimaDoSolo: v })}
          />
          <p className="nota">
            30 m serve o registo fotografico de obra. A inspeccao de paineis faz-se entre
            20 e 40 m, e com o limite em 30 m uma rota dessas nao chegaria a exportar.
            O máximo de 120 m não se mexe: é regulamentar.
          </p>
        </section>

        <section className="grupo">
          <h3>Aeronave</h3>
          <CampoSelecao
            rotulo="Drone"
            valor={rota.droneId}
            opcoes={DRONES.map((d) => ({ valor: d.id, rotulo: `${d.nome} (${d.dialeto})` }))}
            aoAlterar={(v) => aoAlterarRota({ droneId: v })}
          />
          {drone.porConfirmar.length > 0 ? (
            <p className="nota aviso">
              Por confirmar neste drone: {drone.porConfirmar.join(', ')}.
            </p>
          ) : null}
        </section>

        <section className="grupo">
          <h3>Geoide</h3>
          <CampoNumerico
            rotulo="Ondulação do geoide (HAE menos ASL)"
            valor={rota.ondulacaoGeoide}
            unidade=" m"
            casas={1}
            min={-120}
            max={120}
            passo={0.1}
            aoAlterar={(v) => aoAlterarRota({ ondulacaoGeoide: v })}
          />
          <p className="nota">
            55,6 m e o valor confirmado em Sever do Vouga a partir dos pares ASL e HAE do
            Pilot 2. Em Portugal continental anda entre 49 e 57 m. Errar aqui poe a rota
            a essa distancia da altura pedida.
          </p>
        </section>
      </div>
    </div>
  )
}
