#!/bin/sh
# Executado pelo entrypoint oficial do nginx antes de subir o servidor.
# Gera o /config.js com a configuração em tempo de execução da instalação
# local. A chave anon é PÚBLICA por natureza (a segurança é o RLS do banco);
# mesmo assim ela só existe neste arquivo porque foi gerada para ESTA
# instalação. A URL da API não é gravada: o app usa a própria origem.
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
// Gerado na subida do container local — não editar (é recriado a cada start).
window.__USE_ERP_CONFIG__ = {
  SUPABASE_PUBLISHABLE_KEY: "${ANON_KEY:-}"
};
EOF

echo "use-erp: /config.js gerado (chave anon local injetada)."
