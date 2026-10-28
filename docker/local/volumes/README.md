# Arquivos de inicialização (Supabase self-hosted)

Os arquivos em `db/` e `functions/main/` são os scripts oficiais de
inicialização do repositório **supabase/supabase** (pasta `docker/volumes/`),
copiados sem alteração para que o PostgreSQL local nasça com os mesmos
schemas/papéis da nuvem (`auth`, `storage`, `_realtime`, `supabase_functions`,
papéis `anon`/`authenticated`/`service_role`, extensões pg_cron/pg_net).

- `db/realtime.sql`, `db/webhooks.sql`, `db/roles.sql`, `db/jwt.sql`,
  `db/_supabase.sql`, `db/logs.sql`, `db/pooler.sql` — montados pelo
  `docker-compose.local.yml` nos mesmos caminhos usados pela stack oficial.
- `functions/main/index.ts` + `functions/deno.jsonc` — roteador oficial das
  Edge Functions no `supabase/edge-runtime` (montado sobre `supabase/functions`,
  que continua sendo a fonte das funções do ERP).

Se for atualizar as versões das imagens em `docker-compose.local.yml`,
confira se estes arquivos mudaram no repositório oficial e atualize-os junto.
