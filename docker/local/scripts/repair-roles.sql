-- ============================================================================
-- USE ERP (local) — reparo dos papéis internos do Supabase
--
-- Quando a primeira inicializacao do PostgreSQL e abortada no meio (a
-- cadeia oficial init-scripts/*.sql para no primeiro erro), o volume nasce
-- sem os papeis que auth/storage/rest usam (supabase_auth_admin,
-- authenticator, anon, ...) e todos os servicos ficam em loop.
--
-- Este roteiro (idempotente) cria os papeis padrao que faltam — os mesmos
-- que a inicializacao oficial criaria — alinha as senhas com o
-- POSTGRES_PASSWORD do .env.local e garante os esquemas base. NAO apaga
-- nada e pode rodar quantas vezes for preciso.
--
-- Uso: psql como supabase_admin, com POSTGRES_PASSWORD no ambiente
-- (os scripts reparar-banco.ps1/.bat fazem isso por você).
-- ============================================================================

\set ON_ERROR_STOP on
\getenv pgpass POSTGRES_PASSWORD
SELECT set_config('app.pgpass', :'pgpass', false);

DO $$
DECLARE
  v_pw text := current_setting('app.pgpass', true);
  r record;
BEGIN
  -- Papéis padrão do Supabase (cria só os que faltam)
  FOR r IN
    SELECT * FROM (VALUES
      ('anon',                   'NOLOGIN NOINHERIT'),
      ('authenticated',          'NOLOGIN NOINHERIT'),
      ('service_role',           'NOLOGIN NOINHERIT BYPASSRLS'),
      ('authenticator',          'LOGIN NOINHERIT'),
      ('postgres',               'LOGIN SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS'),
      ('supabase_auth_admin',    'LOGIN NOINHERIT CREATEROLE'),
      ('supabase_storage_admin', 'LOGIN NOINHERIT CREATEROLE'),
      ('supabase_functions_admin','LOGIN NOINHERIT CREATEROLE'),
      ('pgbouncer',              'LOGIN'),
      -- As migracoes internas do Realtime fazem REVOKE ... FROM
      -- dashboard_user; sem o papel elas abortam (42704) e as
      -- assinaturas postgres_changes do tenant nao sao provisionadas.
      ('dashboard_user',         'NOLOGIN')
    ) AS x(rolname, opts)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.rolname) THEN
      EXECUTE format('CREATE ROLE %I %s', r.rolname, r.opts);
      RAISE NOTICE 'papel criado: %', r.rolname;
    END IF;
  END LOOP;

  -- Senhas alinhadas ao .env.local (auth/rest/storage logam com elas)
  FOR r IN
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('authenticator', 'pgbouncer', 'postgres', 'supabase_admin',
                       'supabase_auth_admin', 'supabase_functions_admin', 'supabase_storage_admin')
  LOOP
    EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', r.rolname, v_pw);
  END LOOP;

  -- PostgREST assume estes papéis a partir do authenticator
  GRANT anon, authenticated, service_role TO authenticator;

  -- Serviços criam/migram os próprios esquemas na subida
  GRANT CREATE ON DATABASE postgres TO supabase_auth_admin;
  GRANT CREATE ON DATABASE postgres TO supabase_storage_admin;
END $$;

CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Elo critico da inicializacao oficial (00000000000001-auth-schema.sql):
-- o GoTrue cria sua tabela de controle SEM qualificar o esquema; com o
-- search_path do papel apontando para "auth", ela nasce no esquema certo.
-- Sem isto: "permission denied for schema public" e o auth nao sobe.
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = 'auth';
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON SCHEMA storage TO supabase_storage_admin;
ALTER ROLE supabase_storage_admin SET search_path = 'storage';

-- Realtime: a inicializacao oficial cria o esquema e a publicacao antes do
-- servico subir (create-realtime-schema). Sem eles o Ecto nem comeca:
-- "no schema has been selected to create in".
-- O servico usa DB_AFTER_CONNECT_QUERY="SET search_path TO _realtime": o
-- esquema interno dele e _realtime (create-realtime-schema da imagem).
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
CREATE SCHEMA IF NOT EXISTS realtime AUTHORIZATION supabase_admin;
DO $pub$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $pub$;
ALTER ROLE supabase_admin SET search_path = "$user", public, auth, extensions;

SELECT rolname FROM pg_roles
 WHERE rolname IN ('anon','authenticated','service_role','authenticator','postgres',
                   'supabase_admin','supabase_auth_admin','supabase_storage_admin',
                   'supabase_functions_admin','pgbouncer','dashboard_user')
 ORDER BY rolname;
