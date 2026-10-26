# ============================================================================
# USE ERP (local) — roda a jornada E2E das lojas contra a instalação local.
#   Uso: .\testar-e2e.ps1   (ou TESTAR-E2E.bat)
# Pré-requisitos: stack no ar (INICIAR-SISTEMA), seeds aplicados
# (PREPARAR-GRUPO-ZIPO / PREPARAR-LOJAS-TEXAS) e o arquivo .env.e2e
# preenchido (modelo em docs/E2E-Lojas.md). Sem .env.e2e o teste é
# ignorado com aviso — nunca falha "do nada".
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Falha($m) { Write-Host "  !!  $m" -ForegroundColor Red }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }

try {
  $health = Invoke-WebRequest -Uri "http://localhost:8080/healthz" -UseBasicParsing -TimeoutSec 3
  if ($health.StatusCode -ne 200) { throw "healthz" }
} catch {
  Falha "A instalacao local nao esta respondendo em http://localhost:8080 — rode o INICIAR-SISTEMA.bat antes."
  exit 1
}
Ok "Instalacao local respondendo."

if (-not (Test-Path ".env.e2e")) {
  Falha ".env.e2e nao encontrado. Copie o modelo de docs/E2E-Lojas.md, preencha e rode de novo."
  exit 1
}
foreach ($linha in Get-Content ".env.e2e") {
  if ($linha -match "^\s*([^#=]+)=(.*)$") {
    [Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
  }
}
Ok "Variaveis do .env.e2e carregadas."

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias (bun install)..."
  bun install --frozen-lockfile
}
Write-Host "Garantindo o navegador do Playwright (primeira vez demora)..."
bun x playwright install chromium | Out-Null

Write-Host "`nRodando a jornada E2E das lojas..."
bun x playwright test --config=e2e/playwright.config.ts tests/e2e/store-journey.spec.ts tests/e2e/store-journey-ui.spec.ts --project=chromium --reporter=list
if ($LASTEXITCODE -ne 0) {
  Falha "A jornada E2E falhou — veja as linhas acima (a mensagem indica a etapa)."
  exit 1
}
Ok "JORNADA E2E DAS Lojas APROVADA (pedido -> decisao -> expedicao -> recebimento com divergencia)."
