-- eXpande 3.0 — Módulo de Produção (1ª etapa: plano do dia e produzido)
-- Só ACRESCENTA: tabelas novas prod_* e uma coluna opcional sales.dt_entrega.
-- A 2.0 não usa nada disto e continua funcionando igual.

-- ---------------------------------------------------------------------------
-- Data de entrega gravada na venda (a exportação da 3.0 preenche).
-- Serve para saber, no plano, quais rotas já venderam para uma data de entrega.
alter table public.sales add column if not exists dt_entrega date;

-- ---------------------------------------------------------------------------
-- Linhas de produção: cada linha é uma massa. Produtos da mesma linha somam receitas.
create table if not exists public.prod_linhas (
  nome               text primary key,
  rendimento_receita numeric not null check (rendimento_receita > 0), -- unidades por receita
  limite_receitas    numeric,             -- máximo de receitas por dia (vazio = sem limite)
  so_pedido          boolean not null default false, -- true = produz só com pedido firme (ex.: Dogão)
  ordem              int not null default 100,
  ativo              boolean not null default true
);

-- Produtos produzidos: liga o produto do eGestor (products.erp_code) a uma linha.
create table if not exists public.prod_produtos (
  erp_code   int primary key,
  linha      text not null references public.prod_linhas(nome) on update cascade,
  ativo      boolean not null default true
);

-- Calendário de rotas: em que dia da semana a rota vende e em que dia entrega.
-- dia_venda / dia_entrega: 0=domingo ... 6=sábado. margem em %.
create table if not exists public.prod_calendario (
  id          uuid primary key default gen_random_uuid(),
  rota        text not null,
  dia_venda   int  not null check (dia_venda between 0 and 6),
  dia_entrega int  not null check (dia_entrega between 0 and 6),
  margem      numeric not null default 10,
  ativo       boolean not null default true,
  unique (rota, dia_venda, dia_entrega)
);

-- Plano de produção de um dia.
create table if not exists public.prod_planos (
  id            uuid primary key default gen_random_uuid(),
  data_producao date not null unique,
  entregas      date[] not null default '{}',   -- datas de entrega que esta produção atende
  status        text not null default 'rascunho' check (status in ('rascunho','aprovado','concluido')),
  obs           text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  aprovado_por  uuid,
  aprovado_em   timestamptz,
  concluido_em  timestamptz
);

create table if not exists public.prod_plano_itens (
  plano_id   uuid not null references public.prod_planos(id) on delete cascade,
  erp_code   int  not null,
  descricao  text,
  linha      text not null,
  firme      numeric not null default 0,  -- pedidos/vendas já lançados para as entregas
  estimado   numeric not null default 0,  -- média das rotas ainda não vendidas (com margem)
  sugerido   numeric not null default 0,  -- firme + estimado
  planejado  numeric not null default 0,  -- o que foi aprovado para produzir
  produzido  numeric,                     -- o que o padeiro registrou
  primary key (plano_id, erp_code)
);

-- ---------------------------------------------------------------------------
-- RLS: ver = producao.ver; montar/aprovar = producao.editar; registrar = producao.registrar
alter table public.prod_linhas      enable row level security;
alter table public.prod_produtos    enable row level security;
alter table public.prod_calendario  enable row level security;
alter table public.prod_planos      enable row level security;
alter table public.prod_plano_itens enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prod_linhas','prod_produtos','prod_calendario','prod_planos','prod_plano_itens'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (public.tem_permissao(''producao.ver''))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for all to authenticated using (public.tem_permissao(''producao.editar'')) with check (public.tem_permissao(''producao.editar''))', t);
  end loop;
end $$;

-- O padeiro registra o produzido: só atualiza itens/plano aprovados.
drop policy if exists prod_plano_itens_registrar on public.prod_plano_itens;
create policy prod_plano_itens_registrar on public.prod_plano_itens for update to authenticated
  using (public.tem_permissao('producao.registrar')
         and exists (select 1 from public.prod_planos p where p.id = plano_id and p.status in ('aprovado','concluido')))
  with check (public.tem_permissao('producao.registrar'));
drop policy if exists prod_planos_registrar on public.prod_planos;
create policy prod_planos_registrar on public.prod_planos for update to authenticated
  using (public.tem_permissao('producao.registrar') and status in ('aprovado','concluido'))
  with check (public.tem_permissao('producao.registrar') and status in ('aprovado','concluido'));

-- ---------------------------------------------------------------------------
-- Sementes (regras da produção, nov/2026). Rendimentos "a confirmar": ajuste na tela.
insert into public.prod_linhas(nome, rendimento_receita, limite_receitas, so_pedido, ordem) values
  ('Forma',      80, 9,    false, 10),
  ('Sovado',     40, null, false, 20),
  ('Hambúrguer', 80, null, false, 30),
  ('Hot Dog',    70, null, false, 40),
  ('Mini',       96, null, false, 50),
  ('Caseiro',    48, null, false, 60),
  ('Integral',   35, null, false, 70),
  ('Milho',      35, null, false, 80),
  ('Dogão',     336, null, true,  90)
on conflict (nome) do nothing;

-- dia: 1=seg 2=ter 3=qua 4=qui 5=sex
insert into public.prod_calendario(rota, dia_venda, dia_entrega, margem) values
  ('SANTA MARIA',      1, 2, 10),
  ('SANTA TERESA',     1, 2, 10),
  ('LARANJA DA TERRA', 2, 3, 10),
  ('BREJETUBA',        3, 3, 15),   -- pronta entrega: carga sai na terça
  ('VENDA NOVA',       3, 4, 10),
  ('AFONSO CLAUDIO',   3, 4, 10),
  ('DOMINGOS MARTINS', 4, 5, 10),
  ('SANTA MARIA',      4, 5, 10),
  ('SANTA TERESA',     4, 5, 10),
  ('AFONSO CLAUDIO',   5, 1, 10)
on conflict (rota, dia_venda, dia_entrega) do nothing;
