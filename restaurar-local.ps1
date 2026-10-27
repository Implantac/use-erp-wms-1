# USE ERP (local) — restaura um backup gerado por .\backup-local.ps1
#   Uso: .\restaurar-local.ps1 backups\useerp-AAAAMMDD-HHMMSS.dump
# ATENCAO: substitui os dados atuais do banco. Faca um backup antes.
param(
  [Parameter(Mandatory = $true)][string]$Arquivo
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path $Arquivo)) { Write-Host "Arquivo nao encontrado: $Arquivo" -ForegroundColor Red; exit 1 }

Write-Host "Isto vai SUBSTITUIR os dados atuais pelos do backup." -ForegroundColor Yellow
$confirma = Read-Host "Digite RESTAURAR para continuar"
if ($confirma -ne "RESTAURAR") { Write-Host "Cancelado."; exit 0 }

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

Write-Host "Parando frontend/funcoes..."
docker @compose stop web functions | Out-Null

Write-Host "Enviando o backup para o container do banco..."
docker cp $Arquivo useerp-db:/tmp/useerp-restore.dump
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao copiar o backup." -ForegroundColor Red; exit 1 }

Write-Host "Restaurando (pg_restore --clean --if-exists)..."
docker @compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/useerp-restore.dump
# pg_restore retorna avisos em objetos que ainda nao existiam: conferir visualmente.

Write-Host "Reaplicando migrations que vieram depois do backup (se houver)..."
docker @compose run --rm migrate

Write-Host "Subindo tudo de novo..."
docker @compose up -d
Write-Host "Restauracao concluida. Abra o sistema e confira os dados."
