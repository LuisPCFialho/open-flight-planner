/**
 * Os dois botões que mudam como o terreno se lê, e não o que a rota é.
 *
 * Ficam junto à bússola, que é o outro comando que é da vista e não do projeto.
 */

export const EXAGERO_MINIMO = 1
export const EXAGERO_MAXIMO = 3

type Props = {
  modo3D: boolean
  exageroVertical: number
  aoMudarExagero: (valor: number) => void
  sombreado: boolean
  aoMudarSombreado: (activo: boolean) => void
}

export function ControlosVista({
  modo3D,
  exageroVertical,
  aoMudarExagero,
  sombreado,
  aoMudarSombreado,
}: Props) {
  return (
    <div className="controlos-vista">
      <label className="controlo-vista-linha">
        <input
          type="checkbox"
          checked={sombreado}
          onChange={(evento) => aoMudarSombreado(evento.target.checked)}
        />
        <span>Sombreado</span>
      </label>

      {/*
        * O exagero só existe em 3D: em planta não há altura que esticar, e o
        * comando ficaria ali a não fazer nada.
        */}
      {modo3D ? (
        <label
          className="controlo-vista-linha"
          title="Estica a altura do terreno. Ajuda a ler encostas suaves, mas deixa de ser a forma real."
        >
          <span className="numerico">Relevo {exageroVertical.toFixed(1)}&times;</span>
          <input
            type="range"
            min={EXAGERO_MINIMO}
            max={EXAGERO_MAXIMO}
            step={0.1}
            value={exageroVertical}
            onChange={(evento) => aoMudarExagero(Number(evento.target.value))}
            aria-label="Exagero vertical do terreno"
          />
        </label>
      ) : null}
    </div>
  )
}
