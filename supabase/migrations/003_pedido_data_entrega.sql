-- eXpande 3.0 — data de entrega por pedido (entrega futura).
-- Só ACRESCENTA uma coluna opcional em orders; a 2.0 não usa e continua funcionando igual.
alter table public.orders add column if not exists dt_entrega date;
