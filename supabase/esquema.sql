-- Esquema da base partilhada.
--
-- Cada projeto e cada rota pertencem a uma conta. Quem entra ve os seus e mais
-- nenhuns, e isso nao depende de o codigo da aplicacao se lembrar de filtrar:
-- depende das politicas de linha aqui em baixo, que o Postgres aplica a todas
-- as leituras e escritas, venham de onde vierem.
--
-- E deliberado. A chave anonima que o browser usa esta a vista de quem abrir as
-- ferramentas de programador - e assim que o Supabase funciona - portanto a
-- unica barreira que conta e esta. Um filtro no cliente seria decoracao.
--
-- Correr uma vez no editor de SQL do projeto Supabase.

-- --------------------------------------------------------------------------
-- Tabelas
-- --------------------------------------------------------------------------

/*
 * O conteudo vai em `jsonb` e nao em colunas.
 *
 * Um projeto tem quatro campos, mas uma rota tem waypoints, areas, pontos de
 * interesse, accoes por waypoint e uma dezena de parametros de voo - e esse
 * formato ainda vai mudar. Em colunas, cada campo novo era uma migracao e um
 * risco de as duas pontas ficarem desalinhadas; em `jsonb` a base guarda o que
 * a aplicacao ja sabe validar. O que sai para colunas e so o que a base precisa
 * de saber para ordenar, contar e ligar.
 */

create table if not exists public.projetos (
  id          text primary key,
  dono        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_em   bigint not null,
  conteudo    jsonb not null
);

create table if not exists public.rotas (
  id          text primary key,
  dono        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  projeto_id  text not null references public.projetos (id) on delete cascade,
  alterada_em bigint not null,
  conteudo    jsonb not null
);

-- Listar os projetos de quem entrou, e as rotas de um projeto, sao as duas
-- unicas consultas que a aplicacao faz a serio.
create index if not exists projetos_dono on public.projetos (dono, criado_em desc);
create index if not exists rotas_projeto on public.rotas (dono, projeto_id);

-- --------------------------------------------------------------------------
-- Politicas de linha
-- --------------------------------------------------------------------------

alter table public.projetos enable row level security;
alter table public.rotas    enable row level security;

/*
 * Quatro politicas por tabela, e nao uma para tudo.
 *
 * `using` decide que linhas se veem; `with check` decide que linhas se podem
 * escrever. Uma politica de `update` sem `with check` deixaria alguem mudar o
 * `dono` de uma linha sua e entrega-la a outra conta - ou, ao contrario,
 * reclamar uma que nao e dele. Sao as duas metades da mesma regra.
 */

drop policy if exists "projetos: ver os seus"    on public.projetos;
drop policy if exists "projetos: criar os seus"  on public.projetos;
drop policy if exists "projetos: alterar os seus" on public.projetos;
drop policy if exists "projetos: apagar os seus" on public.projetos;

create policy "projetos: ver os seus"
  on public.projetos for select
  using (auth.uid() = dono);

create policy "projetos: criar os seus"
  on public.projetos for insert
  with check (auth.uid() = dono);

create policy "projetos: alterar os seus"
  on public.projetos for update
  using (auth.uid() = dono)
  with check (auth.uid() = dono);

create policy "projetos: apagar os seus"
  on public.projetos for delete
  using (auth.uid() = dono);

drop policy if exists "rotas: ver as suas"     on public.rotas;
drop policy if exists "rotas: criar as suas"   on public.rotas;
drop policy if exists "rotas: alterar as suas" on public.rotas;
drop policy if exists "rotas: apagar as suas"  on public.rotas;

create policy "rotas: ver as suas"
  on public.rotas for select
  using (auth.uid() = dono);

/*
 * Criar uma rota exige tambem que o projeto seja do proprio.
 *
 * Sem a segunda condicao, uma conta podia pendurar rotas num projeto alheio:
 * nao as veria - a politica de leitura trata disso - mas ficavam la, e apagar o
 * projeto levava-as com ele. Escrever em casa de outro nao e coisa que se deixe
 * acontecer so porque nao se ve.
 */
create policy "rotas: criar as suas"
  on public.rotas for insert
  with check (
    auth.uid() = dono
    and exists (select 1 from public.projetos p where p.id = projeto_id and p.dono = auth.uid())
  );

create policy "rotas: alterar as suas"
  on public.rotas for update
  using (auth.uid() = dono)
  with check (auth.uid() = dono);

create policy "rotas: apagar as suas"
  on public.rotas for delete
  using (auth.uid() = dono);
