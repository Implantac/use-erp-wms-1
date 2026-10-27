# ============================================================================
# USE ERP (local) - DIAGNOSTICO de login (400) e do Realtime (WebSocket)
#
# Uso: .\diagnosticar-login.ps1   (ou DIAGNOSTICAR-LOGIN.bat)
#
# Nao altera dados: mostra o status dos containers, se os usuarios de teste
# E2E existem no banco, tenta o LOGIN DE VERDADE dos dois (a mesma chamada
# que a tela faz) e imprime a resposta exata do servidor de autenticacao,
# alem da saude do servico Realtime e dos logs recentes de auth/realtime.
# Cole a saida inteira ao pedir suporte.
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }
function Falha($m) { Write-Host "  !!  $m" -ForegroundColor Red }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop, espere ficar verde e rode de novo." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Falha ".env.local nao encontrado. Rode primeiro .\instalar-local.ps1"
  exit 1
}
$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

# URL publica e chave anonima saem do .env.local (mesma origem da tela).
$apiUrl = "http://localhost:8080"
$anonKey = ""
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^\s*SUPABASE_PUBLIC_URL=(.*)$") { $apiUrl = $Matches[1].Trim() }
  if ($linha -match "^\s*ANON_KEY=(.*)$") { $anonKey = $Matches[1].Trim() }
}

Aviso "1) Status dos containers (web / auth / rest / realtime / db)"
docker @compose ps web auth rest realtime db

Aviso "2) Usuarios de teste E2E no banco (existe? confirmado? perfil?)"
$sqlUsers = @'
SELECT 'USUARIO ' || u.email
  || ' | confirmado=' || CASE WHEN u.email_confirmed_at IS NULL THEN 'NAO' ELSE 'sim' END
  || ' | apagado=' || CASE WHEN u.deleted_at IS NULL THEN 'nao' ELSE 'SIM' END
  || ' | banido_ate=' || COALESCE(to_char(u.banned_until, 'DD/MM HH24:MI'), '-')
  || ' | tem_senha=' || CASE WHEN u.encrypted_password IS NULL OR u.encrypted_password = '' THEN 'NAO' ELSE 'sim' END
  || ' | perfil_empresa=' || COALESCE(c.name, '(sem perfil)')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.companies c ON c.id = p.company_id
WHERE lower(u.email) IN ('loja@texasfarm.example.com', 'gestor@zipo.example.com')
ORDER BY u.email;
SELECT 'total_usuarios_auth=' || count(*) FROM auth.users;
'@
$outUsers = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c $sqlUsers
$outUsers
if (-not ($outUsers -match "loja@texasfarm.example.com")) {
  Falha "Usuario loja@texasfarm.example.com NAO existe neste banco."
  Write-Host "     Os usuarios E2E so sao criados pelo PREPARAR-E2E-Lojas.bat." -ForegroundColor Yellow
}
if (-not ($outUsers -match "gestor@zipo.example.com")) {
  Falha "Usuario gestor@zipo.example.com NAO existe neste banco."
  Write-Host "     Os usuarios E2E so sao criados pelo PREPARAR-E2E-Lojas.bat." -ForegroundColor Yellow
}

Aviso "3) Teste REAL de login (a mesma chamada da tela: POST /auth/v1/token)"
function Testar-Login($email, $senha) {
  if (-not $anonKey) { Falha "ANON_KEY nao encontrado no .env.local - login nao testado."; return }
  # O corpo vai num arquivo temporario: passar o JSON direto na linha de
  # comando faz o PowerShell 5.1 comer as aspas e o GoTrue responde
  # bad_json (o teste nem chega a verificar a senha).
  $body = @{ email = $email; password = $senha } | ConvertTo-Json -Compress
  $tmp = [System.IO.Path]::GetTempFileName()
  $body | Set-Content -Path $tmp -Encoding ASCII
  $resp = & curl.exe -s -w "`nHTTP=%{http_code}" -X POST "$apiUrl/auth/v1/token?grant_type=password" -H "apikey: $anonKey" -H "Content-Type: application/json" --data-binary "@$tmp"
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  $texto = ($resp -join " ")
  if ($texto -match "access_token") {
    Ok "LOGIN FUNCIONOU: $email"
  } else {
    Falha "LOGIN RECUSADO: $email"
    Write-Host "     Resposta do servidor: $texto"
    Write-Host "     (invalid_credentials = senha/e-mail nao conferem; email_not_confirmed = falta confirmar)"
  }
}
Testar-Login "loja@texasfarm.example.com" "E2eLoja@2026"
Testar-Login "gestor@zipo.example.com" "E2eGestor@2026"

Aviso "4) Saude do Realtime (a tela conecta em /realtime/v1/websocket)"
$rt = docker @compose exec -T realtime curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $anonKey" http://localhost:4000/api/tenants/realtime-dev/health
if ($rt -match "200") {
  Ok "Realtime respondeu (HTTP $rt). Se a tela ainda falha, e cache do navegador: Ctrl+F5."
} else {
  Falha "Realtime NAO respondeu (retorno: '$rt'). Veja os logs na secao 5."
  Write-Host "     Efeito: as telas nao atualizam sozinhas (F5 resolve) e o console enche de erro."
  Write-Host "     O sistema funciona sem ele. Correcao tipica: reiniciar o servico (ver instrucoes)."
}

Aviso "5) Logs recentes - auth (ultimas 25 linhas)"
docker @compose logs --tail 25 auth
Aviso "5b) Logs recentes - realtime (ultimas 30 linhas)"
docker @compose logs --tail 30 realtime

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Fim do diagnostico. Cole TODA a saida ao pedir suporte." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
