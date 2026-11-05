
-- Sprint Q: notificação direta ao responsável de alertas de divergência
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sla_warned_at timestamptz;

-- Trigger: quando assigned_to muda, dispara e-mail para o novo responsável
CREATE OR REPLACE FUNCTION public.notify_alert_assignee_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- Chama a edge function via pg_net (best-effort; ignora se extensão ausente)
  BEGIN
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.service_role_key', true);
    IF v_url IS NULL OR v_url = '' THEN
      v_url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '';
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-alert-assignee',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('notification_id', NEW.id, 'mode', 'assigned')
    );
  EXCEPTION WHEN OTHERS THEN
    -- silencioso: não bloqueia atribuição se pg_net indisponível
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_alert_assignee ON public.notifications;
CREATE TRIGGER trg_notify_alert_assignee
AFTER INSERT OR UPDATE OF assigned_to ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notify_alert_assignee_change();

-- Cron a cada 15 minutos: aviso de SLA próximo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('alert-sla-warning');
    PERFORM cron.schedule(
      'alert-sla-warning',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/notify-alert-assignee',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object('mode', 'sla_warning')
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
