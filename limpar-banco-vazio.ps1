# ============================================================================
# USE ERP (local) — descarta os volumes SOMENTE se o banco estiver vazio
#
# Usado pelo REINSTALAR-DO-ZERO.bat quando a primeira inicializacao do
# PostgreSQL foi interrompida (papeis internos do Supabase inexistentes,
# nenhuma migration aplicada). TRAVA DE SEGURANCA: se houver qualquer
# migration aplicada, empresa cadastrada ou usuario criado, ele ABORTA
# sem apagar nada.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Falha($msg) { Write-Host "  !!  $msg" -ForegroundColor Red }

try { docker version *> $null } catch { Falha "Docker nao respondeu."; exit 1 }
if (-not (Test-Path ".env.local")) { Falha ".env.local nao encontrado."; exit 1 }

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

Write-Host "==> Garantindo o banco no ar para conferir o conteudo..."
docker @compose up -d db | Out-Null
for ($i = 0; $i -lt 30; $i++) {
  docker @compose exec -T db pg_isready -U supabase_admin *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}

$ErrorActionPreference = "Continue"
function Consulta($sql) {
  $r = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c $sql 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return "$r".Trim()
}

$migrations = Consulta "SELECT count(*) FROM supabase_migrations.schema_migrations;"
$empresas = $null
if (Consulta "SELECT to_regclass('public.companies') IS NOT NULL;") {
  $t = Consulta "SELECT to_regclass('public.companies') IS NOT NULL;"
  if ($t -eq "t") { $empresas = Consulta "SELECT count(*) FROM public.companies;" }
}
$usuarios = $null
$tAuth = Consulta "SELECT to_regclass('auth.users') IS NOT NULL;"
if ($tAuth -eq "t") { $usuarios = Consulta "SELECT count(*) FROM auth.users;" }
$ErrorActionPreference = "Stop"

Write-Host "    migrations aplicadas : $(if ($null -eq $migrations) { 'nenhuma (controle inexistente)' } else { $migrations })"
Write-Host "    empresas cadastradas : $(if ($null -eq $empresas) { 'tabela inexistente' } else { $empresas })"
Write-Host "    usuarios criados     : $(if ($null -eq $usuarios) { 'tabela inexistente' } else { $usuarios })"

$temDados = ($null -ne $migrations -and [int]$migrations -gt 0) -or
            ($null -ne $empresas -and [int]$empresas -gt 0) -or
            ($null -ne $usuarios -and [int]$usuarios -gt 0)
if ($temDados) {
  Falha "Este banco TEM dados - NAO vou apagar nada."
  Falha "Pare e me envie esta tela; a reinstalacao do zero nao se aplica."
  exit 1
}

Write-Host "==> Banco vazio confirmado. Descartando os volumes quebrados..."
docker @compose down -v
if ($LASTEXITCODE -ne 0) { Falha "Falha ao descartar os volumes."; exit 1 }
Write-Host "  OK  Volumes descartados. A proxima subida inicializa o banco por completo."
exit 0
