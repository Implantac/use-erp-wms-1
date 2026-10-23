// Configuração em tempo de execução (instalação LOCAL via Docker).
//
// Na nuvem e no `npm run dev` este arquivo fica vazio de propósito: o app
// usa as variáveis VITE_SUPABASE_* do build normalmente.
//
// No container local, o entrypoint do nginx sobrescreve este arquivo na
// subida com a chave pública (anon) gerada na instalação. A URL não é
// gravada: o app usa a própria origem da página (localhost ou IP da rede
// local), pois o nginx do container `web` faz proxy da API Supabase.
window.__USE_ERP_CONFIG__ = window.__USE_ERP_CONFIG__ || {};
