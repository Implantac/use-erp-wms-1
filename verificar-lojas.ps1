# ============================================================================
# USE ERP (local) — verificação das Lojas Texas Farm (camada por camada)
# Uso: .\verificar-lojas.ps1
# Mostra [OK]/[FALTA] de cada camada: banco, catálogo, saldos, frontend.
# Se algo der [FALTA], envie esta tela inteira para análise.
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

function Q($sql) {
  (docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c $sql 2>$null | Out-String).Trim()
}
function Linha($ok, $msg) {
  if ($ok) { Write-Host "  [OK]   $msg" -ForegroundColor Green }
  else     { Write-Host "  [FALTA] $msg" -ForegroundColor Red }
}

Write-Host "`n=== VERIFICAÇÃO DAS Lojas Texas Farm ===" -ForegroundColor Cyan

$n = Q "SELECT count(*) FROM public.products WHERE code LIKE 'TXF-%';"
$f = Q "SELECT count(*) FROM public.products WHERE code LIKE 'TXF-%' AND image_url IS NOT NULL;"
Linha ($n -eq "20") "Catalogo Texas Farm: $n produtos (esperado 20 = 10 x 2 empresas)"
Linha ($f -eq "20") "Produtos com foto: $f de 20"

$Loja2 = Q "SELECT count(*) FROM public.branches WHERE code = 'L2';"
Linha ($Loja2 -eq "1") "Filial Loja 2 cadastrada"

$pol = Q "SELECT count(*) FROM public.replenishment_policies rp JOIN public.branches b ON b.id = rp.branch_id WHERE b.code = 'Loja';"
Linha ([int]$pol -ge 10) "Politicas de reposicao da Loja 1: $pol (esperado >= 10)"

$saldo = Q "SELECT string_agg(x, ' | ') FROM (SELECT b.code || '=' || COALESCE(sum(sb.quantity),0)::int FROM public.branches b LEFT JOIN public.stock_balances sb ON sb.branch_id = b.id AND sb.product_id IN (SELECT id FROM public.products WHERE code = 'TXF-CM639') WHERE b.code IN ('MATRIZ','CD','Loja','L2') GROUP BY b.code ORDER BY b.code) s(x);"
Write-Host "  Saldos CM639 (fabrica/CD/Loja1/Loja2): $saldo"

$tab = Q "SELECT to_regclass('public.supply_requests') IS NOT NULL;"
Linha ($tab -eq "t") "Tabela de solicitacoes de abastecimento existe (migration 20261022130000)"
$mig = Q "SELECT max(version) FROM supabase_migrations.schema_migrations;"
Write-Host "  Ultima migration aplicada: $mig (esperado >= 20261022130000)"

$sup = Q "SELECT count(*) FROM public.supply_requests WHERE status = 'PENDENTE';"
$int = Q "SELECT count(*) FROM public.intercompany_replenishment_requests WHERE status = 'pendente';"
Write-Host "  Solicitacoes de abastecimento pendentes (analise): $sup"
Write-Host "  Pedidos a fabrica pendentes (decisao da industria): $int"
Linha ([int]$sup -ge 1 -or [int]$int -ge 1) "Ha solicitacao de Loja aguardando a fabrica (caixa de entrada nao esta vazia)"

$web = (docker @compose exec -T web sh -c "grep -rl 'caixa de entrada da F' /usr/share/nginx/html 2>/dev/null | head -1" 2>$null | Out-String).Trim()
Linha ($web -ne "") "Frontend novo no ar (caixa de entrada da fabrica presente)"
if ($web -eq "") { Write-Host "         -> rode ATUALIZAR-WEB.bat e espere o build terminar" -ForegroundColor Yellow }

Write-Host "`nSe alguma linha deu [FALTA], rode o .bat indicado e verifique de novo." -ForegroundColor Cyan
Write-Host "Persistindo, envie esta tela inteira para analise.`n"
