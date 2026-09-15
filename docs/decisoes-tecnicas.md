# Decisoes tecnicas e armadilhas encontradas

## Ortofoto: o servidor do briefing esta errado

`server.arcgis.com` responde 301 e os mosaicos nunca chegam a carregar.
O correto e `server.arcgisonline.com`:

```
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

Responde 200 com `Access-Control-Allow-Origin: *`. Notar a ordem `{z}/{y}/{x}`, invertida
face ao habitual.

## O motor de terreno nao usa `map.queryTerrainElevation`

`queryTerrainElevation` so responde sobre mosaicos ja carregados, na viewport e no zoom
corrente, e devolve 0 ou `null` fora disso. O perfil de terreno, o nivelamento acima do
solo e as validacoes precisam de cotas em pontos que nao estao no ecra, que e precisamente
onde essa via falha.

`FonteTerrariumAWS` vai buscar os mosaicos Terrarium que precisa, descodifica-os e
interpola. Corre igual no browser, com `createImageBitmap` e `OffscreenCanvas`, e em Node,
com `zlib`, o que permite testar o mesmo codigo de amostragem que corre em producao.

Validacao contra pontos conhecidos:

| ponto | mosaicos | referencia | desvio |
|---|---:|---:|---:|
| Torre, Serra da Estrela | 1987,5 m | 1993 m | -5,5 |
| waypoint 54, Sever do Vouga | 309,5 m | 293,7 m | +15,8 |
| waypoint 57, Sever do Vouga | 274,8 m | 278,1 m | -3,3 |
| waypoint 67, Sever do Vouga | 356,9 m | 360,9 m | -4,0 |
| ponto de descolagem | 355,9 m | 361,6 m | -5,7 |

As referencias de Sever do Vouga foram deduzidas do HUD do simulador do Pilot 2. O SRTM
mede o topo do coberto vegetal e tem mais erro em encosta, o que explica o desvio maior no
waypoint 54.

## A rota 3D precisa de uma camada WebGL propria

O MapLibre nao desenha nada a altitude verdadeira:

- as camadas `line` ignoram o Z das coordenadas
- `Marker` nao aceita altitude
- `fill-extrusion` mede sempre a partir do terreno, nao do nivel do mar

Dai `CamadaRota3D`, que desenha as verticais ate ao solo, o percurso a altura de voo e as
marcas no waypoint e no solo.

### A matriz e `defaultProjectionData.mainMatrix`, nao `modelViewProjectionMatrix`

Esta e a armadilha que mais tempo custou. O objecto que o MapLibre passa ao `render` de uma
camada personalizada tem as duas, e a que funciona com coordenadas Mercator normalizadas,
as mesmas que `MercatorCoordinate.fromLngLat` devolve, e a `mainMatrix`.

Medido com um waypoint em Sever do Vouga, contra `map.project` como referencia:

| matriz | pixel | `w` |
|---|---|---|
| `defaultProjectionData.mainMatrix` | 40, 362 | positivo |
| `modelViewProjectionMatrix` | 549, -216 | **negativo** |
| `map.project` (referencia) | 40, 362 | |

Com `w` negativo a geometria fica atras da camara. O sintoma e uma camada que renderiza sem
lancar erros e nao desenha coisa nenhuma.

O prelude de shader que o MapLibre fornece confirma a convencao:

```glsl
vec4 projectTileWithElevation(vec2 posInTile, float elevation) {
  return u_projection_matrix * vec4(posInTile, elevation, 1.0);
}
```

O Z vai em unidades Mercator, nao em metros. Medido: 300 m deslocam 132 px no ecra com
pitch 62; passar 300 em metros manda o ponto para 2408 px, fora do ecra.

### Precisao: origem local

As coordenadas Mercator andam a volta de 0,5 e um float32 tem cerca de sete digitos
significativos, o que daria erros de metros. Os vertices vao para a placa grafica
relativos ao primeiro waypoint, e a translacao para essa origem e composta na matriz ainda
em dupla precisao.

## O estilo e aplicado depois do construtor

Passar o estilo em `new Map({ style })` faz com que qualquer rejeicao aconteca antes de
haver um handler de `error` registado. O mapa fica mudo, sem camadas, sem eventos, com um
unico fotograma no canvas e nada que o explique. Criar o mapa com um estilo vazio, registar
o handler e so entao chamar `setStyle` torna o erro visivel.

## Ambiente

### Cache do npm

A cache global em `%LOCALAPPDATA%\npm-cache` da erros de I/O neste posto (`EEXIST` no
`_cacache\tmp`, `UNKNOWN` no `scandir`). O `.npmrc` do projeto aponta a cache para
`.npm-cache`, dentro do projeto.

### Cache de dependencias do Vite

Um `504 (Outdated Optimize Dep)` em `/node_modules/.vite/deps/` impede o worker do MapLibre
de arrancar. O mapa fica inerte: sem estilo, sem eventos, sem renderizar, e sem erro
nenhum na consola a explicar porque. Resolve-se apagando `node_modules/.vite` e
reiniciando o servidor.

### Janela oculta suspende o mapa

Com a janela minimizada ou em segundo plano, o `requestAnimationFrame` nao corre e o
MapLibre nao executa o ciclo que pede mosaicos. O terreno nunca carrega e
`queryTerrainElevation` devolve 0 em todo o lado, o que da a impressao de terreno avariado.
A validacao visual do relevo tem de ser feita com a janela a frente.

## Estimativa de duracao

Calibrada contra a rota de Sever do Vouga no Pilot 2: 89 waypoints, 8385,2 m, 10 m/s, todos
em "a aeronave para", que o simulador estima em 23 m 27 s. So o percurso daria 838 s,
portanto os restantes 569 s sao o custo de travar e voltar a acelerar em cada ponto, cerca
de 6,4 s por ponto. Com 1,5 m/s2 a estimativa fica a menos de 2% do simulador.

## O dialeto Fly nao grava a cota do ponto de descolagem

O `waylines.wpml` do dialeto de consumo nao tem `takeOffRefPoint` nem qualquer
outra referencia a cota do terreno. As alturas sao todas relativas a descolagem
(`relativeToStartPoint`), e o aparelho resolve isso em voo, mas quem le o ficheiro
fora do aparelho fica sem saber a que cota corresponde o zero.

Assumir zero faz a rota inteira aparecer abaixo do solo pela cota do sitio. Em
Sever do Vouga sao 356 m: uma rota a 60 m acima do solo aparece a 336 m abaixo
dele. Por isso a importacao marca `cotaDescolagemConhecida` e vai buscar a cota
ao motor de terreno quando o ficheiro nao a traz.

O dialeto do Pilot 2 nao tem este problema: traz `takeOffRefPoint` com a altura
elipsoidal, de onde sai a ortometrica subtraindo a ondulacao do geoide.

## Topografia DXF

O DXF traz cotas em tres formas, e todas contam: a elevacao das polilinhas, que e
onde vive a cota de uma curva de nivel, os vertices das superficies 3DFACE, e os
pontos cotados soltos. O resto do desenho e ignorado.

As coordenadas vem em ETRS89 / PT-TM06, EPSG:3763, e sao convertidas para WGS84 a
leitura, uma vez, e nao a cada consulta. A conversao esta verificada: a origem do
sistema cai em (0, 0) ao milimetro, a ida e volta fecha a nona casa decimal, e mil
metros no sistema dao mil metros medidos no terreno.

Dentro de um triangulo de superficie a cota sai por interpolacao baricentrica,
que e exacta porque o triangulo e o plano definido pelos tres pontos medidos.
Fora deles usa-se a media ponderada pelo inverso do quadrado da distancia sobre
os oito vizinhos mais proximos, encontrados numa grelha de 25 m.

A `FonteComposta` prefere a topografia onde ela existe e cai para os mosaicos
publicos fora dela. Cada waypoint mostra na lista de onde veio a sua cota,
`topo` ou `srtm`. Trocar de fonte esvazia a cache de cotas: as mesmas coordenadas
passam a ter outra cota, e ficar com as antigas seria pior do que nao ter
importado nada.

## KML para o Google Earth

As alturas vao em `absolute`, que no Google Earth quer dizer acima do elipsoide.
Como as da aplicacao sao ortometricas, soma-se a ondulacao do geoide. Sem isso o
percurso apareceria 55,6 m abaixo do sitio em Portugal continental.

A ordem em `coordinates` e longitude, latitude, altura, ao contrario do
`waypointPoiPoint` do WPML, que e latitude, longitude, altura.

## O que o KMZ real da obra de Sever do Vouga corrigiu

`OBRA_SEVER_v4_fotos_e_video_1.kmz`, 64 waypoints, 50 fotos, um arranque e uma
paragem de video, extraido de um DJI RC 2 com Mini 5 Pro. Esta em
`docs/esquemas/fly-1.0.2-obra-sever-*` e e a referencia de conformidade do
dialeto Fly. Corrigiu oito coisas que estavam adivinhadas:

**1. `startRecord` e `stopRecord` confirmados.** Os nomes estavam certos, mas os
parametros nao: levam so `payloadPositionIndex`. O `useGlobalPayloadLensIndex`
que a foto leva nao aparece aqui.

**2. Formato dos numeros.** A DJI escreve alturas, velocidades e inclinacoes
sempre com uma casa decimal, mesmo quando e redonda: `8.0`, `-20.0`, `60.8`.
Angulos de guinada, contadores e distancias de amortecimento saem inteiros.
Emitir `8` onde o aparelho escreve `8.0` nao torna o ficheiro invalido, mas
tambem nao ha razao para divergir de quem define o formato.

**3. Coordenadas com quinze algarismos significativos**, e nao com um numero
fixo de casas decimais: `-8.41066700000000`, `40.7465720000000`. E o que
`toPrecision(15)` da.

**4. `actionGroupId` e `actionId` sao continuos ao longo da rota inteira**, de 1
a N, e nao reiniciam em cada waypoint. Neste ficheiro vao a 64 e a 116.

**5. `waypointHeadingAngleEnable` e sempre 0**, mesmo nos 50 waypoints que
apontam a um POI. Estava a escrever 1 nesses.

**6. `useStraightLine` e sempre 0**, tambem nos waypoints de passagem. Estava a
liga-lo ao tipo de curva.

**7. `waypointTurnDampingDist` nao e sempre zero.** Nos 12 waypoints de passagem
vale 12 m. E um campo proprio do waypoint, nao um valor derivado, e passou a
existir no modelo como `distanciaAmortecimento`.

**8. `gimbalYawRotateEnable` e sempre 0**, tambem quando ha angulo de guinada do
gimbal. Estava a liga-lo quando o angulo nao era zero.

As combinacoes observadas no ficheiro, que dao a gramatica do dialeto:

| quantos | accoes | curva | amortecimento | guinada |
|---:|---|---|---:|---|
| 50 | gimbalRotate, takePhoto | para no ponto | 0 | towardPOI |
| 10 | gimbalRotate | passa | 12 | followWayline |
| 2 | gimbalRotate | para no ponto | 0 | followWayline |
| 1 | gimbalRotate, startRecord | passa | 12 | followWayline |
| 1 | gimbalRotate, stopRecord | passa | 12 | followWayline |

O `gimbalRotate` vem sempre antes do `takePhoto`: aponta-se e so depois se
dispara.

O primeiro ficheiro de referencia, `fly-1.0.2-template.kml` e
`fly-1.0.2-waylines.wpml`, foi transcrito a mao e tem os numeros normalizados,
com `50` onde o aparelho escreve `50.0` e `waypointHeadingAngleEnable` a 1. Serve
para confirmar a estrutura, nao a formatacao.

### Duas diferencas so de formatacao, tambem corrigidas

O aparelho escreve as coordenadas em linha propria, indentadas, e so as
coordenadas. E indiferente para o XML, mas nao ha razao para divergir de quem
define o formato.

```xml
<Point>
  <coordinates>
    -8.41066700000000,40.7465720000000
  </coordinates>
</Point>
```

E o `createTime` do `template.kml` e preservado na importacao: reexportar uma
rota lida de um ficheiro tem de dar o mesmo ficheiro, nao um com a data de hoje.

Com isto, importar o `OBRA_SEVER_v4` e voltar a exporta-lo devolve os dois
ficheiros **identicos byte a byte**, e ha um teste que o garante.

## Ciclos de importacao entre a base de dados e o nucleo

`copiarRota` esteve em `dados/projetos.ts`, que importa `bd.ts`. Quando `bd.ts`
passou a precisar dela criou-se um ciclo, e o resultado foi `rotaVazia is not
defined` em tempo de execucao: o botao de rota nova deixou de fazer nada.

A funcao e pura e vive agora em `nucleo/operacoes-rota.ts`. A regra que fica: o
nucleo nao conhece a camada de dados, e o que for puro mora la.

O que tornou o defeito dificil de ver nao foi o ciclo, foi o `void promessa` sem
`catch` a engolir a rejeicao. As operacoes que tocam na base de dados passam
todas por um envolucro que mostra a falha na barra inferior.

## Referencias de depuracao em modo estrito

`window.__mapa` guardava a instancia do mapa no momento da criacao. Em modo
estrito o React monta duas vezes, e a referencia ficava a apontar para um mapa ja
destruido, que responde a tudo com silencio: `getStyle()` a `undefined`,
`getCenter()` sempre igual, nenhum evento. Fez parecer avariado, mais do que uma
vez, codigo que estava bom.

Passou a ser um acessor que le o `ref`, e por isso devolve sempre a instancia
viva.

Relacionado, e a mesma causa de varias horas perdidas: com a janela oculta o
`requestAnimationFrame` nao corre, e o MapLibre nao carrega mosaicos nem anima.
Para verificar uma animacao nessas condicoes ha que forcar os fotogramas com
`map._render(...)`. Foi assim que se confirmou que centrar num waypoint deixa o
mapa a 0,00 m dele.
