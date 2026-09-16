/**
 * O pouco de WebGL que as camadas personalizadas do mapa partilham.
 *
 * Sao duas coisas: ligar um programa com mensagens de erro que se leiam, e
 * compor a matriz do MapLibre com uma origem local sem perder precisao.
 */

/**
 * Compoe `mvp` com uma translacao para a origem local, ainda em dupla precisao,
 * e so depois converte para float32.
 *
 * As coordenadas Mercator sao da ordem de 0,5 e um float32 tem cerca de sete
 * digitos significativos, o que daria erros de metros. Por isso os vertices vao
 * para a placa grafica relativos a uma origem local. Fazer a conta ao contrario
 * - converter primeiro, transladar depois - devolveria o mesmo erro que se
 * queria evitar.
 */
export function matrizComTranslacao(
  mvp: ArrayLike<number>,
  origem: readonly [number, number, number],
): Float32Array {
  const m = new Float32Array(16)
  const [ox, oy, oz] = origem

  for (let coluna = 0; coluna < 3; coluna++) {
    for (let linha = 0; linha < 4; linha++) {
      m[coluna * 4 + linha] = mvp[coluna * 4 + linha] ?? 0
    }
  }
  for (let linha = 0; linha < 4; linha++) {
    m[12 + linha] =
      (mvp[linha] ?? 0) * ox +
      (mvp[4 + linha] ?? 0) * oy +
      (mvp[8 + linha] ?? 0) * oz +
      (mvp[12 + linha] ?? 0)
  }
  return m
}

export function ligarPrograma(
  gl: WebGL2RenderingContext,
  fonteVertice: string,
  fonteFragmento: string,
  nome: string,
): WebGLProgram {
  const programa = gl.createProgram()
  const vertice = compilar(gl, gl.VERTEX_SHADER, fonteVertice, nome)
  const fragmento = compilar(gl, gl.FRAGMENT_SHADER, fonteFragmento, nome)

  gl.attachShader(programa, vertice)
  gl.attachShader(programa, fragmento)
  gl.linkProgram(programa)
  gl.deleteShader(vertice)
  gl.deleteShader(fragmento)

  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    const registo = gl.getProgramInfoLog(programa)
    gl.deleteProgram(programa)
    throw new Error(`nao foi possivel ligar o programa ${nome}: ${registo ?? 'sem detalhe'}`)
  }
  return programa
}

function compilar(
  gl: WebGL2RenderingContext,
  tipo: number,
  fonte: string,
  nome: string,
): WebGLShader {
  const shader = gl.createShader(tipo)
  if (!shader) throw new Error(`nao foi possivel criar o shader de ${nome}`)
  gl.shaderSource(shader, fonte)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const registo = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de ${nome} nao compila: ${registo ?? 'sem detalhe'}`)
  }
  return shader
}
