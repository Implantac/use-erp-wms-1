# ============================================================================
# USE ERP (local) — limpeza do Docker que LIBERA o C: de verdade
#   Uso: LIMPAR-DOCKER.bat (eleva para administrador sozinho)
#
# Etapa 1 (lixo): containers parados, imagens sem etiqueta e cache de
# build com mais de 7 dias. NUNCA toca em volumes (banco/arquivos) nem
# nas imagens etiquetadas (a atual e a de rollback).
# Etapa 2 (compactar): o espaco liberado na etapa 1 so volta para o C:
# quando o arquivo do disco virtual (docker_data.vhdx) e compactado.
# O script pergunta antes, fecha o Docker, compacta e voce reabre o
# sistema com o INICIAR-SISTEMA.bat.
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop e rode de novo." -ForegroundColor Red
  exit 1
}

# --- Etapa 1: lixo ---------------------------------------------------------
Aviso "Uso de disco ANTES da limpeza:"
docker system df

Aviso "Removendo containers parados..."
docker container prune -f | Out-Null
Ok "Containers parados removidos."

Aviso "Removendo imagens sem etiqueta (lixo de builds antigos)..."
docker image prune -f | Out-Null
Ok "Imagens orfas removidas (a atual e a de rollback ficam)."

Aviso "Limpando cache de build com mais de 7 dias..."
docker builder prune -f --filter "until=168h" | Out-Null
Ok "Cache antigo removido."

Aviso "Uso de disco DEPOIS da limpeza:"
docker system df

# --- Etapa 2: compactar o VHDX para o C: enxergar --------------------------
$candidatos = @(
  (Join-Path $env:LOCALAPPDATA "Docker\wsl\disk\docker_data.vhdx"),
  (Join-Path $env:LOCALAPPDATA "Docker\wsl\data\docker_data.vhdx")
)
$vhdx = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($vhdx) {
  $antes = (Get-Item $vhdx).Length
  Aviso ("Disco virtual do Docker hoje: {0:N1} GB" -f ($antes / 1GB))
  $quer = Read-Host "Compactar agora para devolver o espaco ao C:? (fecha o Docker Desktop) (S/N)"
  if ($quer -match '^[Ss]') {
    Aviso "Fechando o Docker Desktop..."
    Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    try { Stop-Service "com.docker.service" -Force -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 3
    wsl --shutdown 2>$null
    Start-Sleep -Seconds 3

    $okCompact = $false
    if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) {
      try { Optimize-VHD -Path $vhdx -Mode Full -ErrorAction Stop; $okCompact = $true } catch {}
    }
    if (-not $okCompact) {
      Aviso "Tentando pelo diskpart..."
      $tmp = Join-Path $env:TEMP "compact-vhdx.txt"
      @("select vdisk file=`"$vhdx`"", "attach vdisk readonly", "compact vdisk", "detach vdisk", "exit") |
        Set-Content $tmp -Encoding ASCII
      diskpart /s $tmp | Out-Null
      Remove-Item $tmp -ErrorAction SilentlyContinue
    }
    $depois = (Get-Item $vhdx).Length
    Ok ("Disco virtual agora: {0:N1} GB (liberados {1:N1} GB no C:)" -f ($depois / 1GB), (($antes - $depois) / 1GB))
    Write-Host "Reabra o sistema com o INICIAR-SISTEMA.bat." -ForegroundColor Green
  } else {
    Write-Host "Compactacao pulada. Sem ela, o C: so enxerga o espaco depois de compactar (guia em docs/LIBERAR-ESPACO-DOCKER.md)." -ForegroundColor Yellow
  }
} else {
  Write-Host "Nao localizei o docker_data.vhdx nos caminhos usuais; limpeza de lixo concluida." -ForegroundColor Yellow
}
