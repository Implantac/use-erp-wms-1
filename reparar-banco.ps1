# ============================================================================
# USE ERP (local) — REPARO do banco cuja inicializacao foi abortada
#
# Uso: .\reparar-banco.ps1   (ou duplo clique em REPARAR-BANCO.bat)
#
# Sem apagar nada:
#   1. Cria os papeis internos do Supabase que faltam (repair-roles.sql);
#   2. Reinicia auth/storage/rest/realtime e espera o auth criar auth.users;
#   3. Aplica as 459 migrations em primeiro plano (servico migrate);
#   4. Sobe a stack inteira.
# Depois: CORRIGIR-LOGIN-BIL.bat e PREPARAR-FLUXO-TESTE.bat.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Falha($msg) { Write-Host "  !!  $msg" -ForegroundColor Red }

try { docker version *> $null } catch { Falha "Docker nao respondeu. Abra o Docker Desktop e rode de novo."; exit 1 }
if (-not (Test-Path ".env.local")) { Falha ".env.local nao encontrado. Rode primeiro o INSTALAR-TUDO.bat"; exit 1 }

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$repair = Join-Path $PSScriptRoot "docker/local/scripts/repair-roles.sql"

Aviso "Subindo o banco..."
docker @compose up -d db | Out-Null
for ($i = 0; $i -lt 30; $i++) {
  docker @compose exec -T db pg_isready -U supabase_admin *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}

Aviso "Criando os papeis internos que faltam (sem apagar nada)..."
docker @compose cp $repair "db:/tmp/repair-roles.sql"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui copiar o roteiro de reparo."; exit 1 }
docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/repair-roles.sql
if ($LASTEXITCODE -ne 0) { Falha "O reparo dos papeis falhou - veja o erro acima."; exit 1 }
Ok "Papeis internos presentes e senhas alinhadas ao .env.local."

Aviso "Reiniciando auth/storage/rest/realtime e aguardando o auth criar suas tabelas..."
docker @compose up -d --force-recreate auth storage rest realtime | Out-Null
$ErrorActionPreference = "Continue"
$authOk = $false
for ($i = 0; $i -lt 36; $i++) {
  $r = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c "SELECT to_regclass('auth.users') IS NOT NULL;" 2>$null
  if ("$r".Trim() -eq "t") { $authOk = $true; break }
  Write-Host "  aguardando o servico de autenticacao... ($([int](($i + 1) * 5))s)"
  Start-Sleep -Seconds 5
}
$ErrorActionPreference = "Stop"
if (-not $authOk) {
  Falha "O auth nao criou as tabelas. Diagnostico:"
  docker @compose logs --tail 30 auth
  exit 1
}
Ok "Servico de autenticacao operante (auth.users existe)."

Aviso "Aplicando as 459 migrations (etapa longa, em primeiro plano)..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  Falha "Uma migration falhou - me envie a mensagem acima (nome da migration e erro)."
  exit 1
}
Ok "Migrations aplicadas."

Aviso "Subindo a stack inteira..."
docker @compose up -d | Out-Null

# O PostgREST precisa reler o esquema ja com graphql_public criado; o
# restart garante a recarga imediata do cache (sem depender do NOTIFY).
Aviso "Reiniciando a API (PostgREST) para recarregar o esquema..."
docker @compose restart rest | Out-Null
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " BANCO REPARADO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Proximos passos:"
Write-Host "   1) CORRIGIR-LOGIN-BIL.bat  (cadastra a BIL e testa o login)"
Write-Host "   2) PREPARAR-FLUXO-TESTE.bat (preenche o fluxo textil)"
Write-Host "   3) http://localhost:8080"
Write-Host "============================================================"
