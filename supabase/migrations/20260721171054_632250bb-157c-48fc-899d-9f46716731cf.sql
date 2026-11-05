-- Sprint R — Escalonamento automático de alertas vencidos
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_from uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_escalation
  ON public.notifications (company_id, due_at)
  WHERE resolved_at IS NULL AND escalated_at IS NULL AND assigned_to IS NOT NULL;

-- Function: escalates overdue, unresolved, assigned notifications.
-- Rule: if due_at < now() AND still open AND not escalated, reassign to an admin_matriz
-- of the same company (fallback: admin). Original assignee stored in escalated_from.
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
    -- pick an admin_matriz of same company different from current assignee
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

    -- Fire-and-forget notification email/push via edge function (mode = escalated)
    PERFORM net.http_post(
      url := coalesce(nullif(current_setting('app.settings.supabase_url', true), ''), '') || '/functions/v1/notify-alert-assignee',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('notification_id', v_row.id, 'mode', 'escalated')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_overdue_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_overdue_alerts() TO service_role;

-- Schedule every 30 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('escalate-overdue-alerts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'escalate-overdue-alerts',
  '*/30 * * * *',
  $$ SELECT public.escalate_overdue_alerts(); $$
);