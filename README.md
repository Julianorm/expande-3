# eXpande 3.0

Nova versão do eXpande, desenvolvida em paralelo à 2.0 (repositório `Julianorm/expande`, que continua em produção).

- Código de partida: cópia da 2.0 (commit de 03/11/2026).
- Banco: Supabase. Desenvolvimento e testes num projeto separado; as migrações em `supabase/migrations/` só vão para o banco real depois de aprovadas.
- Regra do banco compartilhado: a 3.0 só ACRESCENTA tabelas/funções; nunca altera ou apaga o que a 2.0 usa.

## Migrações
| # | Arquivo | Conteúdo |
|---|---|---|
| 001 | `001_usuarios_perfis.sql` | Usuários, perfis e permissões (caixas por módulo), vínculo com vendedor do eGestor, RLS |
