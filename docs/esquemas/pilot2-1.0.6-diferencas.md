# Dialeto DJI Pilot 2 / FlightHub 2 (http://www.dji.com/wpmz/1.0.6)

Diferencas face ao dialeto Fly (ver `fly-1.0.2-*`). Fonte: exportacao do FlightHub 2 com Mavic 3T.

## Namespace

```xml
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.6">
```

## missionConfig acrescenta

```xml
<wpml:takeOffSecurityHeight>20</wpml:takeOffSecurityHeight>
<wpml:takeOffRefPoint>40.746552,-8.410610,417.225221</wpml:takeOffRefPoint>
<wpml:takeOffRefPointAGLHeight>0</wpml:takeOffRefPointAGLHeight>
<wpml:globalRTHHeight>100</wpml:globalRTHHeight>
<wpml:waylineAvoidLimitAreaMode>0</wpml:waylineAvoidLimitAreaMode>
<wpml:payloadInfo>
  <wpml:payloadEnumValue>67</wpml:payloadEnumValue>
  <wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>
  <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
</wpml:payloadInfo>
```

## template.kml

Leva o percurso todo, dentro de um `Folder` com `templateType`, `waylineCoordinateSysParam`
(`coordinateMode` WGS84 e `heightMode` EGM96), `globalHeight`, `gimbalPitchMode` e
`globalWaypointHeadingParam`. Cada waypoint tem `ellipsoidHeight` e `height`, nao `executeHeight`.

## waylines.wpml

- `executeHeightMode` = `WGS84`, alturas absolutas
- `actionGroupMode` = `sequence`
- existe a accao `zoom`

## Cota ortometrica, regra confirmada

`ellipsoidHeight - height` = ondulacao do geoide. Ver `../observacoes-pilot2-simulador.md`,
onde o valor de 55,6 m em Sever do Vouga esta confirmado por tres leituras independentes.

Ao importar, usar a diferenca que vem no proprio ficheiro.
Ao exportar, calcular a partir do modelo EGM96 ou deixar o utilizador introduzi-la.
