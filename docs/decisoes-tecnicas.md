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

## Limites de um campo valem em todos os caminhos de entrada

`CampoNumerico` aplicava o `min`/`max` so a quem escrevia texto. As setas do
teclado e os botoes de incremento chamavam `aoAlterar(valor + delta)` sem passar
pelo mesmo crivo.

Bastava carregar em baixo no campo da velocidade, cujo minimo e 0,5 m/s, para a
por a zero e depois a negativo. Dai saiam tres coisas, por esta ordem:

1. a duracao estimada dividia por zero e a barra mostrava `Infinity m NaN s`;
2. a exportacao para o dialeto Pilot 2, que grava a duracao dentro do ficheiro,
   rebentava com `numero invalido para WPML`, uma mensagem sobre XML que nao tem
   relacao nenhuma com a causa;
3. nenhuma validacao dizia que a velocidade estava impossivel.

Ficaram corrigidos os tres: o crivo passou a valer em todos os caminhos,
`calcularEstatisticas` nunca devolve um valor nao finito, e `validarVelocidades`
bloqueia a exportacao dizendo o que se passa.

A licao geral: quando um campo tem um invariante, ele pertence ao sitio por onde
todos os caminhos passam, e nao a um deles.

## A folga da gravacao automatica tinha um buraco

A rota grava-se 400 ms depois da ultima alteracao, para nao escrever a cada pixel
de arrasto. A limpeza do efeito cancelava o temporizador, o que esta certo entre
edicoes sucessivas - mas trocar de rota dentro desses 400 ms tambem trocava a
rota do efeito, e a gravacao da anterior nunca chegava a ser pedida.

Nao havia promessa rejeitada nem erro nenhum: a alteracao estava no ecra e
desaparecia ao reabrir a rota. O mesmo com F5 dentro da folga.

A rota pendente vive agora num `ref` e ha `gravarPendente()`, chamada antes de
cada troca de rota e em `visibilitychange`. Excepto ao apagar, onde o pendente e
deitado fora de proposito: gravar o que se vai apagar podia repo-lo depois.

## Cotas de terreno: o zero e a pior resposta possivel

Dois sitios devolviam 0 m em silencio quando nao sabiam a cota:

- `FonteComposta.perfil` chamava `publica.cotas?.()`, opcional na interface, e
  caia em `?? 0` quando a fonte so sabia responder ponto a ponto;
- uma `POLYLINE` classica num DXF perde a elevacao na leitura, porque o
  `dxf-parser` le o grupo 30 e deita-o fora, e os vertices a zero passavam por
  cota real.

Zero le-se como uma cota perfeitamente plausivel. Uma rota em AGL a 30 m sobre
terreno dado como estando ao nivel do mar voa para dentro da encosta, sem um
aviso. A regra que fica: nao sabendo a cota, falha-se ou avisa-se, nunca se
devolve um numero.

## A autonomia nao e o percurso entre waypoints

`calcularEstatisticas` conta so de waypoint a waypoint, porque e isso que a barra
do Pilot 2 mostra e e contra esse numero que a aceleracao foi calibrada. Para a
bateria falta a ida ate ao primeiro ponto e o regresso a casa, que numa rota que
se afaste 4 km sao a maior parte do voo.

`duracaoDoVooCompleto` soma os dois trocos e e essa que a validacao usa. A barra
continua a mostrar o que o Pilot 2 mostra.

## O que fica por confirmar no dialeto Pilot 2

Este dialeto ainda nao tem um ficheiro real de referencia, ao contrario do Fly,
que se reproduz byte a byte. Dois pontos ficam em aberto ate haver uma exportacao
verdadeira do FlightHub 2 para o Mavic 3T:

- `wpml:actionId` e numerado por grupo, e nao continuo ao longo do ficheiro como
  no dialeto Fly. A especificacao publica diz "unico dentro do grupo", o que
  ambas as formas cumprem;
- `wpml:actionGroupId` vem do indice do waypoint, portanto salta numeros quando
  ha waypoints sem accoes. E estritamente crescente e unico, que e o que a
  especificacao pede.

Nao se mexeu em nenhum dos dois: sem ficheiro de referencia, mudar seria trocar
um palpite por outro.

## Limitacoes assumidas

`deslocamentoLocal` nao normaliza a diferenca de longitude, portanto um par de
pontos de um lado e do outro do antimeridiano da a volta ao mundo em vez dos
metros que os separam. A operacao e em Portugal continental e nao se acrescentou
codigo para um caso que nao acontece, mas fica escrito.

## A rotacao do gimbal conta-se a partir do nariz

O `gimbalHeadingYawBase` dos ficheiros reais e `aircraft`. O azimute para onde a
camara olha e, portanto, a soma do rumo da aeronave com a rotacao do gimbal, e e
essa soma que vai para a projeccao do enquadramento. A previsao usava so o rumo,
o que mostrava o que a aeronave tinha pela frente e nao o que a foto ia apanhar.

No voo virtual, as quatro setas sao agora do gimbal e so dele. Antes as da
esquerda e da direita rodavam a aeronave, duplicando o Q e o E, e o `gimbalYaw`
nao tinha comando nenhum apesar de existir no modelo e de ser escrito no
ficheiro.

## O passo do voo vive no nucleo

Nao e arrumacao. Dentro do ciclo de animacao nao ha como exercitar aquela
logica: com a janela por tras de outra o `requestAnimationFrame` nao corre - zero
fotogramas em 600 ms, com `document.visibilityState` a dizer `visible` - e o
MapLibre nem chega a carregar o estilo. Foi ao escrever os testes da funcao pura
que apareceu a velocidade em diagonal, 41% mais alta do que a direito.

## Um LinearRing e um contorno, nao uma linha

O leitor de KML tratava um `LinearRing` solto como linha aberta, e nao via
poligonos nenhuns: procurava-o como filho directo do `Placemark`, quando num
`Polygon` ele vive em `outerBoundaryIs/LinearRing`, dois niveis abaixo.

Um `LinearRing` e fechado por definicao. Passou a ser contorno, que e o que um
ficheiro de limites de parcela traz.

O ponto de fecho que o KML repete nao se guarda: um contorno de quatro cantos
ficava com cinco pontos e o ultimo por cima do primeiro, o que estraga a conta da
area. Para o GeoJSON, que exige o anel fechado, ele e reposto ao desenhar.

## O worker do MapLibre estava morto, e com ele metade do mapa

O terreno aparecia perfeitamente plano numa zona de montanha. A causa nao era do
terreno: era o worker do MapLibre nunca chegar a existir.

O MapLibre 6 resolve o worker com `new URL('./maplibre-gl-worker.mjs',
import.meta.url)`. O Vite pre-empacota a biblioteca para
`node_modules/.vite/deps/maplibre-gl.js`, e a partir dai esse caminho aponta para
`.vite/deps/maplibre-gl-worker.mjs`, que nao existe. Um `new Worker(...)` sobre
um 404 nao atira excepcao: o worker morre ao carregar e todos os pedidos ficam
por responder, para sempre, sem erro e sem aviso.

O que isso levava atras era mais do que se veria a olho:

- a descodificacao dos mosaicos de elevacao, ou seja o relevo inteiro
- o processamento das fontes GeoJSON, ou seja a linha da rota no terreno, o
  poligono do enquadramento e os contornos das areas importadas

O que continuava a funcionar dava a ilusao de estar tudo bem: a ortofoto e raster
e nao passa pelo worker, e a camada WebGL propria da rota corre no fio principal.
Dava um mapa inclinado, com a rota desenhada a altitude certa, e o solo plano.

A correccao e `setWorkerUrl` com o ficheiro importado com o sufixo `?url`, que
faz o Vite emiti-lo como recurso em desenvolvimento e na versao construida.

Como se apanhou, para a proxima ser mais depressa: `map.queryTerrainElevation`
devolvia 0 no centro, onde sao 356 m, e uma fonte GeoJSON trivial acrescentada a
mao nunca chegava a `loaded()`. Sao dois sinais de tres linhas que separam "o
terreno esta mal" de "o worker esta morto".

## A lentidao com muitos waypoints nao era do desenho, era do render

Com muitos waypoints, rodar e deslocar o mapa ficava a arrastar. A suspeita
obvia era o desenho: 120 marcadores no DOM que o MapLibre reposiciona a cada
fotograma. Medido, os marcadores eram 9% do custo. O resto estava noutro sitio.

Eram duas coisas, ambas do lado do React.

**Um efeito de desenho sem lista de dependencias.** Corria a cada render do
componente do mapa, e o componente renderiza a cada movimento do rato, porque a
barra de estado mostra as coordenadas sob o cursor. Cada movimento reconstruia
a geometria inteira da rota, refazia todo o GeoJSON e reescrevia o DOM de todos
os marcadores - para desenhar exactamente o mesmo. Medido com 122 waypoints:
27,1 ms por movimento do rato, e uma reconstrucao completa por movimento.

**A leitura do cursor em `useState` da aplicacao.** Tres numeros na barra de
estado punham a arvore inteira - mapa, listas, paineis, perfil - a renderizar
60 vezes por segundo. Sozinha, custava metade do orcamento de cada fotograma:
45 fotogramas por segundo a rodar o mapa, 21 se o rato tambem se mexesse.

As correccoes: um efeito por coisa desenhada, cada um a depender so do que o
alimenta; a consulta de cota sob o cursor limitada a uma por fotograma; e a
leitura do cursor com estado proprio, num canal externo a que so ela se liga
(`src/ui/LeituraCursor.tsx`).

Resultado, com 120 waypoints, a rodar o mapa e a mexer o rato ao mesmo tempo:

| | antes | depois |
|---|---|---|
| reconstrucoes da rota por movimento do rato | 1 | 0 |
| trabalho por movimento do rato | 27,1 ms | 1,8 ms |
| fotogramas por segundo | 19,2 | 35,2 |

Fica registado o metodo, que e o que interessa para a proxima: as medicoes
foram feitas com o Chromium em modo headless, porque com a janela tapada o
browser trava o `requestAnimationFrame` a 1 Hz e qualquer medicao de fotogramas
passa a medir a travagem do browser, nao o programa. Com a janela tapada,
medir trabalho sincrono em JS ainda da numeros validos; contar fotogramas nao.

## O exagero vertical do terreno nao chega as camadas proprias

O `exaggeration` do `setTerrain` multiplica a cota do terreno na malha que o
MapLibre desenha. Nao toca em mais nada. As camadas WebGL proprias - a rota a
altitude verdadeira e os aparelhos nos waypoints - continuavam a por os vertices
nas cotas reais.

Com o exagero a 1,4, um cabeco a 400 m aparece a 560 e a rota, que ficava nos
seus 460, passava a ir por dentro da montanha: os aparelhos desapareciam e a
linha de voo tambem. Do lado de fora parecia que as camadas tinham morrido.

A correccao e passar o mesmo factor as camadas e multiplicar por ele todas as
cotas, incluindo a da origem local. Esticadas as duas na mesma proporcao, a
relacao entre o terreno e a rota mantem-se, que e o que se esta a ler. Em 2D nao
ha terreno e portanto nao ha exagero: o factor e um.

Um aviso de diagnostico que custou tempo: `map.getStyle().layers` **nao lista
camadas personalizadas**. O `getStyle` serializa a especificacao do estilo, e uma
camada personalizada nao e serializavel. Para saber se ela la esta, usa-se
`map.getLayer(id)`; para saber se esta a desenhar, conta-se `render`.

## A cobertura de uma area, e porque o espacamento nao se escolhe

Importar o limite da parcela e ficar a olhar para ele nao adianta nada: o que se
quer a seguir e a rota que o cobre.

O espacamento entre passagens nao e um numero que se escolha, e sai da camara e
da altura. Uma foto a `h` metros com campo de visao `f` cobre `2 h tan(f/2)` de
terreno, e a sobreposicao pedida diz que fraccao dessa largura se anda antes da
passagem seguinte. Por isso o painel pede a altura e as duas sobreposicoes, e
mostra o espacamento como consequencia - e nao ao contrario.

Tres decisoes que ficam registadas:

- **Trabalha-se num plano local rodado.** Rodar o poligono pelo rumo pedido e
  mais simples do que rodar as rectas: com as passagens na horizontal, o corte
  com o poligono e uma conta de uma linha e a ordem sai sozinha. O rumo entra
  com menos noventa graus, porque as passagens saem ao longo do eixo x, que
  aponta a leste, e o rumo conta-se do norte.

- **Um corte pode dar mais do que um troco.** Numa parcela em L, ou com um
  caminho a atravessa-la, a mesma passagem vem partida. Tratar o corte como um
  so faria a aeronave atravessar o que nao e para cobrir, que num sitio a serio
  pode ser a central do vizinho.

- **A cobertura exige AGL.** O espacamento sai da altura acima do solo, e sobre
  relevo a mesma cota absoluta da faixas de larguras diferentes a cada passagem.
  O painel recusa gerar noutro modo e oferece a conversao.

Os waypoints saem com a camara a prumo e o rumo fixo no sentido da passagem. Sem
o rumo fixo a aeronave rodava a cada ponto para seguir a linha, e as fotos saiam
com a orientacao a mudar de passagem para passagem.

Verificado contra o perimetro real de Sever do Vouga: 23,91 ha, faixa de
108 por 81 m a 60 m de altura, 32,4 m entre passagens, 26 passagens, 9,6 km de
percurso e 461 fotos.
