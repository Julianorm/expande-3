-- eXpande 3.0 — Contagem de estoque no fim do dia
-- Regra: estoque = embalado que sobrou no depósito depois de separar a carga do dia seguinte
--                  + produzido ainda não embalado.
-- O plano de produção desconta a última contagem fechada.
-- Só ACRESCENTA tabelas/colunas novas. A 2.0 não usa nada disto.

create table if not exists public.estoque_contagens (
  id          uuid primary key default gen_random_uuid(),
  data        date not null unique,                 -- dia da contagem (fim do dia)
  status      text not null default 'aberta' check (status in ('aberta','fechada')),
  obs         text,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  fechado_por uuid,
  fechado_em  timestamptz
);

create table if not exists public.estoque_contagem_itens (
  contagem_id  uuid not null references public.estoque_contagens(id) on delete cascade,
  erp_code     int  not null,
  descricao    text,
  embalado     numeric not null default 0,
  nao_embalado numeric not null default 0,
  total        numeric generated always as (embalado + nao_embalado) stored,
  primary key (contagem_id, erp_code)
);

-- Estoque usado no cálculo de cada item do plano (para consulta depois).
alter table public.prod_plano_itens add column if not exists estoque numeric not null default 0;
alter table public.prod_planos add column if not exists contagem_data date;

alter table public.estoque_contagens      enable row level security;
alter table public.estoque_contagem_itens enable row level security;

-- Ver: quem vê estoque, conta estoque ou monta o plano de produção (o plano lê a contagem).
drop policy if exists ec_ler on public.estoque_contagens;
create policy ec_ler on public.estoque_contagens for select to authenticated
  using (public.tem_permissao('estoque.ver') or public.tem_permissao('estoque.contar') or public.tem_permissao('producao.ver'));
drop policy if exists eci_ler on public.estoque_contagem_itens;
create policy eci_ler on public.estoque_contagem_itens for select to authenticated
  using (public.tem_permissao('estoque.ver') or public.tem_permissao('estoque.contar') or public.tem_permissao('producao.ver'));

-- Contar: cria e altera contagens ABERTAS (e pode fechá-las).
drop policy if exists ec_criar on public.estoque_contagens;
create policy ec_criar on public.estoque_contagens for insert to authenticated
  with check (public.tem_permissao('estoque.contar') and status = 'aberta');
drop policy if exists ec_contar on public.estoque_contagens;
create policy ec_contar on public.estoque_contagens for update to authenticated
  using (public.tem_permissao('estoque.contar') and status = 'aberta')
  with check (public.tem_permissao('estoque.contar'));
drop policy if exists eci_contar on public.estoque_contagem_itens;
create policy eci_contar on public.estoque_contagem_itens for all to authenticated
  using (public.tem_permissao('estoque.contar')
         and exists (select 1 from public.estoque_contagens c where c.id = contagem_id and c.status = 'aberta'))
  with check (public.tem_permissao('estoque.contar')
         and exists (select 1 from public.estoque_contagens c where c.id = contagem_id and c.status = 'aberta'));

-- Ajustar: reabre e corrige contagens já fechadas.
drop policy if exists ec_ajustar on public.estoque_contagens;
create policy ec_ajustar on public.estoque_contagens for all to authenticated
  using (public.tem_permissao('estoque.ajustar')) with check (public.tem_permissao('estoque.ajustar'));
drop policy if exists eci_ajustar on public.estoque_contagem_itens;
create policy eci_ajustar on public.estoque_contagem_itens for all to authenticated
  using (public.tem_permissao('estoque.ajustar')) with check (public.tem_permissao('estoque.ajustar'));

-- O estoquista conta os mesmos produtos da Produção: precisa ler a lista de produtos e linhas.
drop policy if exists prod_linhas_ler_estoque on public.prod_linhas;
create policy prod_linhas_ler_estoque on public.prod_linhas for select to authenticated
  using (public.tem_permissao('estoque.contar') or public.tem_permissao('estoque.ver'));
drop policy if exists prod_produtos_ler_estoque on public.prod_produtos;
create policy prod_produtos_ler_estoque on public.prod_produtos for select to authenticated
  using (public.tem_permissao('estoque.contar') or public.tem_permissao('estoque.ver'));
