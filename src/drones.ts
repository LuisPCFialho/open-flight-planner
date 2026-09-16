import type { Drone } from './nucleo/tipos.ts'

/**
 * Catalogo de drones.
 *
 * Os valores de `droneEnumValue`, `droneSubEnumValue` e `payloadEnumValue` vem
 * de ficheiros KMZ reais e sao os que decidem se a rota voa ou nao. Os valores
 * de camara, velocidade e autonomia estao por confirmar contra especificacao
 * oficial e ficam editaveis na interface. O campo `porConfirmar` diz quais.
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
    camara: { temZoom: true, fovHorizontalGraus: 84, proporcao: 4 / 3 },
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
      'camara.fovHorizontalGraus',
      'camara.megapixeis',
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
