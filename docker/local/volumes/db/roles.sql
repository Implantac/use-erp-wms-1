-- NOTE: change to your own passwords for production environments
-- Defensivo: so altera papeis que ja existem. Um ALTER incondicional num
-- papel ainda nao criado abortava TODA a inicializacao (o volume nascia
-- "pela metade" e nunca mais inicializava).
\set pgpass `echo "$POSTGRES_PASSWORD"`

SELECT format('ALTER USER %I WITH PASSWORD %L', rolname, :'pgpass')
  FROM pg_roles
 WHERE rolname IN ('authenticator', 'pgbouncer', 'supabase_auth_admin',
                   'supabase_functions_admin', 'supabase_storage_admin')
\gexec
