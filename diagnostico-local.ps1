# ============================================================================
# USE ERP (local) — diagnóstico da instalação (gera diagnostico.txt)
# Uso: .\diagnostico-local.ps1   (ou duplo clique em DIAGNOSTICO-SISTEMA.bat)
# Coleta estado dos containers, se as tabelas principais existem, quantas
# migrations foram aplicadas e o fim dos logs de migrate/db/auth/functions.
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")
$out = Join-Path $PSScriptRoot "diagnostico.txt"

function Grab($titulo, $scriptblock) {
  "`n===== $titulo =====" | Out-File $out -Append -Encoding utf8
  try { (& $scriptblock 2>&1 | Out-String) | Out-File $out -Append -Encoding utf8 }
  catch { "erro ao coletar: $($_.Exception.Message)" | Out-File $out -Append -Encoding utf8 }
}

"USE ERP - diagnostico local - $(Get-Date -Format o)" | Out-File $out -Encoding utf8
Grab "docker compose ps" { docker @compose ps }
Grab "tabelas principais e migrations" {
  docker @compose exec -T db psql -U supabase_admin -d postgres -c "SELECT to_regclass('public.companies') AS companies, to_regclass('public.production_orders') AS production_orders, to_regclass('public.stock_lots') AS stock_lots, to_regclass('auth.users') AS auth_users;"
  docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c "SELECT 'migrations aplicadas: ' || count(*) FROM supabase_migrations.schema_migrations;"
  docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c "SELECT 'ultima migration: ' || version || ' ' || name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;"
}
Grab "logs migrate (ultimas 60 linhas)" { docker @compose logs --tail 60 migrate }
Grab "logs db (ultimas 30 linhas)" { docker @compose logs --tail 30 db }
Grab "logs auth (ultimas 80 linhas)" { docker @compose logs --tail 80 auth }
Grab "logs storage (ultimas 40 linhas)" { docker @compose logs --tail 40 storage }
Grab "logs realtime (ultimas 40 linhas)" { docker @compose logs --tail 40 realtime }
Grab "logs rest (ultimas 60 linhas)" { docker @compose logs --tail 60 rest }
Grab "logs functions (ultimas 30 linhas)" { docker @compose logs --tail 30 functions }

Write-Host ""
Write-Host "Diagnostico gravado em: $out"
Write-Host "Envie esse arquivo (ou cole o conteudo) para analise."
