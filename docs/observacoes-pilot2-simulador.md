# Observacoes do DJI Pilot 2, simulador, Mavic 3T

Extraido de capturas de ecra do simulador com a rota
"P20250827001 - 10 UPPs Simples Energia - Sever do Vouga caminho",
89 waypoints, 8385,2 m, 23 m 27 s, 0 fotos. Data 15/09/2026.

## A relacao entre alturas, fechada

Cada waypoint mostra no mapa 3D um par `ASL` / `HAE`:

| leitura            | ASL      | HAE      | diferenca |
|--------------------|---------:|---------:|----------:|
| waypoint 70        |  886,7 m |  942,3 m |    55,6 m |
| waypoints 38 a 47  |  647,3 m |  702,9 m |    55,6 m |
| terreno sob cursor |  158,1 m |  213,6 m |    55,5 m |
| terreno sob cursor |  288,7 m |  344,3 m |    55,6 m |
| terreno sob cursor |  390,1 m |  445,7 m |    55,6 m |

Logo: `HAE = ASL + N`, com `N` = 55,6 m em Sever do Vouga.
`ASL` e ortometrica (EGM96), `HAE` e elipsoidal (WGS84).

### O takeOffRefPoint e elipsoidal

O HUD do waypoint 54 mostra `ALT 244 m`, `605,6 ASL`, `311,9 m` (AGL).
Descolagem em ASL = 605,6 - 244 = **361,6 m**.
O `takeOffRefPoint` do ficheiro de referencia e `40.746552,-8.410610,417.225221`.
417,225 - 55,6 = **361,6 m**. Bate.

**Conclusao: `takeOffRefPoint` e `ellipsoidHeight` sao elipsoidais, `height` e ASL sao ortometricas.**

Os mosaicos Terrarium dao 356 m nesse ponto, 5,6 m abaixo do valor real. E o erro tipico do SRTM.

## Barra de estatisticas, canto superior esquerdo

Quatro campos, por esta ordem: distancia total `8385.2 m`, duracao `23 m 27 s`,
numero de waypoints `89`, numero de fotos `0`.

## Barra inferior do mapa

Escala grafica, depois `ASL: 158.1 m`, `HAE: 213.6 m`, `WGS 84`, referentes ao terreno sob o cursor.

## Configuracoes de rota de voo, menu do topo

- Ponto de descolagem de referencia definido, com accao "Redefinir ponto de decolagem"
- Modo inteligente para baixa luminosidade, interruptor
- Separadores `Subida direta` | `Decolagem segura`, com altura de descolagem segura 20 m
  e botoes de incremento +100 / +10 / -10 / -100
- Modo de altitude da trajetoria: `ASL` | `ALT` | `AGL`, valor 523 m, mesmos incrementos
- Velocidade de voo global 10 m/s, com - e +

## Painel direito, contextual

Muda conforme a ferramenta seleccionada na barra vertical do mapa:

- `Zoom da camara` para o waypoint 67-3, taxa de zoom 1X, deslizador
- `Inclinacao do estabilizador` para o waypoint 57-2, -38,6 graus, deslizador
- `Editar pontos de passagem em lote`, separadores `Parametros` e `Accoes`.
  Em Parametros: Altitude da trajetoria (mostra "Varios valores" quando divergem),
  Velocidade da trajetoria, Tipo de trajetoria ("Trajetoria reta. A aeronave para"),
  Guinada da aeronave ("Ao longo da rota"), Configuracoes de ponto sem retorno.

O identificador do waypoint no painel tem a forma `57-2`, waypoint e indice da accao,
com setas < > para navegar entre accoes.

## Lista de trajetorias, painel esquerdo

Numero do waypoint com marcador triangular, mais tres icones de accao rapida por linha:
guinada da aeronave, inclinacao do gimbal, centrar no mapa.

## Mapa 3D

- Linha vertical branca de cada waypoint ate ao solo, e ponto no solo
- Etiqueta ASL/HAE por waypoint, com sobreposicao quando ha muitos pontos juntos
- Linha da rota a verde, mais espessa nos troços seleccionados
- Poligono amarelo do enquadramento da camara projectado no terreno, no waypoint activo,
  com leituras 51,4 m e 50,1 m ao lado, distancia e largura coberta
- Rosa dos ventos com rumo, indicadores de atitude, e leitura de distancia ao centro do ecra

## Atalhos confirmados

- `Shift+Space` inserir trajetoria
- `Shift+F` inserir accao de tirar foto
- Sem atalho visivel para "Registar atitude atual"

## HUD inferior

Longitude e latitude em campos editaveis, com 7 casas decimais.
`SPD m/s`, rumo em graus e inclinacao do gimbal em graus, ambos sobre a rosa dos ventos.
`ALT m` grande, com `ASL` por baixo e o valor AGL em baixo.
Teclas QWE / ASD para deslocar, Z / C para altitude.
