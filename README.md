# PYE Flight Planner

Planeador de rotas de waypoints para drone, com saida `.kmz` que o DJI Fly e o
DJI Pilot 2 aceitam sem conversao. Substitui o FlightHub 2 no registo fotografico
periodico de obra e na inspeccao de centrais fotovoltaicas.

Corre inteiramente no browser. Sem backend, sem contas: os projetos ficam no
posto de trabalho, em IndexedDB, e saem em JSON, KMZ ou KML quando for preciso
leva-los.

## Comecar

```bash
npm install
npm run dev
```

| comando | o que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento em http://localhost:5173 |
| `npm run build` | verifica os tipos e gera os estaticos em `dist/` |
| `npm test` | toda a bateria, incluindo os testes contra os mosaicos reais |
| `npm run test:unidade` | so os testes que nao precisam de rede |
| `npm run tipos` | verificacao de tipos, sem construir |

## O problema que isto resolve

Ha **dois dialetos incompativeis** de WPML, e um ficheiro do dialeto errado e
aceite em silencio e depois a rota nao voa.

| | DJI Fly | DJI Pilot 2 e FlightHub 2 |
|---|---|---|
| Namespace | `uav.com/wpmz/1.0.2` | `dji.com/wpmz/1.0.6` |
| Referencia de altura | `relativeToStartPoint` | `WGS84`, absoluta |
| `template.kml` | minimo | com o percurso todo |
| `payloadInfo` | ausente | presente |
| Modo das accoes | `parallel` | `sequence` |
| Accao de zoom | nao existe | existe |

O dialeto sai do drone escolhido na rota, nunca de uma opcao a parte, e a
importacao decide-o pelo namespace declarado no ficheiro.

Os ficheiros de referencia reais estao em [docs/esquemas](docs/esquemas). Para o
dialeto Fly a conformidade e verificada contra `OBRA_SEVER_v4`, um KMZ de 64
waypoints com 50 fotos e um video extraido de um DJI RC 2: importar esse ficheiro
e voltar a exporta-lo devolve os dois ficheiros identicos **byte a byte**.

## O que a ferramenta faz

- **Mapa 2D e 3D** com ortofoto e terreno, rota desenhada a altitude verdadeira
  com linha vertical de cada waypoint ate ao solo
- **Perfil de terreno** com a linha de voo por cima, o tecto dos 120 m e o piso
  medidos acima do solo em cada ponto, e nivelamento a altura constante
- **Validacoes** que bloqueiam a exportacao, incluindo colisao com o terreno
  entre waypoints, que os pontos sozinhos nao revelam
- **Vista da camara** em primeira pessoa e enquadramento projectado no terreno
- **Voo virtual**: pilotar pelo mapa e gravar o waypoint com a atitude em que
  esta, com os mesmos comandos do Pilot 2
- **Topografia DXF** em ETRS89 / PT-TM06, que manda dentro da area que cobre,
  com cada waypoint a dizer de onde veio a sua cota

## Atalhos

| tecla | acção |
|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` | desfazer e refazer |
| `Shift+F` | accao de foto nos waypoints seleccionados |
| `Delete` | eliminar a seleccao |
| setas cima e baixo | mover a seleccao na lista |
| `Esc` | largar a seleccao e fechar paineis |
| alt e clique num troco | inserir waypoint intermedio |

Em voo virtual: `W A S D` deslocam, `Q E` rodam, `C Z` sobem e descem, as setas
mexem o gimbal, `Shift+Space` grava o waypoint, `Shift+F` junta-lhe a foto.

## Estrutura

```
src/
  nucleo/     geodesia, alturas, validacoes, perfil, camara, operacoes de rota
  terreno/    motor de cotas: mosaicos Terrarium e topografia DXF
  kmz/        os dois dialetos WPML, empacotamento, KML
  mapa/       MapLibre e a camada WebGL da rota a altitude verdadeira
  estado/     historico, seleccao, cotas, perfil, voo virtual
  ui/         componentes
  dados/      persistencia em IndexedDB
docs/
  esquemas/                      ficheiros WPML reais de referencia
  decisoes-tecnicas.md           armadilhas encontradas e porque das escolhas
  observacoes-pilot2-simulador.md  o que foi extraido do simulador
```

## Por confirmar

- O `template.kml` e o `waylines.wpml` completos de uma exportacao real do
  FlightHub 2. O gerador do dialeto Pilot 2 tem a ordem de alguns elementos
  escrita a partir da especificacao publica, e esta assinalado no codigo.
- As accoes `hover` e `rotateYaw` no dialeto Fly. As de foto, gimbal e video
  estao confirmadas contra ficheiros reais. A aplicacao avisa ao exportar quando
  a rota usa alguma das que faltam.
- Campo de visao, velocidade maxima e autonomia de cada drone, em `src/drones.ts`.
