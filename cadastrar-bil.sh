#!/bin/sh
# ============================================================================
# USE ERP (local) — cadastra a BIL Importação e Exportação LTDA
#
# Uso:
#   ./cadastrar-bil.sh
#   BIL_ADMIN_EMAIL=etcsuporte889@gmail.com ./cadastrar-bil.sh
#   BIL_ADMIN_PASSWORD='<senha-inicial>' ./cadastrar-bil.sh
#
# Sobe a stack local, reaplica migrations/ajustes e roda
# docker/local/scripts/seed-bil.sql (idempotente).
# ============================================================================
set -eu

cd "$(dirname "$0")"

EMAIL="${BIL_ADMIN_EMAIL:-etcsuporte889@gmail.com}"

if ! docker version >/dev/null 2>&1; then
  echo "Docker nao respondeu. Inicie o Docker e rode de novo." >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  echo ".env.local nao encontrado. Rode primeiro ./instalar-local.sh" >&2
  exit 1
fi

if [ -z "${BIL_ADMIN_PASSWORD:-}" ]; then
  printf "Senha inicial do administrador %s: " "$EMAIL" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r BIL_ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  printf "\n" >&2
fi
export BIL_ADMIN_PASSWORD

COMPOSE="docker compose -f docker-compose.local.yml --env-file .env.local"

echo "==> Subindo a stack local..."
$COMPOSE up -d db auth rest realtime storage imgproxy functions web

echo "==> Aplicando migrations e ajustes locais..."
$COMPOSE run --rm migrate

echo "==> Cadastrando a BIL Importação e Exportação LTDA..."
$COMPOSE exec -T -e BIL_ADMIN_PASSWORD db \
  psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 \
  -v "admin_email=$EMAIL" \
  < docker/local/scripts/seed-bil.sql

unset BIL_ADMIN_PASSWORD

echo "OK  BIL cadastrada com acesso total (plano Enterprise, Produção liberada)."
echo "  Login: $EMAIL"
echo "  Abra o endereco local do sistema (ex.: http://localhost:8080) e entre."
echo "  Troque a senha inicial depois do primeiro acesso."
