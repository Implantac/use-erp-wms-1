#!/bin/sh
# ============================================================================
# USE ERP (local) — aplica as migrations do projeto no PostgreSQL local.
#
# - Roda UMA vez por migration (controle em supabase_migrations.schema_migrations,
#   mesmo esquema usado pelo Supabase CLI na nuvem).
# - Espera Auth/Storage/Realtime criarem seus esquemas (auth.users,
#   storage.objects, realtime.messages), porque migrations os referenciam.
# - Antes/depois de migrations específicas roda os patches locais de
#   docker/local/scripts/patches/ (o histórico presume dados/objetos que só
#   existiam na nuvem de origem) e, ao final, 99-local-final.sql.
# - Para na PRIMEIRA falha e NÃO marca a migration como aplicada.
# - Ao final, reaponta os agendamentos (pg_cron) que nasceram apontando para
#   a nuvem antiga e recarrega o cache de esquema do PostgREST.
# ============================================================================
set -eu

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD nao definido}"
DB_URL="postgres://${POSTGRES_USER:-postgres}@db:5432/${POSTGRES_DB:-postgres}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
LOCAL_FUNCTIONS_URL="${LOCAL_FUNCTIONS_URL:-http://functions:9000}"
# URL interna das Edge Functions vista de dentro do container do banco:
# http://functions:9000/<nome-da-funcao> (o roteador local dispensa o prefixo /functions/v1).
ANON_KEY="${ANON_KEY:-}"

psql_db() { psql "$DB_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "==> Aguardando o banco aceitar conexoes..."
i=0
until psql_db -tAc 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "ERRO: banco nao respondeu em 120s"; exit 1; }
  sleep 2
done

echo "==> Aguardando Auth, Storage e Realtime criarem seus esquemas..."
echo "    (auth.users / storage.objects / realtime.messages — migrations os referenciam)"
i=0
until [ "$(psql_db -tAc "SELECT (to_regclass('auth.users') IS NOT NULL) AND (to_regclass('storage.objects') IS NOT NULL) AND (to_regclass('realtime.messages') IS NOT NULL)")" = "t" ]; do
  i=$((i + 1)); [ "$i" -gt 90 ] && { echo "ERRO: auth/storage/realtime nao inicializaram em 180s. Estado dos esquemas:"; psql_db -tAc "SELECT '  auth.users=' || (to_regclass('auth.users') IS NOT NULL) || ' storage.objects=' || (to_regclass('storage.objects') IS NOT NULL) || ' realtime.messages=' || (to_regclass('realtime.messages') IS NOT NULL)"; echo "Veja os logs do servico correspondente (docker compose logs auth|storage|realtime)."; exit 1; }
  sleep 2
done

# Extensoes da plataforma: na imagem oficial o pgcrypto mora no esquema
# "extensions" e ha migrations que chamam gen_random_bytes/digest sem
# qualificar. Garantimos a extensao e o search_path do papel do migrate.
psql_db <<'SQL'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- O PostgREST (v13+) valida os esquemas de PGRST_DB_SCHEMAS na carga do
-- cache: se "graphql_public" nao existe, o cache inteiro falha (3F000) e a
-- API responde 503 para tudo. Na imagem oficial ele nasce no setup.
CREATE SCHEMA IF NOT EXISTS graphql_public;
GRANT USAGE ON SCHEMA graphql_public TO anon, authenticated, service_role;
DO $mig$
BEGIN
  EXECUTE format('ALTER ROLE %I SET search_path = ''$user'', public, auth, extensions', current_user);
END
$mig$;
SQL

psql_db <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text,
  inserted_at timestamptz NOT NULL DEFAULT now()
);
SQL

# Baseline pré-migrations (idempotente): objetos do template inicial que o
# histórico presume já existirem. Ver docker/local/scripts/00-baseline.sql.
BASELINE_FILE="${BASELINE_FILE:-/usr/local/bin/00-baseline.sql}"
if [ -f "$BASELINE_FILE" ]; then
  echo "==> Aplicando baseline pré-migrations (idempotente)..."
  psql_db --single-transaction -f "$BASELINE_FILE" >/dev/null
fi

applied=0
skipped=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  base="$(basename "$file")"
  version="${base%%_*}"
  name="${base#*_}"; name="${name%.sql}"

  already="$(psql_db -tAc "SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '$name' AND (version = '$version' OR version LIKE '$version-%')")"
  if [ "$already" = "1" ]; then
    skipped=$((skipped + 1))
    continue
  fi
  # Duas migrations partilham a mesma versao (20260807000000 e 20260811000000):
  # a PRIMARY KEY so comporta uma. Nesse caso registramos a segunda com a
  # versao sufixada pelo nome, para NENHUM arquivo ser pulado em silencio.
  version_key="$version"
  if [ "$(psql_db -tAc "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version'")" = "1" ]; then
    version_key="$version-$name"
    echo "==> Aviso: versao $version duplicada - registrando como $version_key"
  fi

  # Patches LOCAIS opcionais (não alteram as migrations originais):
  # docker/local/scripts/patches/before-<versão>.sql roda antes da migration
  # correspondente; after-<versão>.sql, logo depois dela ser marcada.
  PATCH_DIR="${PATCH_DIR:-/usr/local/bin/patches}"
  if [ -f "$PATCH_DIR/before-$version.sql" ]; then
    echo "==> Patch local anterior: before-$version.sql"
    if ! psql_db --single-transaction -f "$PATCH_DIR/before-$version.sql" >/dev/null; then
      echo "ERRO: patch local before-$version.sql falhou."
      exit 1
    fi
  fi

  echo "==> Aplicando $base"
  if ! psql_db --single-transaction -f "$file" >/dev/null; then
    echo "ERRO: migration $base falhou. Nada foi marcado; corrija e rode o instalador de novo (ele retoma daqui)."
    exit 1
  fi
  psql_db -c "INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('$version_key', '$name') ON CONFLICT (version) DO NOTHING" >/dev/null
  applied=$((applied + 1))

  if [ -f "$PATCH_DIR/after-$version.sql" ]; then
    echo "==> Patch local posterior: after-$version.sql"
    if ! psql_db --single-transaction -f "$PATCH_DIR/after-$version.sql" >/dev/null; then
      echo "ERRO: patch local after-$version.sql falhou."
      exit 1
    fi
  fi
done

echo "==> Migrations: $applied aplicadas, $skipped ja existiam."

# Ajustes finais locais (idempotente): grants das RPCs do frontend + plano
# starter. Ver docker/local/scripts/99-local-final.sql.
FINAL_FILE="${FINAL_FILE:-/usr/local/bin/99-local-final.sql}"
if [ -f "$FINAL_FILE" ]; then
  echo "==> Aplicando ajustes finais locais (grants/plano starter)..."
  psql_db --single-transaction -f "$FINAL_FILE" >/dev/null
fi

# --- Reapontar agendamentos que nasceram com a URL/chave da nuvem antiga ---
if [ -n "$ANON_KEY" ]; then
  echo "==> Reapontando pg_cron para as Edge Functions locais ($LOCAL_FUNCTIONS_URL)..."
  psql_db -v new_fn="'$LOCAL_FUNCTIONS_URL'" -v new_anon="'$ANON_KEY'" <<'SQL'
-- https://<ref>.supabase.co/functions/v1/<fn>  ->  http://functions:9000/<fn>
UPDATE cron.job
SET command = regexp_replace(command, 'https://[a-z0-9]+\.supabase\.co/functions/v1', :'new_fn', 'g')
WHERE command ~ 'https://[a-z0-9]+\.supabase\.co/functions/v1';

UPDATE cron.job
SET command = regexp_replace(command, 'Bearer eyJ[A-Za-z0-9._-]+', 'Bearer ' || :'new_anon', 'g')
WHERE command ~ 'Bearer eyJ';
SQL
fi

# Funções PL/pgSQL históricas com a URL da nuvem embutida no corpo:
# NÃO reescrevemos corpos de função automaticamente (risco de corromper a
# lógica). Apenas listamos para auditoria — os gatilhos afetados falham em
# silêncio (pg_net é assíncrono) e o ERP continua operando.
echo "==> Auditoria: objetos que ainda citam a nuvem antiga (informativo):"
psql_db -tAc "
SELECT '  - funcao public.' || p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ILIKE '%supabase.co%'
UNION ALL
SELECT '  - job pg_cron: ' || jobname FROM cron.job WHERE command ILIKE '%supabase.co%';" || true

psql_db -c "NOTIFY pgrst, 'reload schema';" >/dev/null
echo "==> Banco pronto."
