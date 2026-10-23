# ============================================================================
# USE ERP (local) — diagnóstico e correção do login do administrador da BIL
#
# Uso:  .\corrigir-login-bil.ps1
#       .\corrigir-login-bil.ps1 -Email outro@email.com
#
# O que ele faz:
#   1. Confere se o usuário existe no banco de autenticação local;
#   2. (Re)cadastra a BIL pelo seed oficial idempotente, definindo a senha
#      informada (cria o usuário se faltar; redefine a senha se já existir);
#   3. TESTA o login de verdade contra a API local (/auth/v1/token) e só
#      declara sucesso se a API devolver um token.
# ============================================================================
param(
  [string]$Email = "etcsuporte889@gmail.com",
  [SecureString]$Senha
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

if (-not $Senha) {
  if ($env:BIL_ADMIN_PASSWORD) {
    $Senha = ConvertTo-SecureString $env:BIL_ADMIN_PASSWORD -AsPlainText -Force
  } else {
    Write-Host "Defina a senha do administrador $Email"
    Write-Host "(pode repetir a senha que voce quer usar para entrar no sistema)"
    $Senha = Read-Host "Nova senha" -AsSecureString
  }
}
$plain = [System.Net.NetworkCredential]::new("", $Senha).Password
if ([string]::IsNullOrWhiteSpace($plain) -or $plain.Length -lt 6) {
  Falha "Senha muito curta (minimo 6 caracteres)."
  exit 1
}

# ------------------------------------------------------------------ 1. Existe?
Aviso "Subindo a stack e aguardando o servico de autenticacao criar as tabelas..."
docker @compose up -d | Out-Null
if ($LASTEXITCODE -ne 0) {
  Falha "Falha ao subir a stack. Rode o INICIAR-SISTEMA.bat e tente de novo."
  exit 1
}

# Na primeira subida o GoTrue (auth) demora alguns segundos para criar o
# schema auth. Esperamos a condicao real existir (ate 3 minutos).
$emailSql = $Email.Replace("'", "''")
$existe = $null
# Durante a espera, o psql escreve o erro esperado no stderr ("relation nao
# existe" ate o auth criar as tabelas); com Stop isso viraria excecao no
# PowerShell e mataria o corretor. Relaxamos so neste trecho.
$ErrorActionPreference = "Continue"
for ($i = 0; $i -lt 36; $i++) {
  $existe = docker @compose exec -T db psql -U supabase_admin -d postgres -t -A -c "SELECT count(*) FROM auth.users WHERE lower(email) = lower('$emailSql');" 2>$null
  if ($LASTEXITCODE -eq 0 -and "$existe".Trim() -match "^\d+$") { break }
  $existe = $null
  Write-Host "  aguardando o servico de autenticacao... ($([int](($i + 1) * 5))s)"
  Start-Sleep -Seconds 5
}
$ErrorActionPreference = "Stop"
if ($null -eq $existe) {
  Falha "O servico de autenticacao nao criou as tabelas a tempo."
  Write-Host ""
  Write-Host "Diagnostico automatico:"
  docker @compose ps
  Write-Host ""
  Write-Host "Ultimas linhas do log do servico auth:"
  docker @compose logs --tail 30 auth
  Write-Host ""
  Write-Host "Me envie esta tela completa que eu identifico a causa."
  exit 1
}
if ("$existe".Trim() -eq "0") {
  Write-Host "  Usuario $Email NAO existe no banco - o cadastro da BIL nao rodou (ou falhou)."
  Write-Host "  Vou cadastrar agora com a senha informada."
} else {
  Ok "Usuario $Email existe - vou redefinir a senha e confirmar o e-mail."
}

# ------------------------------------------------- 2. (Re)cadastra pelo seed
Aviso "Aplicando o cadastro da BIL (idempotente)..."
$env:BIL_ADMIN_PASSWORD = $plain
try {
  & "$PSScriptRoot\cadastrar-bil.ps1" -Email $Email
  if ($LASTEXITCODE -ne 0) { throw "cadastrar-bil.ps1 retornou erro" }
} catch {
  Falha "O cadastro falhou: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item Env:BIL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}

# ------------------------------------------------------- 3. Testa login real
Aviso "Testando o login contra a API local..."
$porta = "8080"; $anon = ""
foreach ($linha in Get-Content ".env.local") {
  if ($linha -match "^WEB_PORT=(\d+)") { $porta = $Matches[1] }
  if ($linha -match "^ANON_KEY=(.+)$") { $anon = $Matches[1].Trim() }
}
$corpo = @{ email = $Email; password = $plain } | ConvertTo-Json
try {
  $resp = Invoke-RestMethod -Method Post `
    -Uri "http://localhost:$porta/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $anon; "Content-Type" = "application/json" } `
    -Body $corpo -TimeoutSec 15
  if ($resp.access_token) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " LOGIN FUNCIONANDO!" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " Abra http://localhost:$porta e entre com:"
    Write-Host "   E-mail: $Email"
    Write-Host "   Senha : a que voce acabou de definir"
    Write-Host ""
    Write-Host " Confira a grafia do e-mail: e gmail.com (nao gamil.com)."
    Write-Host " Troque a senha depois do primeiro acesso."
    Write-Host "============================================================"
    exit 0
  }
  Falha "A API respondeu sem token. Resposta: $($resp | ConvertTo-Json -Compress)"
  exit 1
} catch {
  $detalhe = $_.ErrorDetails.Message
  if (-not $detalhe) { $detalhe = $_.Exception.Message }
  Falha "O teste de login falhou: $detalhe"
  Write-Host "  Se o erro for 'Invalid login credentials', rode de novo conferindo"
  Write-Host "  o e-mail; se persistir, me envie esta tela."
  exit 1
} finally {
  $plain = $null
}
