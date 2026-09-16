# Verificar no campo

Tudo o que falta a este planeador depende de duas coisas que so se obtem fora
daqui: **voar um ficheiro exportado** e **um export real do FlightHub 2 para o
Mavic 3T**. Este documento diz exactamente o que observar, porque e que isso
importa, e o que fazer com cada resposta.

Nada aqui e opcional por gosto: cada ponto corresponde a uma coisa que esta
escrita no codigo como suposicao, e que deixa de o ser assim que for observada.

---

## 1. Primeiro voo com um KMZ exportado

### O que preparar antes de sair

Uma rota deliberadamente pequena e sem interesse tecnico nenhum, para o que se
esta a verificar ser o ficheiro e nao o levantamento:

- **4 waypoints**, em quadrado, 50 m de lado
- **60 m acima do solo**, em AGL
- **velocidade 5 m/s**
- **uma foto no waypoint 2** e **uma rotacao de gimbal no waypoint 3**, para
  -45 graus
- **waypoint 4 com `Rumo fixo` a 180 graus**, para se ver a guinada a ser
  obedecida

Exportar nos dois dialectos, com o nome a dizer qual e qual.

Escolher um sitio aberto, sem obstaculos e sem gente, e cumprir o que a
legislacao exigir para a operacao - isto e um ensaio de ficheiro, nao uma
autorizacao para voar onde calhe.

### O que observar, por ordem

| # | Observacao | Se correr bem | Se correr mal |
|---|---|---|---|
| 1.1 | O aparelho **aceita o ficheiro** e mostra a rota | O esqueleto do KMZ esta certo | Anotar a mensagem exacta. E quase sempre um elemento em falta ou fora de ordem |
| 1.2 | O numero de waypoints e **4** | A geometria passou inteira | Faltar ou sobrar um ponto e um erro de indice, nao de formato |
| 1.3 | As **alturas** que o aparelho mostra batem com as do planeador | A conversao de altitude esta certa | Ver 1.4 antes de concluir seja o que for |
| 1.4 | A **cota do ponto de descolagem** que o aparelho assume | Se bater, o AGL do planeador esta alinhado | Se diferir, e a diferenca entre a cota do terreno usada aqui e a do GPS do aparelho. Anotar as duas |
| 1.5 | A **foto** e disparada no waypoint 2 | A accao chegou | Se nao disparar, a accao foi aceite mas ignorada: o nome da funcao esta errado |
| 1.6 | O **gimbal** desce para -45 no waypoint 3 | A rotacao de gimbal esta certa | Ver 1.5 |
| 1.7 | A aeronave **aponta a 180** no waypoint 4 | O modo de guinada esta certo | Se apontar a norte, a guinada nao passou |
| 1.8 | A **duracao real** do voo, cronometrada | Comparar com a que a barra mostra | Ver a seccao 4 |

### Depois

Puxar o **cartao** e confirmar que a foto la esta, com a hora certa. Uma rota que
voa e nao grava e o pior resultado possivel, porque parece bom.

---

## 2. As accoes por confirmar do dialecto Fly

Cinco nomes de `actionActuatorFunc` vieram de ficheiros reais e estao
confirmados: `takePhoto`, `gimbalRotate`, `gimbalEvenlyRotate`, `startRecord`,
`stopRecord`.

Tres **nao** vieram, e estao escritos conforme a especificacao publica da DJI:

| Accao no planeador | Nome que se escreve | Como confirmar |
|---|---|---|
| Pairar | `hover` | Por uma paragem de 5 s num waypoint e cronometrar |
| Rodar a aeronave | `rotateYaw` | Por uma rotacao de 90 graus e ver se ela acontece |
| Zoom | `zoom` | Na pratica so o Mavic 3T tem zoom, e esse exporta em Pilot 2. Fica por confirmar ate haver um aparelho com zoom a exportar em Fly |

O planeador ja avisa quando uma rota usa uma destas: o aviso vem da lista
`FUNCOES_CONFIRMADAS` em `src/kmz/dialeto-fly.ts`. **Confirmar uma e acrescentar
o nome a essa lista**, e nada mais.

Se uma accao for aceite mas nao acontecer, o nome esta errado. O aparelho nao se
queixa de uma funcao que nao conhece: ignora-a em silencio.

---

## 3. O export do FlightHub 2 para o Mavic 3T

E o unico item que nao se resolve a voar. Faz-se assim:

1. No FlightHub 2, criar uma rota qualquer para Mavic 3T com **pelo menos tres
   waypoints** e, num deles, **duas accoes** (uma foto e uma rotacao de gimbal,
   por exemplo). Sao precisas duas para se ver como a numeracao anda.
2. Exportar o KMZ.
3. Por o `template.kml` e o `waylines.wpml` em `docs/esquemas/`, ao lado dos do
   dialecto Fly.

Com esse ficheiro fecham-se **duas duvidas concretas**, ambas em
`src/kmz/dialeto-pilot2.ts`:

- **`wpml:actionId`**: hoje escreve-se `1, 2, 3...` a comecar de novo em cada
  grupo. A duvida e se a numeracao e continua ao longo do ficheiro.
- **`wpml:actionGroupId`**: hoje e `indice do waypoint + 1`, portanto so ha
  grupo onde ha accoes e os numeros saltam. A duvida e se o aparelho aceita
  saltos ou exige uma sequencia seguida.

**Ha um indicio forte, e vale a pena tomar nota dele.** No dialecto Fly, onde ha
um ficheiro real, os identificadores de grupo e de accao **correm de 1 a N ao
longo da rota inteira e nao reiniciam em cada waypoint**. Se o Pilot 2 fizer o
mesmo, as duas duvidas fecham-se de uma vez e o gerador passa a usar contadores
continuos, como o Fly ja usa.

Fecham-se tambem tres valores que estao escritos conforme a especificacao e
nunca foram vistos num ficheiro real: `templateType`, `gimbalPitchMode` e
`globalWaypointHeadingParam`, mais a ordem exacta dos elementos dentro do
`Folder` do template.

Assim que o ficheiro exista, o dialecto Pilot 2 passa a ter o mesmo teste de
conformidade etiqueta a etiqueta que o Fly ja tem.

---

## 4. Os numeros que sao palpites

Tres valores no codigo sao prudentes por escolha, e nao medidos. Corrigem-se com
observacao, nao com discussao.

### Margem de autonomia (70%)

`MARGEM_AUTONOMIA` em `src/nucleo/validacoes.ts`. O planeador da por boa uma
rota que caiba em 70% da autonomia declarada.

**Como medir:** voar uma cobertura ate a bateria pedir regresso, e anotar a
percentagem que sobrou quando a rota acabou. Tres voos chegam para se ver se 70%
e apertado ou folgado. Vento e temperatura mudam isto mais do que qualquer conta.

### Limite de rotacao do gimbal em voo virtual (90 graus)

`YAW_MAXIMO` em `src/nucleo/voo.ts`. So afecta o voo virtual - o que se consegue
enquadrar no ecra. Nao afecta o ficheiro exportado.

**Como medir:** no aparelho, rodar o gimbal ate ele parar, e ver quanto foi.

### Autonomia declarada

52 minutos para o Mini 5 Pro, 45 para o Mavic 3T, ambos vindos do fabricante.
Sao os de um voo em linha recta sem vento, e nunca sao os de uma cobertura, que
acelera e trava a cada waypoint.

**Como medir:** a mesma medicao da margem de autonomia responde as duas.

---

## 5. O que ja esta verificado, para nao se repetir

Nao e preciso voltar a estes:

- O dialecto **Fly** foi escrito contra um ficheiro real extraido de um DJI RC 2
  com Mini 5 Pro, e os testes comparam a saida etiqueta a etiqueta.
- O `takeOffRefPoint` com altura elipsoidal foi confirmado a menos de um
  decimetro.
- A importacao do perimetro de **Sever do Vouga** da 23,91 ha, e a cobertura
  gerada a partir dele da 19 passagens, 7,9 km e 291 fotos - com 291 placemarks
  em cada um dos dois dialectos exportados.
- O **worker do MapLibre** estava morto na versao construida e ja nao esta; a
  construcao trava se o defeito voltar.

---

## Onde registar o que se observar

Cada resposta muda uma linha de codigo, e todas elas tem um sitio proprio:

| Observacao | Onde se escreve |
|---|---|
| Nome de accao confirmado | `FUNCOES_CONFIRMADAS` em `src/kmz/dialeto-fly.ts` |
| Numeracao de accoes do Pilot 2 | `src/kmz/dialeto-pilot2.ts`, mais o ficheiro de referencia em `docs/esquemas/` |
| Autonomia medida | `autonomiaMinutos` em `src/drones.ts` |
| Margem de autonomia | `MARGEM_AUTONOMIA` em `src/nucleo/validacoes.ts` |
| Limite de gimbal | `YAW_MAXIMO` em `src/nucleo/voo.ts` |
| Qualquer outra diferenca | `docs/observacoes-pilot2-simulador.md` |
