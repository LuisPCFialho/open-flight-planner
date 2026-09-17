# Linter

`npm run lint` corre o [oxlint](https://oxc.rs). Corre antes da construcao, e
uma falha trava-a.

## Porque nao o ESLint

Nao e por preferencia: o `typescript-eslint` recusa-se a arrancar com o
TypeScript 7 que o projecto usa. O limite declarado e `<6.1.0` e a mensagem e
explicita - "typescript-eslint does not support TS 7.0". A alternativa oficial e
instalar o TypeScript 6 ao lado e apontar o parser para ele, o que e uma segunda
copia do compilador dentro do projecto so para correr um linter.

O oxlint nao depende do TypeScript: traz o seu proprio analisador. Implementa as
regras de hooks do React, que sao as que fazem falta aqui, e respeita os
comentarios `eslint-disable-next-line` que ja estavam no codigo.

Quando o `typescript-eslint` suportar o TypeScript 7
([issue 10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940))
vale a pena voltar a considerar, pelas regras com informacao de tipos.

## Porque so estas regras

O `tsc` em modo estrito - com `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` e `noUnusedLocals` - ja apanha quase tudo o que um
linter apanharia. O que ele nao ve sao os hooks do React, e e ai que este
projecto ja se queimou: o defeito que custou metade dos fotogramas da aplicacao
era um `useEffect` sem lista de dependencias a reconstruir o mapa inteiro a cada
movimento do rato. E exactamente o que o `exhaustive-deps` assinala, e nao havia
nada instalado para o assinalar.

Duas regras estao desligadas de proposito:

- **`react/refs`** (ler `.current` durante o render). Os `useRef` que o aviso
  aponta sao espelhos do valor mais recente, lidos so de dentro de tratadores de
  eventos e de `requestAnimationFrame`. O caso esta explicado no codigo, em
  `useVooVirtual`: gravar um waypoint de dentro de um updater de `setState` era
  impuro e em modo estrito gravava dois.

- **`react/set-state-in-effect`**. O campo numerico guarda um rascunho local
  para nao saltar enquanto se escreve, e sincroniza-o com o valor de fora num
  efeito. E deliberado e tem teste.
