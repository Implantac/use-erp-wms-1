
CREATE OR REPLACE FUNCTION public.fn_notify_incident_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := nullif(current_setting('app.settings.supabase_url', true), '');
BEGIN
  IF NEW.status = 'open' AND NEW.severity = 'critical' AND v_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-incident-email',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('incident_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_incident_email ON public.system_incidents;
CREATE TRIGGER trg_notify_incident_email
AFTER INSERT ON public.system_incidents
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_incident_email();

REVOKE EXECUTE ON FUNCTION public.fn_notify_incident_email() FROM PUBLIC, anon, authenticated;
