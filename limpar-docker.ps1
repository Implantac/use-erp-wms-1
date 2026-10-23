# ============================================================================
# USE ERP (local) — limpeza SEGURA do Docker (libera espaco no disco C:)
#   Uso: .\limpar-docker.ps1   (ou LIMPAR-DOCKER.bat)
#
# O que ele REMOVE (so lixo):
#   - containers parados (ex.: os "migrate-run" de cada atualizacao);
#   - imagens sem etiqueta (camadas antigas de builds anteriores);
#   - cache de build com mais de 7 dias.
# O que ele NUNCA toca:
#   - VOLUMES (o banco de dados e os arquivos ficam em volumes);
#   - imagens etiquetadas (a atual e a de rollback: useerp/rollback-web).
# ============================================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

function Aviso($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }

try { docker version *> $null } catch {
  Write-Host "Docker nao respondeu. Abra o Docker Desktop e rode de novo." -ForegroundColor Red
  exit 1
}

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

Write-Host "`nObservacao: volumes (banco e arquivos) NAO foram tocados." -ForegroundColor Green
Write-Host "Se o disco C: continuar cheio, o arquivo da VM do Docker"
Write-Host "(docker_data.vhdx) nao encolhe sozinho — veja o passo a passo"
Write-Host "em docs/LIBERAR-ESPACO-DOCKER.md (inclui mover para o D:)."
