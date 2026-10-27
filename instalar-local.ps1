# ============================================================================
# USE ERP — instalador da versao 100% LOCAL (Windows + Docker Desktop)
#
#   Uso:  .\instalar-local.ps1                 (interativo: escolhe o IP da rede)
#         .\instalar-local.ps1 -SomenteLocal   (so neste computador)
#         .\instalar-local.ps1 -IpDaRede 192.168.0.10
#
# O que ele faz:
#   1. Confere o Docker Desktop rodando
#   2. Gera .env.local com segredos novos (se ainda nao existir)
#   3. (Opcional) Aponta a URL publica para o IP da rede local + libera o firewall
#   4. Sobe PostgreSQL/Auth/API/Realtime/Storage/Functions e o frontend
#   5. Aplica as migrations no banco local e reaponta os agendamentos
#   6. Testa http://localhost:8080/healthz e mostra os enderecos de acesso
#
# Pre-requisito unico: Docker Desktop instalado e aberto (com WSL2).
# ============================================================================
param(
  [string]$IpDaRede = "",
  [switch]$SomenteLocal
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Aviso($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  OK  $msg" -ForegroundColor Green }
function Alerta($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------- 1. Docker
Aviso "Conferindo o Docker..."
try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop, espere ficar verde e rode de novo." -ForegroundColor Red
  exit 1
}
try { docker compose version *> $null } catch {
  Write-Host "Docker Compose v2 nao encontrado (vem junto com o Docker Desktop atual)." -ForegroundColor Red
  exit 1
}
Ok "Docker rodando."

# ------------------------------------------------------- 2. Segredos (.env)
function Novo-Hex([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (($b | ForEach-Object { $_.ToString("x2") }) -join "")
}
function Novo-Base64([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b).TrimEnd("=")
}
function Novo-Jwt([string]$role, [string]$segredo) {
  function B64Url([byte[]]$data) {
    return [Convert]::ToBase64String($data).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  }
  $agora = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $exp = $agora + (10 * 365 * 24 * 60 * 60)
  $header = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $payload = B64Url ([Text.Encoding]::UTF8.GetBytes("{""role"":""$role"",""iss"":""supabase-local"",""iat"":$agora,""exp"":$exp}"))
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($segredo)
  $assinatura = B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$payload")))
  return "$header.$payload.$assinatura"
}

$envFile = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $envFile) {
  Ok ".env.local ja existe - segredos mantidos."
} else {
  Aviso "Gerando .env.local com segredos novos (so desta instalacao)..."
  $jwtSecret = Novo-Hex 32
  $senhaPainel = Novo-Base64 18
  $conteudo = @"
# USE ERP - instalacao LOCAL (gerado em $(Get-Date -Format o)) - NAO compartilhe.
WEB_PORT=8080
SUPABASE_PUBLIC_URL=http://localhost:8080
SITE_URL=http://localhost:8080
PUBLIC_APP_URL=http://localhost:8080
ADDITIONAL_REDIRECT_URLS=http://localhost:8080/**,http://127.0.0.1:8080/**
POSTGRES_PASSWORD=$(Novo-Hex 24)
POSTGRES_DB=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432
JWT_SECRET=$jwtSecret
ANON_KEY=$(Novo-Jwt "anon" $jwtSecret)
SERVICE_ROLE_KEY=$(Novo-Jwt "service_role" $jwtSecret)
JWT_EXPIRY=3600
SECRET_KEY_BASE=$(Novo-Base64 48)
REALTIME_DB_ENC_KEY=$(Novo-Hex 8)
VAULT_ENC_KEY=$(Novo-Hex 16)
PG_META_CRYPTO_KEY=$(Novo-Base64 24)
S3_PROTOCOL_ACCESS_KEY_ID=$(Novo-Hex 16)
S3_PROTOCOL_ACCESS_KEY_SECRET=$(Novo-Hex 32)
CRON_SECRET=$(Novo-Hex 32)
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_PHONE_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=localhost
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME=USE ERP Local
MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
MAILER_URLPATHS_INVITE=/auth/v1/verify
MAILER_URLPATHS_RECOVERY=/auth/v1/verify
MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=$senhaPainel
STUDIO_DEFAULT_ORGANIZATION=USE ERP Local
STUDIO_DEFAULT_PROJECT=USE ERP
PGRST_DB_SCHEMAS=public,graphql_public
PGRST_DB_MAX_ROWS=1000
PGRST_DB_EXTRA_SEARCH_PATH=public
GLOBAL_S3_BUCKET=stub
REGION=stub
STORAGE_TENANT_ID=stub
IMGPROXY_AUTO_WEBP=true
FUNCTIONS_VERIFY_JWT=false
ALLOWED_ORIGINS=
LOVABLE_API_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
INCIDENT_EMAIL_FROM=
COMMERCE_NOTIFY_FROM=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BILLING_WEBHOOK_SECRET=
PSP_WEBHOOK_SECRET=
PIX_WEBHOOK_SECRET=
PIX_SIMULATION_ENABLED=
SEFAZ_MTLS_PROXY_URL=
SEFAZ_MTLS_PROXY_TOKEN=
SEFAZ_WEBHOOK_SECRET=
REINF_WS_ENDPOINT=
RFID_WEBHOOK_SECRET=
RFID_WEBHOOK_API_KEY=
BRAIN_WEBHOOK_URL=
"@
  Set-Content -Path $envFile -Value $conteudo -Encoding UTF8
  Ok ".env.local criado."
  Write-Host "  Painel do banco (opcional): usuario 'supabase' / senha '$senhaPainel' (guardada no .env.local)"
}

# Ler a porta configurada
$porta = "8080"
foreach ($linha in Get-Content $envFile) {
  if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] }
}

# ------------------------------------------------- 3. Rede local + firewall
if (-not $SomenteLocal) {
  if (-not $IpDaRede) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and $_.PrefixOrigin -ne "WellKnown" } |
      Select-Object -ExpandProperty IPAddress -Unique
    if ($ips) {
      Write-Host "`nEnderecos IPv4 desta maquina:"
      Write-Host "  0) Somente neste computador (localhost)"
      for ($i = 0; $i -lt $ips.Count; $i++) { Write-Host "  $($i+1)) http://$($ips[$i]):$porta  (rede local)" }
      $escolha = Read-Host "Qual endereco os outros computadores vao usar? [0]"
      if ($escolha -match "^\d+$" -and [int]$escolha -ge 1 -and [int]$escolha -le $ips.Count) {
        $IpDaRede = $ips[[int]$escolha - 1]
      }
    }
  }
  if ($IpDaRede) {
    Aviso "Apontando a URL publica para http://${IpDaRede}:$porta ..."
    $texto = Get-Content $envFile -Raw
    $base = "http://${IpDaRede}:$porta"
    $texto = $texto -replace "(?m)^SUPABASE_PUBLIC_URL=.*$", "SUPABASE_PUBLIC_URL=$base"
    $texto = $texto -replace "(?m)^SITE_URL=.*$", "SITE_URL=$base"
    $texto = $texto -replace "(?m)^PUBLIC_APP_URL=.*$", "PUBLIC_APP_URL=$base"
    $texto = $texto -replace "(?m)^ADDITIONAL_REDIRECT_URLS=.*$", "ADDITIONAL_REDIRECT_URLS=$base/**,http://localhost:$porta/**,http://127.0.0.1:$porta/**"
    Set-Content -Path $envFile -Value $texto -Encoding UTF8
    Ok "URL publica = $base"

    # Firewall (so perfil Privado; pede elevacao se nao for admin)
    try {
      $regra = Get-NetFirewallRule -DisplayName "USE ERP Local ($porta)" -ErrorAction SilentlyContinue
      if (-not $regra) {
        New-NetFirewallRule -DisplayName "USE ERP Local ($porta)" -Direction Inbound -LocalPort $porta -Protocol TCP -Action Allow -Profile Private -ErrorAction Stop | Out-Null
      }
      Ok "Firewall do Windows liberado na porta $porta (rede privada)."
    } catch {
      Alerta "Nao consegui criar a regra de firewall (sem privilegio de administrador?)."
      Alerta "Libere manualmente: Firewall do Windows > Regra de Entrada > Porta TCP $porta (Privado)."
      Alerta "Ou rode o PowerShell como Administrador e execute este instalador de novo."
    }
  }
}

# ---------------------------------------------------------------- 4/5. Subir
$compose = @("compose", "-f", "docker-compose.local.yml", "--env-file", ".env.local")

Aviso "Baixando imagens e construindo o frontend (a primeira vez demora varios minutos)..."
docker @compose up -d --build db auth rest realtime storage imgproxy functions web
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao subir os servicos. Veja: docker $($compose -join ' ') logs" -ForegroundColor Red; exit 1 }

Aviso "Aplicando as migrations no PostgreSQL local (459 arquivos na primeira vez)..."
docker @compose run --rm migrate
if ($LASTEXITCODE -ne 0) {
  Write-Host "Uma migration falhou (o instalador retoma dela na proxima execucao)." -ForegroundColor Red
  Write-Host "Detalhes: docker $($compose -join ' ') logs db" -ForegroundColor Red
  exit 1
}

Aviso "Garantindo todos os servicos no ar..."
docker @compose up -d
if ($LASTEXITCODE -ne 0) { Write-Host "Falha na subida final." -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------- 6. Teste
Aviso "Testando o sistema..."
$noAr = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$porta/healthz" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $noAr = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $noAr) {
  Write-Host "O frontend ainda nao respondeu. Veja: docker $($compose -join ' ') logs web" -ForegroundColor Red
  exit 1
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " USE ERP LOCAL NO AR!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Neste computador : http://localhost:$porta"
if ($IpDaRede) { Write-Host " Na rede local    : http://${IpDaRede}:$porta  (outros PCs usam este)" }
Write-Host ""
Write-Host " Proximo passo: abra o endereco, crie a primeira conta pela tela de"
Write-Host " cadastro (ela ja nasce confirmada) e complete o assistente da empresa."
Write-Host " Essa primeira conta e o seu administrador local."
Write-Host ""
Write-Host " Comandos uteis:"
Write-Host "   docker $($compose -join ' ') ps        (status)"
Write-Host "   docker $($compose -join ' ') logs -f   (logs)"
Write-Host "   docker $($compose -join ' ') down      (parar, mantem os dados)"
Write-Host "   .\backup-local.ps1                      (backup do banco)"
Write-Host "============================================================"
