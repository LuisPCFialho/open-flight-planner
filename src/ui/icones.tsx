/**
 * Icones em SVG proprio.
 *
 * Nunca emoji: o desenho muda entre sistemas e entre versoes, e numa ferramenta
 * onde um simbolo distingue "centrar" de "eliminar" isso nao e aceitavel.
 */

type PropsIcone = { readonly titulo?: string; readonly tamanho?: number }

function Envolucro({
  titulo,
  tamanho = 16,
  children,
}: PropsIcone & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      focusable="false"
    >
      {titulo ? <title>{titulo}</title> : null}
      {children}
    </svg>
  )
}

export function IconeCentrar(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15" />
    </Envolucro>
  )
}

export function IconeEliminar(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4" />
      <path d="M6.6 6.8v4.6M9.4 6.8v4.6" />
    </Envolucro>
  )
}

export function IconeGimbal(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <circle cx="8" cy="6.4" r="2.6" />
      <path d="M3 13.2a5.6 5.6 0 0 1 10 0" />
      <path d="M8 1.2v1.4" />
    </Envolucro>
  )
}

export function IconeGuinada(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M8 1.6 10.6 8 8 6.6 5.4 8z" />
      <path d="M2.6 11.4a6.6 6.6 0 0 0 10.8 0" />
    </Envolucro>
  )
}

export function IconeFoto(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M1.8 4.8h2.6l1-1.6h5.2l1 1.6h2.6v8.4H1.8z" />
      <circle cx="8" cy="8.8" r="2.4" />
    </Envolucro>
  )
}

export function IconeDesfazer(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M3 7.4h7a3.6 3.6 0 0 1 0 7.2H6" />
      <path d="M5.6 4.6 3 7.4l2.6 2.8" />
    </Envolucro>
  )
}

export function IconeRefazer(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M13 7.4H6a3.6 3.6 0 0 0 0 7.2h4" />
      <path d="M10.4 4.6 13 7.4l-2.6 2.8" />
    </Envolucro>
  )
}

export function IconeDescolagem(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M1.6 13.6h12.8" />
      <path d="M2.8 9.2 4.6 8l3 1.8 3.8-4.6a1.3 1.3 0 0 1 2 1.6l-3 5.2H4.2z" />
    </Envolucro>
  )
}

export function IconeTerreno(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M1.4 12.6 5.6 5l2.8 4.4L10.2 7l4.4 5.6z" />
    </Envolucro>
  )
}

export function IconeDescarregar(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M8 1.8v8.4M4.8 7 8 10.2 11.2 7" />
      <path d="M2.4 11.4v1.6a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2v-1.6" />
    </Envolucro>
  )
}

export function IconeCarregar(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M8 10.2V1.8M4.8 5 8 1.8 11.2 5" />
      <path d="M2.4 11.4v1.6a1.2 1.2 0 0 0 1.2 1.2h8.8a1.2 1.2 0 0 0 1.2-1.2v-1.6" />
    </Envolucro>
  )
}

export function IconeReproduzir(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M5 3.2 12.4 8 5 12.8Z" fill="currentColor" />
    </Envolucro>
  )
}

export function IconePausa(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M5.6 3.4v9.2M10.4 3.4v9.2" strokeWidth="2.2" />
    </Envolucro>
  )
}

/** Voltar ao principio, como o botao de rebobinar de um leitor. */
export function IconeInicio(props: PropsIcone) {
  return (
    <Envolucro {...props}>
      <path d="M4.2 3.4v9.2" strokeWidth="2" />
      <path d="M13 3.6 6.4 8 13 12.4Z" fill="currentColor" />
    </Envolucro>
  )
}
