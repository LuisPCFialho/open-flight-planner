# Alojar em vez de correr localmente

O planeador é uma aplicação estática: não tem servidor, não tem base de dados
remota, não tem sessão. Os projetos e as rotas vivem na IndexedDB do browser, e
os mosaicos do mapa vêm de serviços públicos. Alojar é servir a pasta `dist`.

O `vercel.json` na raiz já tem o que é preciso.

## O que fazer

1. Pôr o repositório no GitHub (ou GitLab/Bitbucket).
2. No Vercel, **Add New > Project**, escolher o repositório.
3. Não mexer em nada: o `vercel.json` já diz qual é o comando de construção
   (`npm run build`), qual é a pasta de saída (`dist`) e como se guardam os
   ficheiros em cache.
4. Deploy.

A partir daí, cada `git push` publica.

## O que muda, e é preciso saber antes

### Os projetos não vão contigo

A IndexedDB é **por origem**. O trabalho que está em `localhost:5173` não
aparece em `o-teu-projeto.vercel.app`: são dois sítios diferentes para o
browser, e cada um tem a sua base de dados.

Para levar o que já existe: no ecrã de projetos, **Exportar JSON** de cada
projeto antes, e **Importar JSON** depois, já no sítio novo. É o mesmo problema
que se tem ao mudar de computador, e é a mesma solução.

É também o problema que as contas resolvem de vez: com o armazém remoto ligado,
os projetos vivem numa conta em vez de num browser, e seguem-na de computador
para computador. Ver [contas](contas.md).

### Fica acessível a quem tiver o endereço

Um deploy do Vercel é público por omissão. Um planeador de voo com os perímetros
das obras lá dentro provavelmente não é para andar à solta:

- **Vercel Authentication** (Settings > Deployment Protection) limita o acesso
  a quem estiver na equipa Vercel. É a opção que faz sentido aqui.
- **Password Protection** é a alternativa se for para partilhar com alguém de
  fora sem lhe dar conta.

Vale a pena ligar uma das duas **antes** do primeiro deploy, e não depois.

### Continua a precisar de rede

Os mosaicos da ortofoto e as cotas do terreno vêm de fora. Alojado ou local, sem
rede o mapa não desenha. Se o objectivo for planear em obra sem cobertura, o que
resolve não é o alojamento - é guardar os mosaicos, que é outro trabalho.

## Uma coisa que não se deve pôr na configuração

**Nada de reescrever tudo para o `index.html`.**

É a receita habitual para aplicações com rotas do lado do cliente, e aqui faria
mal. O planeador tem uma página só, não precisa dela, e ela esconde exactamente
o defeito que já custou uma manhã neste projecto: um ficheiro em falta deixa de
dar 404 e passa a devolver o `index.html`, que o browser recusa por tipo MIME. É
assim que o worker do MapLibre morreu em silêncio, com o mapa a parecer bom e o
terreno perfeitamente plano numa zona de montanha.

Sem a reescrita, um ficheiro em falta dá 404 e vê-se. O
`ferramentas/verificar-dist.ts` corre no fim da construção e trava-a antes de
chegar a esse ponto, mas as duas defesas não se estorvam.

## Alternativas

Qualquer alojamento estático serve: Netlify, Cloudflare Pages, GitHub Pages, ou
uma pasta num servidor da empresa. As únicas coisas que importam são servir os
ficheiros como estão, com os tipos MIME certos, e não reescrever caminhos.

Em GitHub Pages há um pormenor a mais: se o sítio ficar numa subpasta
(`utilizador.github.io/planeador/`), é preciso `base: '/planeador/'` no
`vite.config.ts`, senão os caminhos dos ficheiros saem errados.
