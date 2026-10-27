# ============================================================================
# USE ERP (local) — prepara a jornada E2E das lojas e GERA o .env.e2e
#
# Uso:  .\preparar-e2e-lojas.ps1   (ou PREPARAR-E2E-Lojas.bat)
#
# Rode DEPOIS de PREPARAR-GRUPO-ZIPO.bat e PREPARAR-LOJAS-TEXAS.bat.
# Cria os usuários de homologação (seed-e2e-lojas.sql, idempotente),
# descobre produto com saldo no CD + unidades e escreve o .env.e2e
# pronto. Depois é só rodar TESTAR-E2E.bat. Senhas de teste LOCAIS:
#   loja@texasfarm.example.com  / E2eLoja@2026
#   gestor@zipo.example.com / E2eGestor@2026
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Falha($msg) { Write-Host "  !!  $msg" -ForegroundColor Red }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop, espere ficar verde e rode de novo." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Falha ".env.local nao encontrado. Rode primeiro .\instalar-local.ps1"
  exit 1
}

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$seed = Join-Path $PSScriptRoot "docker/local/scripts/seed-e2e-lojas.sql"

Aviso "Subindo a stack local..."
docker @compose up -d db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Falha "Falha ao subir os servicos."; exit 1 }

Aviso "Aplicando migrations e ajustes locais..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) { Falha "As migrations falharam; corrija o erro acima e rode de novo."; exit 1 }

Aviso "Criando usuarios de homologacao E2E..."
docker @compose cp $seed "db:/tmp/seed-e2e-lojas.sql"
if ($LASTEXITCODE -ne 0) { Falha "Falha ao copiar a seed."; exit 1 }
docker @compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/seed-e2e-lojas.sql
if ($LASTEXITCODE -ne 0) { Falha "A seed E2E falhou; veja a mensagem acima (pre-requisitos do grupo)."; exit 1 }
Ok "Usuarios E2E prontos (Loja + gestor)."

Aviso "Descobrindo produto com saldo no CD e unidades..."
$sqlIds = @"
SELECT 'PRODUCT=' || p.id
FROM public.stock_balances sb
JOIN public.products p ON p.id = sb.product_id
JOIN public.branches b ON b.id = sb.branch_id AND b.code = 'CD'
JOIN public.companies c ON c.id = b.company_id
WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '57832353000175'
GROUP BY p.id
HAVING sum(sb.quantity) >= 5
ORDER BY sum(sb.quantity) DESC
LIMIT 1;
SELECT 'STORE_BRANCH=' || b.id FROM public.branches b
JOIN public.companies c ON c.id = b.company_id
WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '57832353000175' AND b.code = 'Loja' LIMIT 1;
SELECT 'CD_BRANCH=' || b.id FROM public.branches b
JOIN public.companies c ON c.id = b.company_id
WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '57832353000175' AND b.code = 'CD' LIMIT 1;
"@
$linhas = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c $sqlIds
if ($LASTEXITCODE -ne 0) { Falha "Falha ao consultar os IDs."; exit 1 }
$ids = @{}
foreach ($linha in $linhas) {
  if ($linha -match "^\s*([^=]+)=(.*)$") { $ids[$Matches[1].Trim()] = $Matches[2].Trim() }
}
if (-not $ids.PRODUCT -or -not $ids.STORE_BRANCH -or -not $ids.CD_BRANCH) {
  Falha "Nao achei produto com saldo >= 5 no CD ou as unidades Loja/CD. Rode PREPARAR-LOJAS-TEXAS.bat antes."
  exit 1
}

$apiUrl = "http://localhost:8080"
$anonKey = ""
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^\s*SUPABASE_PUBLIC_URL=(.*)$") { $apiUrl = $Matches[1].Trim() }
  if ($linha -match "^\s*ANON_KEY=(.*)$") { $anonKey = $Matches[1].Trim() }
}
if (-not $anonKey) { Falha "ANON_KEY nao encontrado no .env.local."; exit 1 }

$conteudo = @"
VITE_SUPABASE_URL=$apiUrl
VITE_SUPABASE_PUBLISHABLE_KEY=$anonKey
E2E_STORE_EMAIL=loja@texasfarm.example.com
E2E_STORE_PASSWORD=E2eLoja@2026
E2E_MANAGER_EMAIL=gestor@zipo.example.com
E2E_MANAGER_PASSWORD=E2eGestor@2026
E2E_PRODUCT_ID=$($ids.PRODUCT)
E2E_STORE_BRANCH_ID=$($ids.STORE_BRANCH)
E2E_CD_BRANCH_ID=$($ids.CD_BRANCH)
"@
Set-Content -Path ".env.e2e" -Value $conteudo -Encoding ASCII
Ok ".env.e2e gerado na raiz (usuarios de teste + IDs reais desta instalacao)."
Write-Host "  Agora rode TESTAR-E2E.bat — a jornada completa: Loja pede 5, gestor"
Write-Host "  decide pelo CD, CD expede, Loja recebe 4 com divergencia registrada."
