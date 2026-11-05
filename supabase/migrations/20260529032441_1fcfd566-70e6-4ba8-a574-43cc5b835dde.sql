CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('ai-brain-daily-autopilot');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- SEC-02: agendamento 'ai-brain-daily-autopilot' removido. Reagendar somente com
-- app.settings.supabase_functions_url / app.settings.supabase_anon_key
-- (ver docs/ENVIRONMENT.md, secao 0). Nenhuma credencial no repositorio.