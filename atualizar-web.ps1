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
  $imgId = docker inspect -f "{{.Image}}" useerp-web 2>$null
  $ErrorActionPreference = $eapAntes
  if (-not $imgId) { return $true }
  if (-not (Test-Path $stampPath)) { return $true }
  return ((Get-Content $stampPath -Raw).Trim() -ne (Get-WebFingerprint))
}

function Marcar-WebBuildOk {
  (Get-WebFingerprint) | Set-Content (Join-Path $PSScriptRoot ".web-build-stamp") -Encoding ASCII
}


if (Build-WebNecessario) {
  $erroBase = Preparar-BuildWeb
  if ($erroBase) { Falha $erroBase; Falha "Nada foi alterado. Conecte-se e rode o ATUALIZAR-WEB.bat de novo."; exit 1 }
  Aviso "Reconstruindo o frontend (build dentro do Docker, alguns minutos)..."
  docker @compose build web
  if ($LASTEXITCODE -ne 0) { Falha "O build do frontend falhou - me envie as ultimas linhas acima."; exit 1 }
  Marcar-WebBuildOk
  Ok "Build concluido."
} else {
  Ok "Fontes do frontend sem mudancas desde o ultimo build - build pulado (sem precisar de internet)."
}

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
