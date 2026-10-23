# ============================================================================
# USE ERP (local) — ATUALIZAÇÃO SEGURA em 1 clique, com verificação e
# rollback automático.
#
#   Uso: .\atualizar-seguro.ps1        (ou pelo ATUALIZAR-SEGURO.bat)
#
# O que faz, nesta ordem:
#   1. Pré-checagem (Docker no ar, .env.local presente);
#   2. Snapshot: backup do banco (backup-local.ps1) + etiqueta da imagem
#      web atual como "useerp/rollback-web:latest";
#   3. Atualiza: aplica migrations (serviço migrate) e reconstrói o web;
#   4. Verifica: containers de pé, /healthz respondendo e a página inicial
#      carregando (HTTP 200) — com tentativas por até ~2 minutos;
#   5. Se algo falhar na verificação: ROLLBACK automático da imagem web
#      para a etiquetada no passo 2 e aviso do backup do banco gerado.
#
# Nada é apagado: banco e volumes não são removidos em nenhum caminho.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }
function Falha($m) { Write-Host "  !!  $m" -ForegroundColor Red }

try { docker version *> $null } catch {
  Falha "Docker nao respondeu. Abra o Docker Desktop, espere ficar pronto e rode de novo."
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Falha ".env.local nao encontrado. Rode primeiro o INSTALAR-TUDO.bat"
  exit 1
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$porta = "8080"
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] }
}

function Fazer-Rollback($motivo) {
  Falha "Verificacao falhou: $motivo"
  Aviso "Fazendo rollback da imagem web para a versao anterior..."
  $imgName = docker inspect -f "{{.Config.Image}}" useerp-web 2>$null
  if ($imgName) {
    docker tag "useerp/rollback-web:latest" $imgName
    docker @compose up -d web | Out-Null
    Ok "Rollback aplicado. O sistema voltou a versao anterior da tela."
  } else {
    Falha "Nao consegui identificar a imagem do web para rollback."
  }
  Falha "O backup do banco desta atualizacao esta na pasta backups\ (restaure com restaurar-local.ps1 se precisar)."
  exit 1
}

# --- 2. Snapshot -----------------------------------------------------------
Aviso "Gerando backup do banco antes de atualizar..."
powershell -NoProfile -ExecutionPolicy Bypass -File ".\backup-local.ps1"
if ($LASTEXITCODE -ne 0) { Falha "Backup falhou - atualizacao abortada (nada foi alterado)."; exit 1 }
Ok "Backup concluido."

$imgId = docker inspect -f "{{.Image}}" useerp-web 2>$null
if ($imgId) {
  docker tag $imgId "useerp/rollback-web:latest"
  Ok "Imagem web atual etiquetada para rollback (useerp/rollback-web:latest)."
} else {
  Alerta "Container web ainda nao existe (primeira instalacao?) - rollback de imagem indisponivel."
}

# --- 3. Atualização ---------------------------------------------------------
Aviso "Aplicando migrations do banco..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) { Fazer-Rollback "o servico de migrations retornou erro" }
Ok "Migrations aplicadas."

Aviso "Reconstruindo o frontend (build no Docker, alguns minutos)..."
docker @compose build web
if ($LASTEXITCODE -ne 0) { Fazer-Rollback "o build do frontend falhou" }
docker @compose up -d web | Out-Null
if ($LASTEXITCODE -ne 0) { Fazer-Rollback "o container web nao subiu" }
Ok "Container web recriado."

# --- 4. Verificação ---------------------------------------------------------
Aviso "Verificando o sistema (ate ~2 minutos)..."
$healthOk = $false
for ($i = 0; $i -lt 40 -and -not $healthOk; $i++) {
  Start-Sleep -Seconds 3
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$porta/healthz" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $healthOk = $true }
  } catch { }
}
if (-not $healthOk) { Fazer-Rollback "http://localhost:$porta/healthz nao respondeu" }
Ok "Healthz respondendo."

$homeOk = $false
for ($j = 0; $j -lt 5 -and -not $homeOk; $j++) {
  if ($j -gt 0) { Start-Sleep -Seconds 3 }
  try {
    $respPagina = Invoke-WebRequest -Uri "http://localhost:$porta/" -UseBasicParsing -TimeoutSec 5
    if ($respPagina.StatusCode -eq 200) { $homeOk = $true }
  } catch { }
}
if (-not $homeOk) { Fazer-Rollback "a pagina inicial nao carregou" }
Ok "Pagina inicial carregando (HTTP 200)."

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " ATUALIZACAO SEGURA CONCLUIDA E VERIFICADA!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Abra http://localhost:$porta e aperte Ctrl+F5."
Write-Host " Backup pre-atualizacao: pasta backups\ | Rollback de imagem:"
Write-Host " tag useerp/rollback-web:latest (automatico em caso de falha)."
Write-Host "============================================================"
