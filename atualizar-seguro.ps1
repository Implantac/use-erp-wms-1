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

# docker version SEM timeout pode travar com o daemon meio-acordado
# (ex.: logo apos reiniciar o PC). Job com 25s e instrucao clara.
$dockerJob = Start-Job -ScriptBlock { docker version 2>&1 | Out-String }
$dockerPronto = Wait-Job $dockerJob -Timeout 25
$dockerSaida = if ($dockerJob.State -eq 'Completed') { Receive-Job $dockerJob } else { '' }
Remove-Job $dockerJob -Force -ErrorAction SilentlyContinue
if (-not $dockerPronto -or $dockerSaida -notmatch 'Server') {
  Falha "Docker nao respondeu em 25s. Abra o Docker Desktop, espere o icone ficar verde/fixo (pode levar 1-2 min apos ligar o PC) e rode de novo. Nada foi alterado."
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Falha ".env.local nao encontrado. Rode primeiro o INSTALAR-TUDO.bat"
  exit 1
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

# --- Build do frontend: preflight de imagens-base + atalho sem mudanca -----
# As imagens-base (oven/bun, nginx) sao baixadas uma unica vez. Se faltarem
# e nao houver internet/DNS, abortamos ANTES de trocar qualquer coisa, com
# instrucao clara — em vez do erro cru do BuildKit.
function Preparar-BuildWeb {
  # PS 5.1 + ErrorActionPreference=Stop transforma stderr de comando nativo
  # em erro fatal mesmo com redirecionamento; relaxar so neste trecho.
  $eapAntes = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $erro = $null
  foreach ($base in @("oven/bun:1.4.2", "nginx:1.27-alpine")) {
    docker image inspect $base 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  Baixando imagem-base $base (primeira vez ou cache limpo)..."
      docker pull $base
      if ($LASTEXITCODE -ne 0) {
        $erro = "sem conexao com o Docker Hub ao baixar $base (DNS/internet). Conecte-se a internet e rode de novo."
        break
      }
    }
  }
  $ErrorActionPreference = $eapAntes
  return $erro
}

# Impressao digital das fontes do frontend: se nada mudou desde o ultimo
# build bem-sucedido, o build (que exige as imagens-base) e pulado.
function Get-WebFingerprint {
  $arquivos = @()
  foreach ($dir in @("src", "public", "docker/local")) {
    if (Test-Path $dir) {
      $arquivos += Get-ChildItem $dir -Recurse -File | Where-Object { $_.FullName -notmatch "node_modules" }
    }
  }
  foreach ($f in @("index.html", "package.json", "bun.lock", "Dockerfile.local", "vite.config.ts", "vite.config.js", "postcss.config.js", "tailwind.config.ts", "tailwind.config.js")) {
    if (Test-Path $f) { $arquivos += Get-Item $f }
  }
  $linhas = $arquivos | Sort-Object FullName | ForEach-Object {
    "$($_.FullName.Substring($PSScriptRoot.Length)):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($linhas -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "")
}

function Build-WebNecessario {
  $stampPath = Join-Path $PSScriptRoot ".web-build-stamp"
  $eapAntes = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $ErrorActionPreference = "Continue"
$imgId = docker inspect -f "{{.Image}}" useerp-web 2>$null
$ErrorActionPreference = "Stop"
  $ErrorActionPreference = $eapAntes
  if (-not $imgId) { return $true }
  if (-not (Test-Path $stampPath)) { return $true }
  return ((Get-Content $stampPath -Raw).Trim() -ne (Get-WebFingerprint))
}

function Marcar-WebBuildOk {
  (Get-WebFingerprint) | Set-Content (Join-Path $PSScriptRoot ".web-build-stamp") -Encoding ASCII
}

$porta = "8080"
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] }
}

function Fazer-Rollback($motivo) {
  Falha "Verificacao falhou: $motivo"
  Aviso "Fazendo rollback da imagem web para a versao anterior..."
  $ErrorActionPreference = "Continue"
  $imgName = docker inspect -f "{{.Config.Image}}" useerp-web 2>$null
  $ErrorActionPreference = "Stop"
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

$ErrorActionPreference = "Continue"
$imgId = docker inspect -f "{{.Image}}" useerp-web 2>$null
$ErrorActionPreference = "Stop"
if ($imgId) {
  docker tag $imgId "useerp/rollback-web:latest"
  Ok "Imagem web atual etiquetada para rollback (useerp/rollback-web:latest)."
} else {
  Write-Host "  (Container web ainda nao existe - primeira instalacao? Rollback de imagem indisponivel.)" -ForegroundColor Yellow
}

# --- 3. Atualização ---------------------------------------------------------
Aviso "Aplicando migrations do banco..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) { Fazer-Rollback "o servico de migrations retornou erro" }
Ok "Migrations aplicadas."

if (Build-WebNecessario) {
  $erroBase = Preparar-BuildWeb
  if ($erroBase) { Fazer-Rollback $erroBase }
  Aviso "Reconstruindo o frontend (build no Docker, alguns minutos)..."
  docker @compose build web
  if ($LASTEXITCODE -ne 0) { Fazer-Rollback "o build do frontend falhou" }
  Marcar-WebBuildOk
} else {
  Ok "Fontes do frontend sem mudancas desde o ultimo build - build pulado (sem precisar de internet)."
}
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
