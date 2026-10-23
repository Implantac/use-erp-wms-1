# ============================================================================
# USE ERP (local) — reconstrói a imagem do frontend (web) e a recria.
#
# Uso: .\atualizar-web.ps1
#
# Necessário quando muda código em src/ ou docker/local/nginx.conf.
# O build roda dentro do Docker (bun + Vite); leva alguns minutos e NÃO
# apaga dados (banco e volumes não são tocados).
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Falha($msg) { Write-Host "  !!  $msg" -ForegroundColor Red }

try { docker version *> $null } catch {
  Falha "Docker nao respondeu. Abra o Docker Desktop, espere ficar pronto e rode de novo."
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Falha ".env.local nao encontrado. Rode primeiro o INSTALAR-TUDO.bat"
  exit 1
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

Aviso "Reconstruindo o frontend (build dentro do Docker, alguns minutos)..."
docker @compose build web
if ($LASTEXITCODE -ne 0) { Falha "O build do frontend falhou - me envie as ultimas linhas acima."; exit 1 }
Ok "Build concluido."

Aviso "Recriando o container web com a nova imagem..."
docker @compose up -d web | Out-Null
if ($LASTEXITCODE -ne 0) { Falha "Falha ao recriar o web."; exit 1 }
Start-Sleep -Seconds 5

$porta = "8080"
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " FRONTEND ATUALIZADO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Abra http://localhost:$porta e aperte Ctrl+F5 (recarregar sem cache)."
Write-Host "============================================================"
