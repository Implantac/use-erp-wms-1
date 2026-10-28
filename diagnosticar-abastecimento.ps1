# ============================================================================
# USE ERP (local) — DIAGNÓSTICO do fluxo Loja -> Fábrica (abastecimento)
#
# Uso: .\diagnosticar-abastecimento.ps1   (ou DIAGNOSTICAR-ABASTECIMENTO.bat)
#
# Não altera NADA: só lê o banco e mostra, com o usuário etcsuporte889:
#   1) grant de leitura das solicitações (o 403);
#   2) empresas do grupo e quem é filha de quem;
#   3) as últimas solicitações criadas (quem pediu, onde, status);
#   4) empresa do perfil e papéis do usuário;
#   5) o que factory_inbox() devolve PARA ESSE usuário.
# Cole a saída inteira ao pedir suporte.
# ============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop e rode de novo." -ForegroundColor Red
  exit 1
}
$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

$sql = @'
\echo === 1) GRANT de leitura (PostgREST) ===
SELECT 'grant_select_authenticated=' || has_table_privilege('authenticated', 'public.supply_requests', 'SELECT');
SELECT 'migrations_aplicadas=' || count(*) FROM supabase_migrations.schema_migrations;
\echo === 2) EMPRESAS DO GRUPO (filha -> pai) ===
SELECT c.name || ' <- pai: ' || COALESCE(p.name, '(raiz)') FROM public.companies c LEFT JOIN public.companies p ON p.id = c.parent_company_id ORDER BY c.created_at;
\echo === 3) ULTIMAS SOLICITACOES DE ABASTECIMENTO ===
SELECT to_char(sr.created_at, 'DD/MM HH24:MI') || ' | ' || c.name || ' / ' || COALESCE(b.name, '?') || ' | ' || sr.product_code || ' x' || sr.quantity || ' | ' || sr.status || ' | pediu: ' || COALESCE(u.email, '?')
FROM public.supply_requests sr
JOIN public.companies c ON c.id = sr.company_id
LEFT JOIN public.branches b ON b.id = sr.requester_branch_id
LEFT JOIN auth.users u ON u.id = sr.created_by
ORDER BY sr.created_at DESC LIMIT 10;
\echo === 4) USUARIO etcsuporte889: empresa do perfil + papeis ===
SELECT 'perfil_empresa=' || COALESCE(c.name, '(sem empresa)') FROM public.profiles p LEFT JOIN public.companies c ON c.id = p.company_id WHERE p.id = (SELECT id FROM auth.users WHERE lower(email) = 'etcsuporte889@gmail.com' LIMIT 1);
SELECT 'papel: ' || ur.role || ' @ ' || c.name FROM public.user_roles ur JOIN public.companies c ON c.id = ur.company_id WHERE ur.user_id = (SELECT id FROM auth.users WHERE lower(email) = 'etcsuporte889@gmail.com' LIMIT 1);
\echo === 5) FACTORY_INBOX COMO O etcsuporte VE ===
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT id::text FROM auth.users WHERE lower(email) = 'etcsuporte889@gmail.com' LIMIT 1), 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT 'supply_pendentes=' || jsonb_array_length(COALESCE(public.factory_inbox() -> 'supply', '[]'::jsonb)) || ' intercompany_pendentes=' || jsonb_array_length(COALESCE(public.factory_inbox() -> 'intercompany', '[]'::jsonb));
RESET ROLE;
'@

$tmpSql = Join-Path $env:TEMP "diag-abastecimento.sql"
Set-Content -Path $tmpSql -Value $sql -Encoding ASCII
docker @compose cp $tmpSql "db:/tmp/diag-abastecimento.sql" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao copiar o diagnostico." -ForegroundColor Red; exit 1 }
docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -f /tmp/diag-abastecimento.sql

Aviso "Imagem web em uso (idade da tela atual):"
docker inspect -f "web_criada_em={{.Created}} image={{.Config.Image}}" useerp-web 2>$null
if (Test-Path ".web-build-stamp") { Write-Host "selo do ultimo build: $(Get-Content .web-build-stamp)" } else { Write-Host "selo do ultimo build: (nenhum - build novo ou pasta recem-extraida)" }
Write-Host "`nDiagnostico concluido (nada foi alterado)."
