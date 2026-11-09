-- eXpande 3.0 — Usuários, perfis e permissões
-- Só ACRESCENTA tabelas/funções. Não altera nada que a 2.0 usa (user_config continua igual).
-- Rodar primeiro no banco de TESTES; no banco real só depois de aprovado.

-- 1) Perfis
create table if not exists public.perfis (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  sistema     boolean not null default false,   -- true = não pode ser editado/excluído (Administrador)
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- 2) Catálogo de permissões (gera as caixas de marcar na tela)
create table if not exists public.permissoes (
  chave      text primary key,                  -- ex.: 'producao.editar'
  modulo     text not null,
  descricao  text not null,
  ordem      int  not null default 0
);

-- 3) Permissões de cada perfil
create table if not exists public.perfil_permissoes (
  perfil_id      uuid not null references public.perfis(id) on delete cascade,
  permissao_chave text not null references public.permissoes(chave) on delete cascade,
  primary key (perfil_id, permissao_chave)
);

-- 4) Usuários do eXpande (1:1 com auth.users)
create table if not exists public.usuarios (
  id                     uuid primary key references auth.users(id) on delete cascade,
  nome                   text not null,
  email                  text,
  perfil_id              uuid references public.perfis(id),
  egestor_vendedor_cod   int,                    -- vínculo com o vendedor do eGestor
  rotas                  text[] not null default '{}',
  ativo                  boolean not null default true,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index if not exists usuarios_vendedor_idx on public.usuarios(egestor_vendedor_cod);

-- 5) Log de alterações (quem mudou o quê)
create table if not exists public.usuarios_log (
  id          bigint generated always as identity primary key,
  autor_id    uuid default auth.uid(),
  tabela      text not null,
  registro_id text not null,
  acao        text not null,
  dados       jsonb,
  criado_em   timestamptz not null default now()
);

-- Funções de apoio (security definer: leem as tabelas sem depender do RLS)
create or replace function public.tem_permissao(p_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from usuarios u
    join perfis p on p.id = u.perfil_id and p.ativo
    left join perfil_permissoes pp on pp.perfil_id = p.id
    where u.id = auth.uid() and u.ativo
      and (p.sistema or pp.permissao_chave = p_chave)
  );
$$;

create or replace function public.meu_vendedor_cod()
returns int language sql stable security definer set search_path = public as $$
  select egestor_vendedor_cod from usuarios where id = auth.uid() and ativo;
$$;

create or replace function public.minhas_permissoes()
returns setof text language sql stable security definer set search_path = public as $$
  select pm.chave from permissoes pm
  where exists (
    select 1 from usuarios u join perfis p on p.id = u.perfil_id and p.ativo
    left join perfil_permissoes pp on pp.perfil_id = p.id and pp.permissao_chave = pm.chave
    where u.id = auth.uid() and u.ativo and (p.sistema or pp.permissao_chave is not null)
  );
$$;

-- Log automático
create or replace function public.log_alteracao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into usuarios_log(tabela, registro_id, acao, dados)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'perfil_id'),
          tg_op,
          case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

drop trigger if exists log_usuarios on public.usuarios;
create trigger log_usuarios after insert or update or delete on public.usuarios
  for each row execute function public.log_alteracao();
drop trigger if exists log_perfis on public.perfis;
create trigger log_perfis after insert or update or delete on public.perfis
  for each row execute function public.log_alteracao();
drop trigger if exists log_perfil_permissoes on public.perfil_permissoes;
create trigger log_perfil_permissoes after insert or delete on public.perfil_permissoes
  for each row execute function public.log_alteracao();

-- Perfil de sistema não pode ser alterado/excluído
create or replace function public.protege_perfil_sistema() returns trigger
language plpgsql as $$
begin
  if old.sistema then raise exception 'O perfil % é do sistema e não pode ser alterado.', old.nome; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists protege_perfil on public.perfis;
create trigger protege_perfil before update or delete on public.perfis
  for each row execute function public.protege_perfil_sistema();

-- RLS
alter table public.perfis            enable row level security;
alter table public.permissoes        enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.usuarios          enable row level security;
alter table public.usuarios_log      enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);
drop policy if exists perfis_gerir on public.perfis;
create policy perfis_gerir on public.perfis for all to authenticated
  using (public.tem_permissao('usuarios.perfis')) with check (public.tem_permissao('usuarios.perfis'));

drop policy if exists permissoes_ler on public.permissoes;
create policy permissoes_ler on public.permissoes for select to authenticated using (true);

drop policy if exists pp_ler on public.perfil_permissoes;
create policy pp_ler on public.perfil_permissoes for select to authenticated using (true);
drop policy if exists pp_gerir on public.perfil_permissoes;
create policy pp_gerir on public.perfil_permissoes for all to authenticated
  using (public.tem_permissao('usuarios.perfis')) with check (public.tem_permissao('usuarios.perfis'));

drop policy if exists usuarios_ler on public.usuarios;
create policy usuarios_ler on public.usuarios for select to authenticated
  using (id = auth.uid() or public.tem_permissao('usuarios.ver'));
drop policy if exists usuarios_gerir on public.usuarios;
create policy usuarios_gerir on public.usuarios for update to authenticated
  using (public.tem_permissao('usuarios.editar')) with check (public.tem_permissao('usuarios.editar'));
-- inserir/criar login: só pela Edge Function (chave de serviço)

drop policy if exists log_ler on public.usuarios_log;
create policy log_ler on public.usuarios_log for select to authenticated
  using (public.tem_permissao('usuarios.perfis'));

-- Catálogo inicial de permissões
insert into public.permissoes(chave, modulo, descricao, ordem) values
 ('usuarios.ver',            'Usuários',      'Ver usuários',                          10),
 ('usuarios.editar',         'Usuários',      'Cadastrar e editar usuários',           11),
 ('usuarios.perfis',         'Usuários',      'Gerenciar perfis e permissões',         12),
 ('vendas.ver_proprias',     'Vendas / Rotas','Ver só as próprias vendas e clientes',  20),
 ('vendas.ver_todas',        'Vendas / Rotas','Ver vendas e clientes de todos',        21),
 ('vendas.lancar',           'Vendas / Rotas','Lançar pedidos',                        22),
 ('vendas.exportar_egestor', 'Vendas / Rotas','Exportar pedidos para o eGestor',       23),
 ('vendas.metas',            'Vendas / Rotas','Definir metas e data de entrega',       24),
 ('producao.ver',            'Produção',      'Ver plano de produção',                 30),
 ('producao.editar',         'Produção',      'Editar plano de produção',              31),
 ('producao.registrar',      'Produção',      'Registrar o produzido (padeiro)',       32),
 ('empacotamento.ver',       'Empacotamento', 'Ver empacotamento',                     40),
 ('empacotamento.registrar', 'Empacotamento', 'Registrar o embalado',                  41),
 ('estoque.contar',          'Estoque',       'Lançar contagem de estoque',            50),
 ('estoque.ver',             'Estoque',       'Ver estoque',                           51),
 ('estoque.ajustar',         'Estoque',       'Ajustar estoque',                       52),
 ('relatorios.vendas',       'Relatórios',    'Ver relatórios de vendas e trocas',     60),
 ('relatorios.previsoes',    'Relatórios',    'Ver médias e previsões',                61),
 ('relatorios.financeiro',   'Relatórios',    'Ver financeiro',                        62)
on conflict (chave) do update set modulo = excluded.modulo, descricao = excluded.descricao, ordem = excluded.ordem;

-- Perfis iniciais (os mesmos da 2.0)
insert into public.perfis(nome, descricao, sistema) values
 ('Administrador', 'Acesso total', true),
 ('Vendedor',      'Vendedor externo, vinculado ao eGestor', false),
 ('Financeiro',    'Relatórios e acompanhamento de vendas', false),
 ('Entregador',    'Entregas e clientes da rota', false),
 ('Padeiro',       'Produção', false),
 ('Embalador',     'Empacotamento', false),
 ('Estoquista',    'Contagem e estoque', false)
on conflict (nome) do nothing;

insert into public.perfil_permissoes(perfil_id, permissao_chave)
select p.id, x.chave from public.perfis p
join (values
  ('Vendedor','vendas.ver_proprias'),('Vendedor','vendas.lancar'),
  ('Financeiro','vendas.ver_todas'),('Financeiro','relatorios.vendas'),('Financeiro','relatorios.financeiro'),('Financeiro','relatorios.previsoes'),
  ('Entregador','vendas.ver_proprias'),
  ('Padeiro','producao.ver'),('Padeiro','producao.registrar'),
  ('Embalador','empacotamento.ver'),('Embalador','empacotamento.registrar'),
  ('Estoquista','estoque.contar'),('Estoquista','estoque.ver')
) as x(perfil, chave) on x.perfil = p.nome
on conflict do nothing;

-- Migração única dos usuários da 2.0 (user_config → usuarios). Pode rodar de novo sem duplicar.
insert into public.usuarios(id, nome, email, perfil_id, egestor_vendedor_cod, rotas)
select uc.user_id,
       coalesce(uc.name, au.email),
       au.email,
       (select id from public.perfis where nome = case
            when uc.user_id = '7ad867ea-496c-412c-8acd-5cc7c21eca0e' or lower(uc.perfil) = 'admin' then 'Administrador'
            when lower(uc.perfil) = 'financeiro' then 'Financeiro'
            when lower(uc.perfil) = 'entregador' then 'Entregador'
            else 'Vendedor' end),
       uc.egestor_vendedor_code,
       coalesce(uc.rotas, '{}')
from public.user_config uc
join auth.users au on au.id = uc.user_id
on conflict (id) do nothing;
