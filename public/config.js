// Configuracao em tempo de execucao (runtime), carregada por index.html antes
// do modulo principal. Prioridade maxima em src/integrations/supabase/config.ts.
//
// Excecao declarada ao SEC-02 em 06/11/2026 por decisao do responsavel: o
// ambiente de build do Lovable nao repassou VITE_* ao vite build (INC-04) e o
// app ficou indisponivel. Este arquivo contem SOMENTE valores PUBLICOS (URL e
// chave anon/publishable, protegida por RLS). Nenhum segredo, service_role,
// DATABASE_URL ou token de acesso deve entrar aqui. Ver docs/ENVIRONMENT.md 0.2.
//
// A instalacao local (Docker) continua podendo sobrescrever este objeto na
// subida do container: os campos so sao preenchidos quando ainda estao vazios.
window.__USE_ERP_CONFIG__ = window.__USE_ERP_CONFIG__ || {};
if (!window.__USE_ERP_CONFIG__.SUPABASE_URL) {
  window.__USE_ERP_CONFIG__.SUPABASE_URL = "https://arcuhqdiydlvekanychw.supabase.co";
}
if (!window.__USE_ERP_CONFIG__.SUPABASE_PUBLISHABLE_KEY) {
  window.__USE_ERP_CONFIG__.SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyY3VocWRpeWRsdmVrYW55Y2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzkwMjcsImV4cCI6MjA4ODIxNTAyN30.A8cr7OwGiu2LvrPk7R5un4Ctd42XfxWy_sh7ViS16Vo";
}
