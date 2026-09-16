/**
 * Dar um ficheiro ao utilizador.
 *
 * Vive na raiz porque e usado pelos tres sitios que exportam - o KMZ, o KML e o
 * ficheiro de projeto - e estava escrito tres vezes, com tres diferencas.
 *
 * A primeira era um `revokeObjectURL` sem `finally`: uma excepcao no meio
 * deixava o blob em memoria ate a pagina fechar. A segunda era o nome do
 * ficheiro, tratado de duas maneiras diferentes - ver `nomeSeguro`.
 */

/**
 * Nome de ficheiro seguro, derivado de um nome escrito por gente.
 *
 * A normalizacao NFD e o passo que nao se pode saltar. Sem ela, `\w` - que em
 * JavaScript so conhece ASCII - apaga as letras acentuadas em vez de as
 * simplificar: "Rota da Ínsua" dava `rota-da--nsua`, e num projecto portugues
 * quase todos os nomes tem acentos. Com ela, a acentuacao separa-se da letra e
 * so os acentos sao apagados: `rota-da-insua`.
 */
export function nomeSeguro(nome: string, extensao: string, alternativa = 'ficheiro'): string {
  const limpo = nome
    .normalize('NFD')
    // Sinais diacriticos combinantes, que a NFD acabou de separar das letras.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  return `${limpo || alternativa}.${extensao}`
}

/** Entrega o conteudo ao browser com o nome dado. */
export function descarregar(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo)
  try {
    const ligacao = document.createElement('a')
    ligacao.href = url
    ligacao.download = nome
    document.body.appendChild(ligacao)
    ligacao.click()
    ligacao.remove()
  } finally {
    // Sem isto o blob fica em memoria ate a pagina fechar.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** O mesmo, para texto: poupa o `new Blob` em cada chamada. */
export function descarregarTexto(texto: string, nome: string, tipo: string): void {
  descarregar(new Blob([texto], { type: tipo }), nome)
}
