/**
 * Modelo de dados do planeador.
 *
 * Nomes de campos em portugues, sem acentos, conforme especificacao do projeto.
 * Os valores de enumeracao que viajam para dentro do WPML mantem a grafia da DJI
 * (`followWayline`, `goHome`, ...) para nao haver traducao a meio do caminho.
 */

export type LatLon = { lat: number; lon: number }

/** Sistema de referencia da altura declarada em cada waypoint. */
export type ModoAltitude =
  /** Acima do nivel medio do mar, ortometrica (EGM96). */
  | 'ASL'
  /** Relativa a cota do ponto de descolagem. */
  | 'ALT'
  /** Acima do solo no proprio ponto. */
  | 'AGL'

export type ModoGuinada = 'followWayline' | 'towardPOI' | 'fixed' | 'manual'
export type TipoCurva = 'pararNoPonto' | 'passarSuave'
export type AccaoFinal = 'goHome' | 'noAction' | 'autoLand' | 'gotoFirstWaypoint'
export type AccaoPerdaSinal = 'goBack' | 'landing' | 'hover'
export type ModoDescolagem = 'subidaDireta' | 'descolagemSegura'

/** Os dois dialetos incompativeis de WPML. Ver docs/esquemas/. */
export type Dialeto = 'fly' | 'pilot2'

export type Accao =
  | { tipo: 'tirarFoto' }
  | { tipo: 'iniciarGravacao' }
  | { tipo: 'pararGravacao' }
  | { tipo: 'rodarGimbal'; pitch: number; yaw: number }
  | { tipo: 'rodarAeronave'; heading: number }
  | { tipo: 'pairar'; segundos: number }
  | { tipo: 'zoom'; fator: number }

export type TipoAccao = Accao['tipo']

export type POI = {
  id: string
  nome: string
  lat: number
  lon: number
  /** Altura do POI no modo de altitude da rota. */
  altura: number
}

export type Waypoint = {
  id: string
  index: number
  lat: number
  lon: number
  /** Altura no sistema declarado em `Rota.modoAltitude`. */
  altura: number
  /** Metros por segundo. Herda `Rota.velocidadeGlobal` quando ausente. */
  velocidade?: number
  modoGuinada: ModoGuinada
  /** Graus, usado quando `modoGuinada` e 'fixed'. */
  guinada?: number
  poiId?: string
  /** Graus, negativo para baixo. */
  gimbalPitch: number
  gimbalYaw: number
  tipoCurva: TipoCurva
  acoes: Accao[]
}

export type PontoDescolagem = {
  lat: number
  lon: number
  /** Cota ortometrica do terreno (ASL), obtida do motor de terreno. */
  cotaTerreno: number
}

export type Rota = {
  id: string
  nome: string
  projetoId: string
  droneId: string
  pontoDescolagem: PontoDescolagem
  modoAltitude: ModoAltitude
  /** Metros por segundo. */
  velocidadeGlobal: number
  alturaSegurancaDescolagem: number
  modoDescolagem: ModoDescolagem
  acaoFinal: AccaoFinal
  acaoPerdaSinal: AccaoPerdaSinal
  alturaRTH: number
  /**
   * Altura minima acima do solo aceite nesta rota, em metros.
   *
   * 30 m serve o registo fotografico de obra. A inspeccao de paineis
   * fotovoltaicos faz-se rotineiramente entre 20 e 40 m, e com um limite fixo
   * uma rota dessas nunca chegaria a exportar. O maximo de 120 m nao e
   * configuravel porque e regulamentar.
   */
  alturaMinimaAcimaDoSolo: number
  /**
   * Ondulacao do geoide em metros, HAE menos ASL.
   * Confirmada em 55,6 m em Sever do Vouga, ver docs/observacoes-pilot2-simulador.md.
   */
  ondulacaoGeoide: number
  waypoints: Waypoint[]
  pois: POI[]
  criadaEm: number
  alteradaEm: number
}

export type Projeto = {
  id: string
  nome: string
  cliente: string
  local: string
  criadoEm: number
}

export type Camara = {
  /** Graus. Marcado como a confirmar enquanto nao for medido em ficheiro real. */
  fovHorizontalGraus?: number
  megapixeis?: number
  temZoom: boolean
}

export type Drone = {
  id: string
  nome: string
  dialeto: Dialeto
  droneEnumValue: number
  droneSubEnumValue: number
  payloadEnumValue?: number
  payloadSubEnumValue?: number
  camara: Camara
  velocidadeMaxWaypoint?: number
  alturaMaxima?: number
  autonomiaMinutos?: number
  accoesSuportadas: TipoAccao[]
  /** Campos cujo valor ainda nao foi confirmado contra especificacao oficial. */
  porConfirmar: string[]
}
