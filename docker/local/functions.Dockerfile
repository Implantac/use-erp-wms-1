# ============================================================================
# USE ERP (local) — imagem das Edge Functions.
#
# Por que uma imagem e não bind mounts? O compose montava ./supabase/functions
# como somente-leitura em /home/deno/functions e, DENTRO dela, main/ e o
# arquivo deno.jsonc. No Docker Desktop para Windows (virtiofs) criar o ponto
# de montagem de um arquivo dentro de outra montagem somente-leitura falha:
#   "create mountpoint for /home/deno/functions/deno.jsonc ... read-only file system"
# Copiar para dentro da imagem elimina as montagens aninhadas e funciona
# igual no Windows, macOS e Linux. Quem alterar uma edge function roda
# INSTALAR-TUDO.bat (ou `docker compose ... up -d --build functions`).
# ============================================================================
FROM supabase/edge-runtime:v1.77.4

# Funções do projeto (admin-users, ai-*, etc.)
COPY supabase/functions /home/deno/functions

# Serviço principal local de roteamento (substitui qualquer main do projeto)
# e o import map local (@supabase/functions-js / @supabase/server).
COPY docker/local/volumes/functions/main /home/deno/functions/main
COPY docker/local/volumes/functions/deno.jsonc /home/deno/functions/deno.jsonc
