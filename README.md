# eXpande 3.0

Nova versão do eXpande, desenvolvida em paralelo à 2.0 (repositório `Julianorm/expande`, que continua em produção).

- Código de partida: cópia da 2.0 (commit de 03/11/2026).
- Banco real: projeto `crm-rota` (org Pro). Banco de testes: projeto `expande-3-testes` (org gratuita "eXpande Testes"), já com 000 + 001 aplicadas em 10/11/2026.
- Banco: Supabase. Desenvolvimento e testes num projeto separado; as migrações em `supabase/migrations/` só vão para o banco real depois de aprovadas.
- Regra do banco compartilhado: a 3.0 só ACRESCENTA tabelas/funções; nunca altera ou apaga o que a 2.0 usa.

## Migrações
| # | Arquivo | Conteúdo |
|---|---|---|
| 000 | `000_estrutura_2.0.sql` | Estrutura das tabelas da 2.0 — só para montar o banco de testes |
| 001 | `001_usuarios_perfis.sql` | Usuários, perfis e permissões (caixas por módulo), vínculo com vendedor do eGestor, RLS |
| 002 | `002_permissao_data_entrega.sql` | Separa "meta do dia" de "data de entrega"; Vendedor já vem com a de data |
| 003 | `003_pedido_data_entrega.sql` | Coluna opcional `orders.dt_entrega` (entrega futura por pedido). **Aplicar antes de publicar o app.** |
| 004 | `004_cliente_preferencias.sql` | Tabela nova `cliente_preferencias`: última escolha de cada cliente no pedido (tipo, forma de pagamento, prazo em dias) |
| 005 | `005_producao.sql` | Módulo de Produção: `prod_linhas`, `prod_produtos`, `prod_calendario`, `prod_planos`, `prod_plano_itens` + coluna `sales.dt_entrega`. Já vem com as linhas (rendimentos) e o calendário de rotas de nov/2026 |
| 006 | `006_estoque_contagem.sql` | Contagem de estoque do fim do dia (`estoque_contagens`, `estoque_contagem_itens`: embalado + não embalado); coluna `estoque` no plano. **Depois da 005.** |
| 007 | `007_rendimento_por_produto.sql` | Rendimento por produto (opcional) em `prod_produtos`: mesma massa, pesos diferentes (ex.: Maluquinho 400g/200g) |

## Edge Functions
Cópia fiel (conferida byte a byte em 11/11/2026) das funções do banco real `crm-rota`, em `supabase/functions/`. Publicar no banco de testes com **Verify JWT desligado**, como na 2.0. `teste-token` não foi copiada (era só teste).

| Função | O que faz |
|---|---|
| `admin-api` | Criar, listar, excluir usuários e trocar senha (usa `user_config`) |
| `egestor-api` | Produtos, buscar/criar/editar venda no eGestor, vendedores, perfil do cliente |
| `egestor-webhook` | Recebe do eGestor alterações de contatos e atualiza `clients` |
| `sync-clientes` | Sincroniza todos os contatos do eGestor para `clients` |
| `sync-produtos` | Sincroniza todos os produtos do eGestor para `products` |
| `usuarios-api` | **Novo na 3.0.** Listar, criar, editar, desativar usuários e trocar senha. Confere o login e a permissão de quem chama; só Administrador mexe em Administrador. Mantém `user_config` em sincronia para a 2.0 |

**Atenção nos testes:** `criar_venda` e `editar_venda` gravam no eGestor de verdade. Com o token real no banco de testes, um pedido feito na 3.0 vira venda real.

## Usuários e perfis (3.0)
- Aba **Config** → **Usuários** e **Perfis** (`src/pages/Usuarios.js`), para quem tem cadastro na tabela `usuarios`.
- Usuário não é excluído: é **desativado** (o login fica bloqueado e o histórico continua).
- Ninguém muda o próprio perfil nem se desativa.
- Perfis e permissões são gravados direto nas tabelas, protegidas por RLS (permissão `usuarios.perfis`).

## Produção (3.0)
- Aba **Produção** (`src/pages/Producao.js`) para quem tem `producao.ver`. Quem não vende (ex.: Padeiro) entra direto nela, sem a tela de rota/meta.
- **Plano do dia**: produz no dia D para a entrega de D+2 (quinta → segunda + terça; sexta sem pão).
  Sugestão = pedidos/vendas firmes para a(s) entrega(s) + média das rotas que ainda não venderam
  (vendas do eXpande no mesmo dia da semana, últimas 8 semanas) + margem da rota. Receitas por linha com aviso de limite.
- Fluxo: Calcular → ajustar o planejado → **Aprovar** (`producao.editar`) → padeiro registra o **produzido** e conclui (`producao.registrar`).
- **Visão do padeiro** (quem tem `producao.registrar` e não `producao.editar`): por massa, total de **receitas** em destaque; por produto, só **Fazer** e **Produzido**, com campos e botões grandes. Sem colunas de cálculo nem Configuração. Quem edita pode espiar com "Ver como o padeiro vê".
- **Configuração**: qual produto é de qual linha (massa), rendimento padrão da linha, rendimento próprio do produto quando o peso muda, limite por dia e calendário de rotas.
  Receitas da linha = soma de (quantidade ÷ rendimento do produto, ou o padrão da linha).
- A exportação de pedidos passa a gravar `sales.dt_entrega`, usada para saber quais rotas já venderam para cada entrega.

## Estoque (3.0)
- Aba **Estoque** (`src/pages/Estoque.js`) para quem tem `estoque.contar` ou `estoque.ver`. O Estoquista entra direto nela.
- **Contagem do fim do dia**, depois de separar a carga do dia seguinte: por produto, **embalado** que sobrou + **não embalado**.
  Salvar, **Fechar contagem** (`estoque.contar`); reabrir para corrigir só com `estoque.ajustar`. Dá para contar outros produtos (biscoito, rosca…).
- O **plano de produção** usa a última contagem fechada (até 4 dias antes do dia da produção) e desconta só a **sobra**:
  do que foi contado no dia C, reserva antes o que ainda sai nas entregas entre C+2 e a véspera da primeira entrega do plano
  (a carga de C+1 já foi separada). Sugerido = firme + estimado − estoque livre (nunca negativo).
