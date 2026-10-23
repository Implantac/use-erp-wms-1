# USE ERP (local) — backup do PostgreSQL local.
#   Uso: .\backup-local.ps1
# Gera backups\useerp-AAAAMMDD-HHMMSS.dump (formato custom do pg_dump)
# e guarda tambem uma copia do .env.local (sem ele, as chaves mudam na
# reinstalacao e as sessoes/chaves antigas deixam de valer).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$pasta = Join-Path $PSScriptRoot "backups"
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
$arquivo = Join-Path $pasta "useerp-$carimbo.dump"

Write-Host "Gerando backup em $arquivo ..."
docker compose -f docker-compose.local.yml --env-file .env.local exec -T db pg_dump -U postgres -d postgres -Fc -f /tmp/useerp-backup.dump
if ($LASTEXITCODE -ne 0) { Write-Host "Falha no pg_dump." -ForegroundColor Red; exit 1 }
docker cp useerp-db:/tmp/useerp-backup.dump $arquivo
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao copiar o backup para fora do container." -ForegroundColor Red; exit 1 }

Copy-Item ".env.local" (Join-Path $pasta "env-local-$carimbo.txt") -Force
Write-Host "Backup concluido: $arquivo"
Write-Host "Guarde a pasta backups FORA desta maquina tambem (pendrive/nuvem)."
Write-Host "Arquivos anexados (Storage) ficam no volume Docker 'useerp-local_storage-data':"
Write-Host "faca backup dele com: docker run --rm -v useerp-local_storage-data:/data -v `"$pasta`":/backup alpine tar czf /backup/storage-$carimbo.tar.gz -C /data ."
