# ============================================================================
# USE ERP (local) — cadastra a BIL Importação e Exportação LTDA
#
# Uso:
#   .\cadastrar-bil.ps1
#   .\cadastrar-bil.ps1 -Email etcsuporte889@gmail.com
#   $env:BIL_ADMIN_PASSWORD = '<senha-inicial>'; .\cadastrar-bil.ps1
#
# O script sobe a stack local, reaplica as migrations/ajustes locais e roda
# docker/local/scripts/seed-bil.sql (idempotente): usuário administrador,
# empresa matriz, filial industrial, plano Enterprise com todos os módulos
# (incl. Produção/PCP/WMS) e todas as permissões para o admin.
# ============================================================================
param(
  [string]$Email = "etcsuporte889@gmail.com",
  [SecureString]$Senha
)

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

if (-not $Senha) {
  if ($env:BIL_ADMIN_PASSWORD) {
    $Senha = ConvertTo-SecureString $env:BIL_ADMIN_PASSWORD -AsPlainText -Force
  } else {
    $Senha = Read-Host "Senha inicial do administrador $Email" -AsSecureString
  }
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-bil.sql"

Aviso "Subindo a stack local..."
docker @compose up -d db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao subir os servicos." -ForegroundColor Red; exit 1 }

Aviso "Aplicando migrations e ajustes locais..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  Write-Host "As migrations falharam; corrija o erro acima e rode de novo." -ForegroundColor Red
  exit 1
}

Aviso "Cadastrando a BIL Importação e Exportação LTDA..."
$plain = [System.Net.NetworkCredential]::new("", $Senha).Password
$env:BIL_ADMIN_PASSWORD = $plain
try {
  docker @compose cp $seed "db:/tmp/seed-bil.sql"
  if ($LASTEXITCODE -ne 0) { throw "docker compose cp falhou" }
  docker @compose exec -T -e BIL_ADMIN_PASSWORD db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-bil.sql
  if ($LASTEXITCODE -ne 0) {
    Write-Host "O cadastro da BIL falhou; nenhuma alteracao foi gravada." -ForegroundColor Red
    exit 1
  }
} finally {
  Remove-Item Env:BIL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $plain = $null
}

Ok "BIL cadastrada com acesso total (plano Enterprise, Produção liberada)."
Write-Host "  Login: $Email"
Write-Host "  Abra o endereco local do sistema (ex.: http://localhost:8080) e entre."
Write-Host "  Troque a senha inicial depois do primeiro acesso."
