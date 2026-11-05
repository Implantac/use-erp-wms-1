-- Cron diário para autopilot do Cérebro Nativo (06:30 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'ai-brain-autopilot-daily';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'ai-brain-autopilot-daily',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/ai-brain',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('action','cron_run')
  );
  $$
);