#!/usr/bin/env bash
# USE ERP (local) — restaura um backup: ./restaurar-local.sh backups/useerp-AAAAMMDD-HHMMSS.dump
# ATENÇÃO: substitui os dados atuais do banco. Faça um backup antes.
set -euo pipefail
cd "$(dirname "$0")"
ARQUIVO="${1:?Uso: ./restaurar-local.sh backups/arquivo.dump}"
[ -f "$ARQUIVO" ] || { echo "Arquivo não encontrado: $ARQUIVO"; exit 1; }

echo "Isto vai SUBSTITUIR os dados atuais pelos do backup."
read -r -p "Digite RESTAURAR para continuar: " CONFIRMA
[ "$CONFIRMA" = "RESTAURAR" ] || { echo "Cancelado."; exit 0; }

COMPOSE=(docker compose -f docker-compose.local.yml --env-file .env.local)
"${COMPOSE[@]}" stop web functions || true
docker cp "$ARQUIVO" useerp-db:/tmp/useerp-restore.dump
"${COMPOSE[@]}" exec -T db pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/useerp-restore.dump || true
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d
echo "Restauração concluída."
