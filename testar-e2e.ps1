# E2E transacional: somente em ambiente isolado de homologacao.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
function Falha($m) { Write-Host "  ERRO: $m" -ForegroundColor Red }

Write-Host "ATENCAO: este teste cria solicitacao e transferencia e ALTERA saldos de estoque."
Write-Host "Use apenas uma instalacao e banco isolados de HOMOLOGACAO, nunca a operacao real."
$confirmacao = Read-Host "Confirme que o ambiente e isolado digitando HOMOLOGACAO"
if ($confirmacao -cne "HOMOLOGACAO") { Falha "Execucao cancelada."; exit 1 }
if (-not (Test-Path ".env.e2e")) {
  Falha "Falta .env.e2e. Configure manualmente conforme docs/E2E-Lojas.md. Nenhum seed sera executado automaticamente."
  exit 1
}
foreach ($linha in Get-Content ".env.e2e") {
  if ($linha -match '^\s*([^#=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
  }
}
$necessarias = @('VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','E2E_STORE_EMAIL','E2E_STORE_PASSWORD','E2E_MANAGER_EMAIL','E2E_MANAGER_PASSWORD','E2E_PRODUCT_ID','E2E_STORE_BRANCH_ID','E2E_CD_BRANCH_ID')
$faltantes = @($necessarias | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process')) })
if ($faltantes.Count -gt 0) { Falha ("Variaveis ausentes: " + ($faltantes -join ', ')); exit 1 }
if (-not $env:E2E_BASE_URL) { $env:E2E_BASE_URL = 'http://localhost:8080' }
try {
  $health = Invoke-WebRequest -Uri ($env:E2E_BASE_URL.TrimEnd('/') + '/healthz') -UseBasicParsing -TimeoutSec 5
  if ($health.StatusCode -ne 200) { throw 'healthz' }
} catch { Falha "A instalacao indicada por E2E_BASE_URL nao responde em /healthz."; exit 1 }
if (-not (Test-Path 'node_modules')) {
  bun install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { Falha 'Instalacao de dependencias falhou.'; exit 1 }
}
bun x playwright install chromium
if ($LASTEXITCODE -ne 0) { Falha 'Instalacao do Chromium falhou.'; exit 1 }
$env:E2E_REQUIRE_ALL = '1'
Write-Host 'Rodando smoke de interface e jornada transacional por API...'
bun x playwright test --config=e2e/playwright.config.ts tests/e2e/store-journey.spec.ts tests/e2e/store-journey-ui.spec.ts --project=chromium --workers=1
if ($LASTEXITCODE -ne 0) { Falha 'Teste falhou ou foi ignorado. Consulte a saida.'; exit 1 }
Write-Host 'APROVADO: smoke de interface e jornada por API (nao e jornada completa por cliques).' -ForegroundColor Green
