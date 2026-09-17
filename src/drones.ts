import type { Drone } from './nucleo/tipos.ts'

/**
 * Catalogo de drones.
 *
 * ## Os numeros que decidem se a rota voa
 *
 * `droneEnumValue`, `droneSubEnumValue` e `payloadEnumValue` sao o que o
 * aparelho le para saber se o ficheiro e para ele. Com o numero errado, ou
 * recusa a rota ou - pior - aceita-a e comporta-se como outro modelo.
 *
 * Vem de duas fontes, e a diferenca importa:
 *
 * - **A linha empresarial** esta publicada na documentacao da Cloud API da DJI,
 *   no repositorio `dji-sdk/Cloud-API-Doc`, ficheiro `40.common-element.md`.
 *   Sao os valores oficiais e estao todos aqui.
 * - **A linha de consumo** - Mini, Air - nao tem tabela publicada. O 68/0 do
 *   Mini 5 Pro saiu de um KMZ real extraido do aparelho. Para os outros nao ha
 *   maneira de os descobrir sem um ficheiro de cada um, e por isso nao estao
 *   aqui: um numero inventado daria uma rota que nao voa.
 *
 * O Mavic 3T serve de aferidor das duas fontes. Os valores que o operador tirou
 * do ficheiro dele - 77/1 com payload 67 - sao exactamente os que a
 * documentacao da DJI publica. As duas leituras batem certo.
 *
 * ## As especificacoes
 *
 * Camara, velocidade e autonomia saem das fichas tecnicas do fabricante, e so
 * entram aqui quando ha numero publicado. O que falta fica de fora e aparece em
 * `porConfirmar`, que a aplicacao mostra a quem escolher o aparelho.
 *
 * Um cuidado que vale a pena repetir: a **velocidade maxima em missao de
 * waypoints** nao e a velocidade maxima do aparelho. As fichas anunciam a
 * segunda, que em modo desportivo e bem maior, e usa-la aqui daria duracoes
 * estimadas que nao se cumprem. So entra quando for medida.
 */
export const DRONES: readonly Drone[] = [
  {
    id: 'mini5pro',
    nome: 'DJI Mini 5 Pro',
    dialeto: 'fly',
    droneEnumValue: 68,
    droneSubEnumValue: 0,
    // Valores do Fly More Combo Plus, confirmados pelo operador em 16/09/2026.
    camara: { temZoom: false, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 50 },
    velocidadeMaxWaypoint: 15,
    alturaMaxima: 4500,
    autonomiaMinutos: 52,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
    ],
    porConfirmar: [],
  },
  {
    id: 'mavic3t',
    nome: 'DJI Mavic 3T',
    dialeto: 'pilot2',
    droneEnumValue: 77,
    droneSubEnumValue: 1,
    payloadEnumValue: 67,
    payloadSubEnumValue: 0,
    // Valores confirmados pelo operador em 16/09/2026.
    camara: { temZoom: true, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 48 },
    velocidadeMaxWaypoint: 15,
    alturaMaxima: 6000,
    autonomiaMinutos: 45,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: [],
  },

  /*
   * A partir daqui, linha empresarial. Enum values da documentacao da Cloud API
   * da DJI; especificacoes das fichas tecnicas do fabricante.
   */
  {
    id: 'mavic3e',
    nome: 'DJI Mavic 3E',
    dialeto: 'pilot2',
    droneEnumValue: 77,
    droneSubEnumValue: 0,
    payloadEnumValue: 66,
    payloadSubEnumValue: 0,
    camara: { temZoom: false, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 20 },
    alturaMaxima: 6000,
    autonomiaMinutos: 45,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
    ],
    porConfirmar: ['velocidadeMaxWaypoint'],
  },
  {
    id: 'mavic3m',
    nome: 'DJI Mavic 3M',
    dialeto: 'pilot2',
    droneEnumValue: 77,
    droneSubEnumValue: 2,
    payloadEnumValue: 68,
    payloadSubEnumValue: 0,
    camara: { temZoom: false, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 20 },
    alturaMaxima: 6000,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
    ],
    porConfirmar: ['velocidadeMaxWaypoint', 'autonomiaMinutos'],
  },
  {
    id: 'm30',
    nome: 'DJI Matrice 30',
    dialeto: 'pilot2',
    droneEnumValue: 67,
    droneSubEnumValue: 0,
    payloadEnumValue: 52,
    payloadSubEnumValue: 0,
    camara: { temZoom: true, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 12 },
    alturaMaxima: 5000,
    autonomiaMinutos: 41,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: ['velocidadeMaxWaypoint'],
  },
  {
    id: 'm30t',
    nome: 'DJI Matrice 30T',
    dialeto: 'pilot2',
    droneEnumValue: 67,
    droneSubEnumValue: 1,
    payloadEnumValue: 53,
    payloadSubEnumValue: 0,
    camara: { temZoom: true, fovHorizontalGraus: 84, proporcao: 4 / 3, megapixeis: 12 },
    alturaMaxima: 5000,
    autonomiaMinutos: 41,
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: ['velocidadeMaxWaypoint'],
  },
  {
    id: 'm3d',
    nome: 'DJI Matrice 3D',
    dialeto: 'pilot2',
    droneEnumValue: 91,
    droneSubEnumValue: 0,
    payloadEnumValue: 80,
    payloadSubEnumValue: 0,
    camara: { temZoom: false },
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
    ],
    porConfirmar: ['camara', 'velocidadeMaxWaypoint', 'alturaMaxima', 'autonomiaMinutos'],
  },
  {
    id: 'm3td',
    nome: 'DJI Matrice 3TD',
    dialeto: 'pilot2',
    droneEnumValue: 91,
    droneSubEnumValue: 1,
    payloadEnumValue: 81,
    payloadSubEnumValue: 0,
    camara: { temZoom: true },
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: ['camara', 'velocidadeMaxWaypoint', 'alturaMaxima', 'autonomiaMinutos'],
  },
  /*
   * As plataformas de carga trocavel entram sem `payloadEnumValue`.
   *
   * Num M300 ou M350 a camara depende do que la estiver pendurado - H20, H20T,
   * H20N, H30, H30T - e fixar um numero aqui daria rotas com a carga errada
   * declarada. Quem usar uma destas tem de dizer qual leva.
   */
  {
    id: 'm300',
    nome: 'DJI Matrice 300 RTK',
    dialeto: 'pilot2',
    droneEnumValue: 60,
    droneSubEnumValue: 0,
    camara: { temZoom: true },
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: [
      'payloadEnumValue',
      'camara',
      'velocidadeMaxWaypoint',
      'alturaMaxima',
      'autonomiaMinutos',
    ],
  },
  {
    id: 'm350',
    nome: 'DJI Matrice 350 RTK',
    dialeto: 'pilot2',
    droneEnumValue: 89,
    droneSubEnumValue: 0,
    camara: { temZoom: true },
    accoesSuportadas: [
      'tirarFoto',
      'iniciarGravacao',
      'pararGravacao',
      'rodarGimbal',
      'rodarAeronave',
      'pairar',
      'zoom',
    ],
    porConfirmar: [
      'payloadEnumValue',
      'camara',
      'velocidadeMaxWaypoint',
      'alturaMaxima',
      'autonomiaMinutos',
    ],
  },
]

export function droneComId(id: string): Drone {
  const drone = DRONES.find((d) => d.id === id)
  if (!drone) throw new Error(`drone desconhecido: ${id}`)
  return drone
}
