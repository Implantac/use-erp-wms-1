# ============================================================================
# USE ERP (local) — VERIFICAÇÃO de instalação (máquina limpa ou atual)
#   Uso: .\verificar-instalacao.ps1   (ou VERIFICAR-INSTALACAO.bat)
# Não altera nada: só verifica e imprime PASSOU/FALHOU por item.
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$passou = 0; $falhou = 0
function Check($nome, $ok, $detalhe = "") {
  if ($ok) { Write-Host "  PASSOU  $nome" -ForegroundColor Green; $script:passou++ }
  else { Write-Host "  FALHOU  $nome $detalhe" -ForegroundColor Red; $script:falhou++ }
}

Write-Host "== USE ERP - verificacao da instalacao`n"

try { docker version *> $null; Check "Docker respondendo" $true } catch { Check "Docker respondendo" $false "(abra o Docker Desktop)" }

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$ps = docker @compose ps --format "{{.Name}} {{.State}}" 2>$null
$esperados = @("useerp-db", "useerp-auth", "useerp-rest", "useerp-web", "useerp-storage", "useerp-functions")
foreach ($nome in $esperados) {
  Check "Container $nome rodando" ([bool]($ps -match "$nome running"))
}

$porta = "8080"
foreach ($linha in Get-Content ".env.local") { if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] } }

try {
  $r = Invoke-WebRequest -Uri "http://localhost:$porta/healthz" -UseBasicParsing -TimeoutSec 5
  Check "Healthz da aplicacao" ($r.StatusCode -eq 200)
} catch { Check "Healthz da aplicacao" $false }
try {
  $r = Invoke-WebRequest -Uri "http://localhost:$porta/" -UseBasicParsing -TimeoutSec 5
  Check "Pagina inicial (HTTP 200)" ($r.StatusCode -eq 200 -and $r.Content -match "<div id=.root.")
} catch { Check "Pagina inicial (HTTP 200)" $false }

$mig = docker @compose exec -T db psql -U postgres -d postgres -tAc "SELECT count(*) FROM supabase_migrations.schema_migrations" 2>$null
Check "Migrations aplicadas (>= 479)" ([int]($mig | Out-String).Trim() -ge 479) "(encontradas: $mig)"
$emp = docker @compose exec -T db psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.companies" 2>$null
Check "Empresas cadastradas (>= 1)" ([int]($emp | Out-String).Trim() -ge 1) "(encontradas: $emp)"
$usr = docker @compose exec -T db psql -U postgres -d postgres -tAc "SELECT count(*) FROM auth.users" 2>$null
Check "Usuarios criados (>= 1)" ([int]($usr | Out-String).Trim() -ge 1) "(encontrados: $usr)"

Write-Host "`n============================================================"
Write-Host " RESULTADO: $passou passaram, $falhou falharam"
if ($falhou -eq 0) {
  Write-Host " INSTALACAO SAUDAVEL. Abra http://localhost:$porta" -ForegroundColor Green
} else {
  Write-Host " Veja os itens FALHOU acima; o DIAGNOSTICO-SISTEMA.bat ajuda." -ForegroundColor Yellow
}
Write-Host "============================================================"
if ($falhou -gt 0) { exit 1 }
