# Liberar espaço do Docker no disco C:

## Por que enche
Cada atualização reconstrói a imagem do frontend e guarda camadas
antigas + cache de build. O Docker Desktop no Windows guarda tudo num
arquivo de disco virtual (VHDX) no C:. Com o tempo, são dezenas de GB.

## Passo 0 — medir (PowerShell)
```powershell
docker system df        # quanto é imagem, cache e o que dá p/ recuperar
docker volume ls        # seus volumes (banco/arquivos) — NÃO apagar
```
Confira também o tamanho de
`C:\Users\SEU_USUARIO\AppData\Local\Docker\wsl\disk\docker_data.vhdx`
(ou `...\wsl\data\docker_data.vhdx`, conforme a versão).

## Passo 1 — limpeza segura (sempre primeiro)
Rode **LIMPAR-DOCKER.bat**: remove containers parados, imagens órfãs e
cache de build > 7 dias. **Não toca em volumes** (banco e arquivos) nem
nas imagens etiquetadas (atual + rollback).

## Passo 2 — compactar o VHDX (se o C: continuar cheio)
O arquivo virtual não encolhe sozinho após a limpeza:
1. Feche o Docker Desktop (ícone na bandeja → Quit);
2. PowerShell (como administrador):
   ```powershell
   wsl --shutdown
   Optimize-VHD -Path "C:\Users\SEU_USUARIO\AppData\Local\Docker\wsl\disk\docker_data.vhdx" -Mode Full
   ```
   (sem Hyper-V, use o `diskpart` → `compact vdisk` no mesmo arquivo.)
3. Abra o Docker Desktop de novo e rode o INICIAR-SISTEMA.bat.

## Passo 3 — solução definitiva: mover o Docker para o D:
Docker Desktop → **Settings → Resources → Advanced → Disk image
location** → escolha uma pasta no D: (ex.: `D:\Docker`) → Apply &
Restart. Ele move os dados sozinho. Daí o C: para de sofrer.

## NUNCA faça
- `docker volume prune` ou apagar volumes pela interface: ali moram o
  **banco** e os **arquivos** do sistema;
- Apagar a pasta `backups\`: é o seu seguro fora dos volumes.

## Rotina sugerida
LIMPAR-DOCKER uma vez por mês (ou quando o C: apertar) e manter os
backups externos em dia.
