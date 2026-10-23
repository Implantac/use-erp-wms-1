# ============================================================================
# USE ERP (local) — prepara o TESTE DE TECELAGEM PLANA na empresa BIL
#
# Uso:  .\preparar-tecelagem-teste.ps1
#
# Executa docker/local/scripts/seed-tecelagem-teste.sql: artigo de tecido plano
# com ficha (urdume+trama), lotes de fio, OP de tecelagem com perfil do
# tear executada pelas RPCs reais e o tecido cru final em estoque.
# Idempotente: rodar de novo não duplica (marcador = lote de tecido).
# Pré-requisito: BIL cadastrada (CORRIGIR-LOGIN-BIL.bat).
# ============================================================================
param(
  [string]$Email = "etcsuporte889@gmail.com"
)

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
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-tecelagem-teste.sql"

Aviso "Subindo a stack local..."
docker @compose up -d | Out-Null
if ($LASTEXITCODE -ne 0) { Falha "Falha ao subir a stack."; exit 1 }

# Pre-conferencia com ESPERA: o servico migrate aplica as 460 migrations em
# segundo plano (leva minutos). Esperamos a condicao real, com progresso.
Aviso "Aguardando o banco receber todas as migrations (pode levar minutos)..."
$ErrorActionPreference = "Continue"
$pronto = $false
for ($i = 0; $i -lt 60; $i++) {
  $estado = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c "SELECT (to_regclass('public.companies') IS NOT NULL)::int || '|' || (SELECT count(*) FROM supabase_migrations.schema_migrations);" 2>$null
  $partes = "$estado".Trim() -split "\|"
  if ($partes.Count -ge 2 -and $partes[0].Trim() -eq "1" -and [int]$partes[1] -ge 450) {
    $pronto = $true
    Ok "Banco completo ($($partes[1]) migrations aplicadas)."
    break
  }
  $n = if ($partes.Count -ge 2) { $partes[1] } else { "0" }
  Write-Host "  aguardando migrations... ($n/460 aplicadas, $([int](($i + 1) * 10))s)"
  Start-Sleep -Seconds 10
}
$ErrorActionPreference = "Stop"
if (-not $pronto) {
  Falha "As migrations nao completaram em 10 minutos."
  Write-Host "  Rode o INSTALAR-TUDO.bat e observe a etapa das migrations ate o fim."
  Write-Host "  Se alguma migration falhar, me envie a mensagem dela."
  Write-Host "  Diagnostico completo: DIAGNOSTICO-SISTEMA.bat (gera diagnostico.txt)."
  exit 1
}

Aviso "Preparando o teste de tecelagem (fio urdume/trama -> tear -> tecido cru em estoque)..."
docker @compose cp $seed "db:/tmp/seed-tecelagem-teste.sql"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui copiar o roteiro de teste para o banco."; exit 1 }

$ErrorActionPreference = "Continue"
$saida = docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-tecelagem-teste.sql 2>&1 | Out-String
$codigo = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($saida -match "TECELAGEM_JA_PREPARADA") {
  Ok "O teste de tecelagem ja estava preparado nesta empresa - nada foi duplicado."
  Write-Host "Abra http://localhost:8080 -> Producao (PCP) -> Central PCP Tecelagem."
  exit 0
}
if ($codigo -ne 0 -or $saida -notmatch "TECELAGEM_TESTE_OK") {
  Falha "A preparacao do teste de tecelagem falhou. Saida do banco:"
  Write-Host $saida
  if ($saida -match "BIL nao encontrada|Administrador .* nao encontrado") {
    Write-Host "Rode antes o CORRIGIR-LOGIN-BIL.bat para cadastrar a BIL." -ForegroundColor Yellow
  }
  exit 1
}

Write-Host $saida
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " TESTE DE TECELAGEM PRONTO!"
Write-Host "============================================================"
Write-Host " Abra http://localhost:8080 -> Producao (PCP) -> Central PCP Tecelagem e confira:"
Write-Host "  - OP de tecelagem concluida (480 m de tecido plano cru)"
Write-Host "  - Perfil do tear: rolo de urdume, pente, batidas/cm, largura e metragem"
Write-Host "  - Eventos do tear: setup, quebra de urdume (12 min) e de trama (7 min)"
Write-Host "  - Estoque: lote TECIDO-LOTE-TESTE-001 com 480 m; fios restantes"
Write-Host "    urdume 12,5 kg e trama 10 kg; genealogia fio -> tecido (2 arestas)"
Write-Host "============================================================"
