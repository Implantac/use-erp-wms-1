CREATE TABLE IF NOT EXISTS public.internal_fn_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.internal_fn_secrets FROM anon, authenticated;
GRANT ALL ON public.internal_fn_secrets TO service_role;
ALTER TABLE public.internal_fn_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_fn_secrets (name, value)
VALUES ('edge_internal', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_internal_fn_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.internal_fn_secrets WHERE name = 'edge_internal';
$$;

REVOKE ALL ON FUNCTION public.get_internal_fn_secret() FROM PUBLIC, anon, authenticated;

-- Trigger: alerta atribuído -> envia segredo interno
CREATE OR REPLACE FUNCTION public.notify_alert_assignee_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_url := nullif(current_setting('app.settings.supabase_url', true), '');
    IF v_url IS NULL THEN
      -- Fail-closed: sem configuracao do ambiente, nenhum HTTP externo.
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-alert-assignee',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', public.get_internal_fn_secret()
      ),
      body := jsonb_build_object('notification_id', NEW.id, 'mode', 'assigned')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Escalonamento: chama a function com segredo interno
CREATE OR REPLACE FUNCTION public.escalate_overdue_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_target uuid;
  v_count integer := 0;
  v_base_url text := nullif(current_setting('app.settings.supabase_url', true), '');
BEGIN
  FOR v_row IN
    SELECT n.id, n.company_id, n.assigned_to, n.title, n.due_at
    FROM public.notifications n
    WHERE n.resolved_at IS NULL
      AND n.escalated_at IS NULL
      AND n.assigned_to IS NOT NULL
      AND n.due_at IS NOT NULL
      AND n.due_at < now()
      AND n.type IN ('warning','error','alert','reconciliation','sla')
    LIMIT 200
  LOOP
    SELECT ur.user_id INTO v_target
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE p.company_id = v_row.company_id
       AND ur.role = 'admin_matriz'
       AND ur.user_id <> v_row.assigned_to
     ORDER BY ur.user_id
     LIMIT 1;

    IF v_target IS NULL THEN
      SELECT ur.user_id INTO v_target
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE p.company_id = v_row.company_id
         AND ur.role = 'admin'
         AND ur.user_id <> v_row.assigned_to
       ORDER BY ur.user_id
       LIMIT 1;
    END IF;

    IF v_target IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.notifications
       SET escalated_at   = now(),
           escalated_from = assigned_to,
           escalated_to   = v_target,
           assigned_to    = v_target,
           sla_warned_at  = NULL,
           metadata       = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
             'escalation', jsonb_build_object(
               'at', now(),
               'from', v_row.assigned_to,
               'to', v_target,
               'reason', 'sla_overdue'
             )
           )
     WHERE id = v_row.id;

    IF v_base_url IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_base_url || '/functions/v1/notify-alert-assignee',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', public.get_internal_fn_secret()
        ),
        body := jsonb_build_object('notification_id', v_row.id, 'mode', 'escalated')
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Trigger de incidente critico: fail-closed, sem URL ou chave fixa.
CREATE OR REPLACE FUNCTION public.tg_notify_incident_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_url text := nullif(current_setting('app.settings.supabase_url', true), '');
BEGIN
  IF NEW.severity = 'critical' AND v_base_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_base_url || '/functions/v1/notify-incident-email',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-internal-secret', public.get_internal_fn_secret()
      ),
      body := jsonb_build_object('incident_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- SEC-02: o agendamento 'alert-sla-warning' embutia a URL do projeto legado.
-- Nao e recriado aqui; reagendar somente apos definir
-- app.settings.supabase_url no ambiente (ver docs/ENVIRONMENT.md, secao 0).
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('alert-sla-warning');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
