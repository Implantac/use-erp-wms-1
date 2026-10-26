# ============================================================================
# USE ERP (local) — dia operacional das Lojas (popula TODAS as telas)
# Uso: .\preparar-operacao-lojas.ps1
# Rode DEPOIS de PREPARAR-LOJAS-TEXAS.bat. Idempotente (marcador SEED-OP).
# Cria transferências em cada etapa, divergência, histórico pelo ledger,
# solicitação de abastecimento pendente, pedido à fábrica e alertas.
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
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-operacao-lojas.sql"

Aviso "Subindo a stack local..."
docker @compose up -d db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao subir os servicos." -ForegroundColor Red; exit 1 }

Aviso "Aplicando migrations e ajustes locais..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) { Write-Host "As migrations falharam; corrija o erro acima e rode de novo." -ForegroundColor Red; exit 1 }

Aviso "Populando o dia operacional das lojas..."
docker @compose cp $seed "db:/tmp/seed-operacao-lojas.sql"
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao copiar o cadastro." -ForegroundColor Red; exit 1 }
docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/seed-operacao-lojas.sql
if ($LASTEXITCODE -ne 0) { Write-Host "A populacao falhou; nenhuma alteracao foi gravada." -ForegroundColor Red; exit 1 }

Ok "Telas populadas. Abra http://localhost:8080 (Ctrl+F5):"
Write-Host "   - Central de Abastecimento: fluxo com separacao, transito, divergencia e historico;"
Write-Host "   - Central da Loja (TEXAS > Loja): alertas, recomendacoes e analise de abastecimento;"
Write-Host "   - Operacao da Loja: solicitacoes, recebimentos e transferencias vivas."
