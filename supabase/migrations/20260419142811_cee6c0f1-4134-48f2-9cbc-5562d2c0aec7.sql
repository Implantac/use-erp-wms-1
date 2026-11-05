-- Enable required extensions for cron + HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove existing job if re-running
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-bank-reconciliation') THEN
    PERFORM cron.unschedule('daily-bank-reconciliation');
  END IF;
END $$;

-- Schedule daily run at 06:00 UTC (~03:00 BRT)
SELECT cron.schedule(
  'daily-bank-reconciliation',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/daily-bank-reconciliation',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $$
);