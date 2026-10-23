# ============================================================================
# USE ERP (local) — cadastra o grupo Zipo Confecções + TEXAS FARM STORE
#
# Uso:
#   .\preparar-grupo-zipo.ps1
#   .\preparar-grupo-zipo.ps1 -Email etcsuporte889@gmail.com
#   $env:ZIPO_ADMIN_PASSWORD = '<senha>'; .\preparar-grupo-zipo.ps1
#
# Sobe a stack, aplica as migrations (incl. IE e papel por empresa) e roda
# docker/local/scripts/seed-grupo-zipo.sql (idempotente): indústria Zipo
# (confecção), Loja Texas Farm Store do grupo, etcsuporte superadmin das
# duas, nicho Confecção aplicado e estoque/políticas para testar o fluxo
# operacional do controle de lojas.
#
# ATENÇÃO: se o usuário já existe (ex.: admin da BIL), a senha digitada aqui
# passa a ser a senha dele — use a MESMA senha do seu login atual.
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
  if ($env:ZIPO_ADMIN_PASSWORD) {
    $Senha = ConvertTo-SecureString $env:ZIPO_ADMIN_PASSWORD -AsPlainText -Force
  } else {
    Write-Host "Use a MESMA senha do login atual de $Email (ela sera reaplicada)." -ForegroundColor Yellow
    $Senha = Read-Host "Senha do administrador $Email" -AsSecureString
  }
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-grupo-zipo.sql"

Aviso "Subindo a stack local..."
docker @compose up -d db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao subir os servicos." -ForegroundColor Red; exit 1 }

Aviso "Aplicando migrations e ajustes locais..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  Write-Host "As migrations falharam; corrija o erro acima e rode de novo." -ForegroundColor Red
  exit 1
}

Aviso "Cadastrando o grupo Zipo Confecções + TEXAS FARM STORE..."
$plain = [System.Net.NetworkCredential]::new("", $Senha).Password
$env:ZIPO_ADMIN_PASSWORD = $plain
try {
  docker @compose cp $seed "db:/tmp/seed-grupo-zipo.sql"
  if ($LASTEXITCODE -ne 0) { throw "docker compose cp falhou" }
  docker @compose exec -T -e ZIPO_ADMIN_PASSWORD db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-grupo-zipo.sql
  if ($LASTEXITCODE -ne 0) {
    Write-Host "O cadastro do grupo falhou; nenhuma alteracao foi gravada." -ForegroundColor Red
    exit 1
  }
} finally {
  Remove-Item Env:ZIPO_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $plain = $null
}

Ok "Grupo cadastrado: Zipo Confecções (indústria) + TEXAS FARM STORE (Loja)."
Write-Host "  Login: $Email"
Write-Host "  Abra http://localhost:8080, entre e troque a empresa no seletor:"
Write-Host "   - TEXAS FARM STORE: Central da Loja (Loja abaixo do minimo; solicite reposicao);"
Write-Host "   - Zipo Confecções: aprove na fila de decisão e veja o estoque do grupo."
