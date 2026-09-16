/**
 * O que muda como o terreno se lê, e não o que a rota é.
 *
 * Fica junto à bússola, que é o outro comando que é da vista e não do projeto.
 */

type Props = {
  sombreado: boolean
  aoMudarSombreado: (activo: boolean) => void
}

export function ControlosVista({ sombreado, aoMudarSombreado }: Props) {
  return (
    <div className="controlos-vista">
      <label
        className="controlo-vista-linha"
        title="Sombra as encostas conforme a inclinação, para se lerem melhor"
      >
        <input
          type="checkbox"
          checked={sombreado}
          onChange={(evento) => aoMudarSombreado(evento.target.checked)}
        />
        <span>Sombreado</span>
      </label>
    </div>
  )
}
