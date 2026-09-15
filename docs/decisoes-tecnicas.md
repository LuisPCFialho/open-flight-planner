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
