# Contas e projetos guardados na conta

Por omissão, os projetos vivem na IndexedDB do browser: ficam nesta máquina,
neste browser, e não vão a lado nenhum. É o que acontece a quem clona o
repositório, e não precisa de configuração nenhuma.

Este documento é sobre a outra forma de funcionar: **os projetos numa conta**,
que os segue de computador para computador, e **cada pessoa vê só os seus**.

É o Firebase que faz o trabalho - Firestore para os dados, autenticação por
ligação no correio, e regras de segurança. A aplicação continua sem servidor
próprio: o browser fala directamente com o Firestore, e quem decide o que cada
pessoa pode ler é o servidor, pelas regras.

---

## O que se monta, uma vez

### 1. Criar o projeto

Em [console.firebase.google.com](https://console.firebase.google.com), **Adicionar
projeto**. O plano gratuito chega com muita folga: são 50 mil leituras e 20 mil
escritas por dia, e uma rota são uns quilobytes.

Podes desligar o Google Analytics - esta ferramenta não o usa.

### 2. Criar a base de dados

**Build** > **Firestore Database** > **Criar base de dados**.

- **Modo de produção**, não modo de teste. O modo de teste abre tudo a toda a
  gente durante trinta dias, e é assim que estas coisas ficam abertas.
- Região: uma na Europa, `eur3` ou `europe-west1`. A região não se muda depois.

**Não são precisos índices compostos.** As duas consultas que a aplicação faz -
ordenar projetos por data e filtrar rotas por projeto - usam um campo cada, e
esses o Firestore indexa sozinho.

### 3. Publicar as regras

No Firestore, separador **Regras**. Cola o conteúdo de
[`firestore.rules`](../firestore.rules) e publica.

**Esta é a parte que importa.** As chaves que a aplicação usa vão no pacote que
o browser transfere e qualquer pessoa as pode ler - é assim que o Firebase do
lado do cliente funciona. Sem as regras, quem quisesse pedia tudo. Com elas, o
servidor só devolve o que está debaixo do `uid` de quem pediu.

### 4. Ligar a entrada por correio

**Build** > **Authentication** > **Começar** > **Email/Password**.

São dois interruptores no mesmo painel, e **os dois têm de ficar ligados**:

- **Email/Password**
- **Email link (passwordless sign-in)** - é este que a aplicação usa

### 5. Decidir quem pode entrar

Ainda em **Authentication**, separador **Settings**, secção **User actions**.
Aí há a opção de permitir ou não a criação de contas novas. (O Firebase muda os
nomes destes painéis de tempos a tempos; procura pela opção de *sign-up*.)

- **Permitida**: qualquer pessoa que encontre o endereço cria conta. Vê só os
  projetos dela, mas usa a tua quota.
- **Bloqueada**: só entra quem tu criares à mão, em **Authentication** >
  **Users** > **Add user**. É o que faz sentido para uma ferramenta de empresa.

### 6. Autorizar o domínio

**Authentication** > **Settings** > **Authorized domains**. Acrescenta
`open-flight-planner.vercel.app`.

O `localhost` já lá está. Sem isto a ligação do correio é recusada ao voltar,
com uma mensagem que não aponta para aqui.

### 7. Copiar a configuração

**Project settings** (a roda dentada) > **Your apps** > ícone da web (`</>`) >
registar a aplicação. Do que ele mostra, interessam quatro valores:

| Firebase | Variável |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

### 8. Pôr as variáveis no Vercel

**Settings** > **Environment Variables**, as quatro, para Production, Preview e
Development. Depois **Deployments** > o último > **Redeploy**.

As variáveis `VITE_` são lidas na construção, não em execução: sem novo deploy,
o pacote antigo continua a correr em modo local.

Para trabalhar localmente contra a mesma base, copia `.env.example` para
`.env.local` e preenche. O `.env.local` já está ignorado pelo git.

---

## Como fica

- Quem abre o sítio vê o ecrã de entrada e escreve o endereço de correio.
- Recebe uma ligação e abre-a. Se a abrir **no mesmo browser**, entra directamente; se a
  abrir noutro - o telemóvel, tipicamente, porque foi lá que o correio chegou -
  a aplicação pede a confirmação do endereço, porque o Firebase precisa dele
  para concluir.
- Os projetos que criar são dele. Mais ninguém os vê pela aplicação.
- A sessão fica guardada: fechar o separador e voltar amanhã cai no mesmo sítio.

Não há palavra-passe - nem para escolher, nem para recuperar, nem para esta
aplicação guardar.

## O que se perde, e é preciso saber antes

**Deixa de funcionar sem rede.** Em modo local os projetos estão na máquina e o
que falha sem rede é só o mapa. Com conta, sem rede não há projetos. Numa
central sem cobertura isso nota-se, e a solução seria manter a IndexedDB como
espelho local - o que é sincronização a sério, com conflitos, e é outro
trabalho.

**Uma rota tem um tecto de 1 MiB.** É o limite de um documento do Firestore.
Uma rota de cobertura com perímetro importado fica muito abaixo disso, mas uma
com milhares de waypoints e vários polígonos pode lá chegar. Se acontecer, a
gravação falha com a razão em vez de falhar em silêncio.

**Quem for dono do projeto Firebase vê tudo pela consola.** As regras protegem
os pedidos da aplicação, não o painel de administração. É o normal em qualquer
base de dados, mas vale a pena estar dito.

**Os projetos que já estavam na máquina não vão sozinhos.** Ficam na IndexedDB,
intactos. Na primeira vez que entrares, a aplicação dá por eles e pergunta se os
queres copiar para a tua conta. Nada é apagado deste computador.

## Voltar atrás

Tira as variáveis de ambiente e faz deploy. A aplicação volta ao modo local, e
os dados que estão no Firestore continuam lá - é só religar as variáveis para os
ter outra vez.
