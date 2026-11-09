-- Tabela de clientes
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  route text not null,
  inactive boolean default false,
  created_at timestamptz default now()
);

-- Tabela de metas diárias
create table if not exists daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  route text not null,
  goal_value numeric not null,
  date date default current_date,
  created_at timestamptz default now(),
  unique(user_id, route, date)
);

-- Tabela de vendas
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  route text not null,
  value numeric not null,
  note text,
  sale_time text,
  date date default current_date,
  created_at timestamptz default now()
);

-- Segurança por usuário
alter table clients enable row level security;
alter table daily_goals enable row level security;
alter table sales enable row level security;

create policy "clients: select own" on clients for select using (auth.uid() = user_id);
create policy "clients: insert own" on clients for insert with check (auth.uid() = user_id);
create policy "clients: delete own" on clients for delete using (auth.uid() = user_id);

create policy "goals: select own" on daily_goals for select using (auth.uid() = user_id);
create policy "goals: insert own" on daily_goals for insert with check (auth.uid() = user_id);
create policy "goals: update own" on daily_goals for update using (auth.uid() = user_id);

create policy "sales: select own" on sales for select using (auth.uid() = user_id);
create policy "sales: insert own" on sales for insert with check (auth.uid() = user_id);
create policy "sales: delete own" on sales for delete using (auth.uid() = user_id);
