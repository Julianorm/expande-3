-- eXpande 3.0 — lembra a última escolha de cada cliente no pedido
-- (tipo do pedido, forma de pagamento e prazo de vencimento em dias).
-- Tabela nova, só da 3.0. Não mexe em nada da 2.0.
create table if not exists public.cliente_preferencias (
  client_erp_code text primary key,
  situacao        text,
  forma_pgto      int,
  prazo_dias      int not null default 0,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid()
);

alter table public.cliente_preferencias enable row level security;
drop policy if exists cp_ler on public.cliente_preferencias;
create policy cp_ler on public.cliente_preferencias for select to authenticated using (true);
drop policy if exists cp_gravar on public.cliente_preferencias;
create policy cp_gravar on public.cliente_preferencias for insert to authenticated with check (true);
drop policy if exists cp_atualizar on public.cliente_preferencias;
create policy cp_atualizar on public.cliente_preferencias for update to authenticated using (true) with check (true);
