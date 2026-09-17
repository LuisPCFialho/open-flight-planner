# Contas e projetos partilhados

Por omissão, os projetos vivem na IndexedDB do browser: ficam nesta máquina,
neste browser, e não vão a lado nenhum. É o que acontece a quem clona o
repositório, e não precisa de configuração nenhuma.

Este documento é sobre a outra forma de funcionar: **os projetos numa conta**,
que os segue de computador para computador, e **cada pessoa vê só os seus**.

É o Supabase que faz o trabalho - Postgres, autenticação e políticas de linha.
A aplicação continua sem servidor próprio: o browser fala directamente com a
base, e quem decide o que cada pessoa pode ler é o Postgres.

---

## O que se monta, uma vez

### 1. Criar o projeto Supabase

Em [supabase.com](https://supabase.com), **New project**. O plano gratuito
chega com folga para o que esta ferramenta guarda - um projeto com rotas são
uns quilobytes.

Guarda a palavra-passe da base de dados que ele te pede. Não é usada pela
aplicação, mas é a única forma de lá chegar por fora.

### 2. Criar as tabelas e as regras

No painel, **SQL Editor** > **New query**. Cola o conteúdo de
[`supabase/esquema.sql`](../supabase/esquema.sql) e corre.

Isso cria duas tabelas e oito políticas de linha. **As políticas são a parte que
importa**: sem elas, a chave que o browser usa dá acesso a tudo. Com elas, cada
pedido só devolve as linhas de quem o fez, e isso não depende de o código da
aplicação se lembrar de filtrar.

Podes correr o mesmo ficheiro outra vez sem estragar nada: cria o que falta e
substitui as políticas.

### 3. Decidir quem pode entrar

**Authentication** > **Sign In / Providers** > **Email**.

- **Email** tem de estar ligado. É o que permite a ligação de entrada.
- **Allow new users to sign up** é a decisão que interessa. Ligado, qualquer
  pessoa que encontre o endereço cria conta - vê só os projetos dela, mas usa a
  tua quota. **Desligado, só entra quem tu convidares**, e é o que faz sentido
  para uma ferramenta de empresa.

Com os registos desligados, os convites fazem-se em **Authentication** >
**Users** > **Invite user**.

### 4. Dizer ao Supabase para onde voltar

**Authentication** > **URL Configuration**:

- **Site URL**: `https://open-flight-planner.vercel.app`
- **Redirect URLs**: acrescenta `http://localhost:5173/**` se quiseres entrar
  também em desenvolvimento, e `https://*-luispcfialhos-projects.vercel.app/**`
  para as pré-visualizações do Vercel.

Sem isto, a ligação do correio leva a pessoa para o sítio errado.

### 5. Copiar as duas chaves

**Project Settings** > **API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

**A chave `service_role` não entra aqui.** Essa ignora as políticas de linha: no
browser, dava a qualquer pessoa acesso a tudo o que está na base.

### 6. Pôr as variáveis no Vercel

**Settings** > **Environment Variables**, as duas, para Production, Preview e
Development. Depois **Deployments** > o último > **Redeploy**.

As variáveis `VITE_` são lidas na construção, não em execução: sem novo deploy,
o pacote antigo continua a correr em modo local.

Para trabalhar localmente contra a mesma base, copia `.env.example` para
`.env.local` e preenche. O `.env.local` já está ignorado pelo git.

---

## Como fica

- Quem abre o sítio vê o ecrã de entrada e escreve o endereço de correio.
- Recebe uma ligação, abre-a **no mesmo browser**, e entra.
- Os projetos que criar são dele. Mais ninguém os vê, nem o dono do projeto
  Supabase pela aplicação.
- A sessão fica guardada e renova-se: fechar o separador e voltar amanhã cai no
  mesmo sítio.

Não há palavra-passe - nem para escolher, nem para recuperar, nem para esta
aplicação guardar. O que se prova é o acesso à caixa de correio, que é o que
qualquer recuperação de palavra-passe acaba por provar de qualquer maneira.

## O que se perde, e é preciso saber antes

**Deixa de funcionar sem rede.** Em modo local os projetos estão na máquina e o
que falha sem rede é só o mapa. Com conta, sem rede não há projetos. Numa
central sem cobertura isso nota-se, e a solução seria manter a IndexedDB como
espelho local - o que é sincronização a sério, com conflitos, e é outro
trabalho.

**O correio do Supabase é limitado.** O servidor de correio que vem incluído
manda poucas mensagens por hora e serve para experimentar. Para uma equipa a
usar isto a sério, configura SMTP próprio em **Authentication** > **Emails** -
senão, a segunda pessoa a entrar numa manhã fica à espera de uma ligação que não
chega, e parece avaria.

**Os projetos que já estavam na máquina não vão sozinhos.** Ficam na IndexedDB,
intactos. Na primeira vez que entrares, a aplicação dá por eles e pergunta se os
queres copiar para a tua conta. Nada é apagado deste computador.

## Voltar atrás

Tira as duas variáveis de ambiente e faz deploy. A aplicação volta ao modo
local, e os dados que estão no Supabase continuam lá - é só religar as variáveis
para os ter outra vez.
