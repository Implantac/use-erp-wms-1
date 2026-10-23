#!/usr/bin/env bash
# USE ERP (local) — backup do PostgreSQL local: ./backup-local.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
CARIMBO="$(date +%Y%m%d-%H%M%S)"
ARQUIVO="backups/useerp-${CARIMBO}.dump"

echo "Gerando backup em $ARQUIVO ..."
docker compose -f docker-compose.local.yml --env-file .env.local exec -T db pg_dump -U postgres -d postgres -Fc -f /tmp/useerp-backup.dump
docker cp useerp-db:/tmp/useerp-backup.dump "$ARQUIVO"
cp .env.local "backups/env-local-${CARIMBO}.txt"
echo "Backup concluído. Guarde a pasta backups fora desta máquina também."
echo "Arquivos (Storage) ficam no volume useerp-local_storage-data:"
echo "  docker run --rm -v useerp-local_storage-data:/data -v \"\$PWD/backups\":/backup alpine tar czf /backup/storage-${CARIMBO}.tar.gz -C /data ."
