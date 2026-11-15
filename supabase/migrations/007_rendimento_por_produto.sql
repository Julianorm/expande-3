-- eXpande 3.0 — rendimento por produto (mesma massa, pesos diferentes)
-- Ex.: Maluquinho 400g e 200g saem da mesma massa, mas uma receita rende quantidades diferentes.
-- Vazio = usa o rendimento padrão da linha. Só ACRESCENTA uma coluna opcional.
alter table public.prod_produtos add column if not exists rendimento_receita numeric
  check (rendimento_receita is null or rendimento_receita > 0);
