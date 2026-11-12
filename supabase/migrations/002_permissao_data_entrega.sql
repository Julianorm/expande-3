-- eXpande 3.0 — separa "meta do dia" de "data de entrega" nas permissões.
-- O vendedor às vezes precisa mudar a data de entrega no meio dos pedidos.
-- Só ACRESCENTA/atualiza linhas do catálogo da 3.0. Não mexe em nada da 2.0.

update public.permissoes
   set descricao = 'Definir a meta do dia'
 where chave = 'vendas.metas';

insert into public.permissoes(chave, modulo, descricao, ordem) values
  ('vendas.data_entrega', 'Vendas / Rotas', 'Definir e alterar a data de entrega', 25)
on conflict (chave) do update set modulo = excluded.modulo, descricao = excluded.descricao, ordem = excluded.ordem;

-- Vendedor já vem podendo ajustar a data de entrega (pode desmarcar na tela de Perfis).
insert into public.perfil_permissoes(perfil_id, permissao_chave)
select id, 'vendas.data_entrega' from public.perfis where nome = 'Vendedor'
on conflict do nothing;
