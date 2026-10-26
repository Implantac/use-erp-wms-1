# ============================================================================
# USE ERP (local) — prepara o TESTE INTEGRADO DOS 4 SETORES na empresa BIL
#
# Uso:  .\preparar-integracao-setores.ps1
#
# Executa docker/local/scripts/seed-integracao-setores.sql: cadeia pluma -> fio -> tecido/malha ->
# tingimento, uma OP por setor executada pelas RPCs reais.
# Idempotente: rodar de novo não duplica (marcador = lote tingido).
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
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-integracao-setores.sql"

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

Aviso "Preparando a cadeia integrada (pluma -> fio -> tecido/malha -> tingimento)..."
docker @compose cp $seed "db:/tmp/seed-integracao-setores.sql"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui copiar o roteiro de teste para o banco."; exit 1 }

$ErrorActionPreference = "Continue"
$saida = docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-integracao-setores.sql 2>&1 | Out-String
$codigo = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($saida -match "INTEGRACAO_JA_PREPARADA") {
  Ok "A cadeia integrada ja estava preparada nesta empresa - nada foi duplicado."
  Write-Host "Abra http://localhost:8080 -> Producao (PCP) -> Central PCP Tecelagem."
  exit 0
}
if ($codigo -ne 0 -or $saida -notmatch "INTEGRACAO_SETORES_OK") {
  Falha "A preparacao da cadeia integrada falhou. Saida do banco:"
  Write-Host $saida
  if ($saida -match "BIL nao encontrada|Administrador .* nao encontrado") {
    Write-Host "Rode antes o CORRIGIR-LOGIN-BIL.bat para cadastrar a BIL." -ForegroundColor Yellow
  }
  exit 1
}

Write-Host $saida
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " CADEIA INTEGRADA DOS 4 SETORES PRONTA!"
Write-Host "============================================================"
Write-Host " Abra http://localhost:8080 e confira uma OP concluida em CADA central:"
Write-Host "  - Central PCP Fiacao:     OP de fio 30/1 (195 kg; perfil titulo/torcao;"
Write-Host "    eventos de tirada e ruptura classificada como Material)"
Write-Host "  - Central PCP Tecelagem:  OP de tecido plano (385 m; rolo ROLO-INT-001;"
Write-Host "    quebra de urdume classificada, causa confirmada)"
Write-Host "  - Central PCP Malharia:   OP de malha crua (97 kg; finura E28;"
Write-Host "    quebra classificada como Maquina)"
Write-Host "  - Central PCP Tinturaria: OP tingida Azul Royal (95 kg; banho 1:8, Lab;"
Write-Host "    retencao de cor classificada como Laboratorio, em investigacao)"
Write-Host "  - Cartao de indicadores de cada central com numeros reais da cadeia;"
Write-Host "    genealogia fio -> tecido/malha -> tingido (5 arestas entre setores)"
Write-Host "============================================================"
