-- Defensivo: POSTGRES_USER pode vir vazio conforme o ambiente; nesse caso o
-- dono e o superusuario bootstrap (supabase_admin). So cria se nao existir.
\set pguser `echo "${POSTGRES_USER:-supabase_admin}"`

SELECT format('CREATE DATABASE _supabase WITH OWNER %I', :'pguser')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '_supabase')
\gexec
