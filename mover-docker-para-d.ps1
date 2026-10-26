# ============================================================================
# USE ERP (local) — mover os DADOS do Docker Desktop do C: para o D:
#   Uso: MOVER-DOCKER-PARA-D.bat (eleva para administrador sozinho)
#
# Como funciona (metodo do elo/junction — nao mexe nas configuracoes
# internas do Docker, entao nao corrompe nada):
#   1. confere espaco no D: e localiza a pasta de dados do Docker;
#   2. para o Docker Desktop e o WSL;
#   3. COPIA os dados para D:\Docker\wsl e confere o arquivo do disco
#      virtual (docker_data.vhdx) byte a byte (tamanho);
#   4. renomeia a pasta original para backup temporario;
#   5. cria um ELO (junction) no caminho antigo apontando para o D: —
#      o Docker continua "vendo" o mesmo caminho, mas os dados fisicos
#      (e o crescimento futuro) ficam no D:;
#   6. abre o Docker Desktop e espera ele responder;
#   7. so com o Docker OK apaga o backup temporario do C:.
# Se algo falhar no meio, o script desfaz (volta a pasta original) ou
# deixa o backup intacto com instrucao na tela. Volumes, banco e imagens
# sao movidos juntos — nada se perde.
#
# Observacao: os ARQUIVOS DO PROGRAMA Docker Desktop (C:\Program Files)
# sao pequenos e ficam onde estao; quem comia o disco era o dado (VHDX).
# ============================================================================
$ErrorActionPreference = "Stop"

function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }
function Falha($m) { Write-Host "`nERRO: $m" -ForegroundColor Red }

$origem  = Join-Path $env:LOCALAPPDATA "Docker\wsl"
$destino = "D:\Docker\wsl"
$log     = Join-Path $PSScriptRoot "mover-docker.log"
Start-Transcript -Path $log -Append | Out-Null

try {
  # --- Pre-checagens -------------------------------------------------------
  if (-not (Test-Path "D:\")) { throw "Unidade D: nao encontrada nesta maquina." }
  $item = Get-Item $origem -Force -ErrorAction SilentlyContinue
  if (-not $item) { throw "Pasta de dados do Docker nao encontrada em $origem. O Docker Desktop esta instalado?" }
  if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") {
    Aviso "Os dados do Docker JA estao fora do caminho padrao (elo para $($item.Target)). Nada a fazer."
    return
  }
  if (Test-Path $destino) { throw "Ja existe $destino. Apague/renomeie essa pasta (de uma tentativa anterior?) e rode de novo." }

  $vhdx = Get-ChildItem $origem -Recurse -Filter *.vhdx -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 1
  $totalBytes = (Get-ChildItem $origem -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  $livreD = (Get-PSDrive D).Free
  Aviso ("Dados do Docker: {0:N1} GB no C: | Livre no D:: {1:N1} GB" -f ($totalBytes / 1GB), ($livreD / 1GB))
  if ($vhdx) { Write-Host ("  Disco virtual: {0} ({1:N1} GB)" -f $vhdx.FullName.Replace($origem, '...'), ($vhdx.Length / 1GB)) }
  if ($livreD -lt ($totalBytes * 1.15)) { throw "Espaco insuficiente no D: (precisa de ~15% a mais que o tamanho dos dados)." }

  $confirmacao = Read-Host "`nIsso para o Docker por alguns minutos e move os dados para D:\Docker. Continuar? (S/N)"
  if ($confirmacao -notmatch '^[Ss]') { Aviso "Cancelado por voce. Nada foi alterado."; return }

  # --- Para Docker + WSL ----------------------------------------------------
  Aviso "Parando o Docker Desktop e o WSL..."
  Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  try { Stop-Service "com.docker.service" -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Seconds 3
  wsl --shutdown 2>$null
  Start-Sleep -Seconds 3
  Ok "Docker parado."

  # --- Copia para o D: -------------------------------------------------------
  Aviso "Copiando dados para $destino (pode demorar conforme o tamanho)..."
  New-Item -ItemType Directory -Path (Split-Path $destino) -Force | Out-Null
  robocopy $origem $destino /E /COPY:DAT /DCOPY:DAT /R:2 /W:5 /MT:8 /NFL /NDL /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "A copia (robocopy) falhou com codigo $LASTEXITCODE. A pasta original NAO foi tocada." }

  if ($vhdx) {
    $vhdxDestino = $vhdx.FullName.Replace($origem, $destino)
    if (-not (Test-Path $vhdxDestino)) { throw "O disco virtual nao apareceu no destino. Original intacto." }
    $tamOrigem  = (Get-Item $vhdx.FullName).Length
    $tamDestino = (Get-Item $vhdxDestino).Length
    if ($tamOrigem -ne $tamDestino) { throw "Tamanho do disco virtual difere no destino ($tamDestino <> $tamOrigem). Original intacto." }
  }
  Ok "Copia conferida."

  # --- Troca pelo elo ---------------------------------------------------------
  $backup = "$origem-backup-mover"
  if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
  Rename-Item $origem $backup
  cmd /c mklink /J "$origem" "$destino" | Out-Null
  if (-not ((Get-Item $origem -Force).LinkType -eq "Junction")) {
    Rename-Item $backup $origem
    throw "Nao consegui criar o elo; pasta original restaurada."
  }
  Ok "Elo criado: $origem -> $destino"

  # --- Sobe o Docker e valida --------------------------------------------------
  Aviso "Abrindo o Docker Desktop (pode levar 1-3 min)..."
  $exe = @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe", "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($exe) { Start-Process $exe }
  $subiu = $false
  for ($i = 0; $i -lt 36; $i++) {
    Start-Sleep -Seconds 5
    docker version *> $null
    if ($LASTEXITCODE -eq 0) { $subiu = $true; break }
  }
  if (-not $subiu) {
    Falha "O Docker nao respondeu apos a mudanca. O backup dos dados continua em $backup e o elo aponta para o D:."
    Write-Host "Para desfazer manualmente: feche o Docker, apague o elo ($origem), renomeie '$backup' de volta para 'wsl' e abra o Docker."
    Write-Host "Log completo em $log"
    return
  }
  Ok "Docker respondendo com os dados no D:!"

  # --- Limpeza do C: -------------------------------------------------------------
  Aviso "Apagando a copia antiga do C: (backup temporario)..."
  Remove-Item $backup -Recurse -Force
  Ok "Pronto! Dados do Docker agora vivem em $destino (o C: respirou)."
  Write-Host "Confira: docker system df  |  Containers do sistema: rode INICIAR-SISTEMA.bat se precisar." -ForegroundColor Green
}
catch {
  Falha $_.Exception.Message
  Write-Host "Nada foi apagado do C:. Se a duvida persistir, me envie o arquivo mover-docker.log da pasta do sistema." -ForegroundColor Yellow
}
finally {
  Stop-Transcript | Out-Null
}
