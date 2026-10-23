# ============================================================================
# USE ERP (local) — prepara o FLUXO COMERCIAL: CATALOGO POR PROCESSO + PEDIDOS ATE A ENTREGA na empresa BIL
#
# Uso:  .\preparar-pedidos-clientes.ps1
#
# Executa docker/local/scripts/seed-catalogo-processos.sql + seed-pedidos-clientes.sql: classifica os
# produtos por processo e executa pedido -> producao -> entrega no WMS.
# Idempotente: rodar de novo não duplica (marcador = pedido PV-INT-004).
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
$seedCatalogo = Join-Path $PSScriptRoot "docker/local/scripts/seed-catalogo-processos.sql"
$seedPedidos = Join-Path $PSScriptRoot "docker/local/scripts/seed-pedidos-clientes.sql"

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

Aviso "Aplicando o catalogo por processo e o fluxo de pedidos ate a entrega..."
docker @compose cp $seedCatalogo "db:/tmp/seed-catalogo-processos.sql"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui copiar o roteiro do catalogo para o banco."; exit 1 }
docker @compose cp $seedPedidos "db:/tmp/seed-pedidos-clientes.sql"
if ($LASTEXITCODE -ne 0) { Falha "Nao consegui copiar o roteiro de pedidos para o banco."; exit 1 }

$ErrorActionPreference = "Continue"
$saidaCat = docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-catalogo-processos.sql 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Falha "A aplicacao do catalogo por processo falhou:"; Write-Host $saidaCat; exit 1 }
Ok "Catalogo por processo aplicado (categorias Fibras/Fios/Tecidos/Malhas/Corantes)."
$saida = docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v "admin_email=$Email" -f /tmp/seed-pedidos-clientes.sql 2>&1 | Out-String
$codigo = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($saida -match "PEDIDOS_JA_PREPARADOS") {
  Ok "O fluxo de pedidos ja estava preparado nesta empresa - nada foi duplicado."
  Write-Host "Abra http://localhost:8080 -> Producao (PCP) -> Central PCP Tecelagem."
  exit 0
}
if ($codigo -ne 0 -or $saida -notmatch "PEDIDOS_FLUXO_OK") {
  Falha "A preparacao do fluxo de pedidos falhou. Saida do banco:"
  Write-Host $saida
  if ($saida -match "Cadeia integrada nao encontrada") {
    Write-Host "Rode antes o PREPARAR-INTEGRACAO.bat (a cadeia produtiva alimenta estas entregas)." -ForegroundColor Yellow
  }
  if ($saida -match "BIL nao encontrada|Administrador .* nao encontrado") {
    Write-Host "Rode antes o CORRIGIR-LOGIN-BIL.bat para cadastrar a BIL." -ForegroundColor Yellow
  }
  exit 1
}

Write-Host $saida
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " FLUXO COMERCIAL PRONTO: PEDIDO -> PRODUCAO -> ENTREGA!"
Write-Host "============================================================"
Write-Host " Abra http://localhost:8080 e confira:"
Write-Host "  - Estoque > Produtos: catalogo por processo (Fibras e Plumas, Fios,"
Write-Host "    Tecidos Planos, Malhas, Corantes e Auxiliares) - no PCP, urdume e"
Write-Host "    trama agora so listam produtos da categoria Fios"
Write-Host "  - Vendas > Pedidos: PV-INT-001 (tecido 300 m), PV-INT-002 (fio 5 kg),"
Write-Host "    PV-INT-003 (malha tingida 80 kg) expedidos; PV-INT-004 tinturaria"
Write-Host "    para terceiro (malha do cliente -> OP na tinturaria -> devolucao)"
Write-Host "  - Estoque > Lotes: TECIDO-INT-LOTE-001 com 85 m, FIO-INT-LOTE-001 com"
Write-Host "    1 kg - cada entrega baixou o lote certo (FIFO por lote liberado)"
Write-Host "============================================================"
