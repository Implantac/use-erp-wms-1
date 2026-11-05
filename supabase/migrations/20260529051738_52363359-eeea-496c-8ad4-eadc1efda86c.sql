-- Garante extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove jobs antigos com o mesmo nome (idempotente)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname IN ('brain-weekly-learning','brain-notify-critical') LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- Aprendizado semanal: toda segunda-feira 06:00 UTC
SELECT cron.schedule(
  'brain-weekly-learning',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/ai-brain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action','weekly_learning')
  ) AS request_id;
  $$
);

-- Notificação de críticos: a cada 4 horas
SELECT cron.schedule(
  'brain-notify-critical',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/ai-brain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action','notify_critical')
  ) AS request_id;
  $$
);