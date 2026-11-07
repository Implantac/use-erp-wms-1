#!/usr/bin/env bash
# ============================================================================
# USE ERP — bootstrap de HOMOLOGACAO (QA-06)
#
# PROPOSTA NAO EXECUTADA (07/11/2026). Nenhum container foi criado nesta
# rodada: o sandbox nao tem Docker. Este script e o procedimento revisavel.
#
# O que faz, em ordem, sempre falhando fechado:
#   1. exige .env.homologacao (nao versionado) e Docker Compose >= 2.24.4
#   2. pre-voo dos 18 segredos + invariantes estaticos do overlay
#   3. valida a sintaxe do compose SEM subir nada
#   4. sobe backend, aplica as 504 migrations e os 3 seeds deterministicos
#   5. sobe o web, espera /healthz
#   6. roda bun run e2e:critical com E2E_REQUIRE_ALL=1 (anti-skip)
#   7. derruba TUDO no EXIT, inclusive em caso de falha
#
# NUNCA: usa dados de cliente, aponta para producao, aplica migrations em banco
# real, cadastra segredos no GitHub, faz deploy ou presume aceite.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

BASE_COMPOSE="docker-compose.local.yml"
OVERLAY="infra/homologacao/docker-compose.homologacao.yml"
ENV_FILE=".env.homologacao"
COMPOSE=(docker compose -f "$BASE_COMPOSE" -f "$OVERLAY" --env-file "$ENV_FILE")
E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:8080}"

die() { printf '::error::%s\n' "$1" >&2; exit 2; }
log() { printf '[homologacao] %s\n' "$1"; }

command -v docker >/dev/null 2>&1 || die "Docker ausente; nada foi executado."
[ -f "$ENV_FILE" ] || die "$ENV_FILE ausente; copie infra/homologacao/homologacao.env.example e preencha. NUNCA versione."
[ -f "$BASE_COMPOSE" ] || die "compose base ausente"
[ -f "$OVERLAY" ] || die "overlay de homologacao ausente"

# Nao imprimir valores: apenas carregar para o ambiente do processo.
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

teardown() {
  log "teardown: derrubando containers e volumes descartaveis"
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap teardown EXIT

log "1/7 pre-voo dos 18 segredos (valores nunca exibidos)"
node scripts/validate-homologacao-env.mjs || die "pre-voo reprovou; testes nao serao executados."

log "2/7 invariantes estaticos do overlay e do bootstrap"
node scripts/validate-homologacao-compose.mjs || die "overlay reprovado pelo validador estatico."

log "3/7 sintaxe do compose (sem subir nada)"
"${COMPOSE[@]}" config -q || die "docker compose config -q reprovou."

log "4/7 subindo backend e aplicando migrations"
"${COMPOSE[@]}" up -d db auth rest realtime storage imgproxy functions
"${COMPOSE[@]}" run --rm migrate

log "aplicando os 3 seeds deterministicos (mesmos do ambiente isolado)"
apply_seed() {
  local file="docker/local/scripts/$1"
  [ -f "$file" ] || die "seed ausente: $file"
  "${COMPOSE[@]}" exec -T db \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -v admin_email="${E2E_ADMIN_EMAIL:?E2E_ADMIN_EMAIL ausente}" \
    -v admin_password="${E2E_ADMIN_PASSWORD:?E2E_ADMIN_PASSWORD ausente}" \
    -f - < "$file" >/dev/null
}
apply_seed seed-bil.sql
apply_seed seed-fluxo-teste.sql
apply_seed seed-tecelagem-teste.sql

log "conferindo a contagem de migrations aplicadas"
"${COMPOSE[@]}" exec -T db \
  psql -U supabase_admin -d postgres -tAc \
  "SELECT count(*) FROM supabase_migrations.schema_migrations"

log "5/7 subindo o web e esperando /healthz"
"${COMPOSE[@]}" up -d web
for i in $(seq 1 60); do
  if curl -fsS "$E2E_BASE_URL/healthz" >/dev/null 2>&1; then break; fi
  [ "$i" -eq 60 ] && die "web nao respondeu em /healthz"
  sleep 2
done

log "6/7 jornadas autenticadas — anti-skip obrigatorio"
E2E_BASE_URL="$E2E_BASE_URL" E2E_REQUIRE_ALL=1 bun run e2e:critical

log "7/7 executado. Ainda falta registrar SHA, ambiente, data, responsavel e skip=0."
log "CI verde nao e evidencia de aplicacao utilizavel. Producao: NO-GO."
