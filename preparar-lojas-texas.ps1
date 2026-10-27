# ============================================================================
# USE ERP (local) — catálogo Texas Farm com fotos + Loja 2 + saldos de teste
#
# Uso:  .\preparar-lojas-texas.ps1
#
# Rode DEPOIS de PREPARAR-GRUPO-ZIPO.bat. Sobe a stack, aplica migrations e
# roda docker/local/scripts/seed-lojas-texas.sql (idempotente): 10 produtos
# reais do site texasfarmstore.com.br com foto e preço, filial Loja 2 e os
# saldos para testar reposição (CD->Loja), remessa da fábrica e remanejo
# entre lojas. Não precisa de senha: não mexe em usuários.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop, espere ficar verde e rode de novo." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".env.local")) {
  Write-Host ".env.local nao encontrado. Rode primeiro .\instalar-local.ps1" -ForegroundColor Red
  exit 1
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-lojas-texas.sql"

Aviso "Subindo a stack local..."
docker @compose up -d db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao subir os servicos." -ForegroundColor Red; exit 1 }

Aviso "Aplicando migrations e ajustes locais..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  Write-Host "As migrations falharam; corrija o erro acima e rode de novo." -ForegroundColor Red
  exit 1
}

Aviso "Cadastrando catalogo Texas Farm, Loja 2 e saldos de teste..."
docker @compose cp $seed "db:/tmp/seed-lojas-texas.sql"
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao copiar o cadastro." -ForegroundColor Red; exit 1 }
docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/seed-lojas-texas.sql
if ($LASTEXITCODE -ne 0) {
  Write-Host "O cadastro falhou; nenhuma alteracao foi gravada." -ForegroundColor Red
  exit 1
}

Ok "Catalogo Texas Farm pronto (10 produtos com fotos) + filial Loja 2."
Write-Host "  Abra http://localhost:8080 e teste:"
Write-Host "   - TEXAS FARM STORE > Central da Loja: Loja abaixo do minimo pede reposicao;"
Write-Host "   - remanejo: CM639 zerada na Loja 1 e com 45 un paradas na Loja 2;"
Write-Host "   - Zipo Confecções: estoque do grupo (separado/consolidado) e fila de decisão."
