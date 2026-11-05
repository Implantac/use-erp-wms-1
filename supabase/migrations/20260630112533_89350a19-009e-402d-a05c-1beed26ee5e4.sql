
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('wms-intelligence-30min','wms-slotting-daily');

-- SEC-02: agendamento 'wms-intelligence-30min' removido. Reagendar somente com
-- app.settings.supabase_functions_url / app.settings.supabase_anon_key
-- (ver docs/ENVIRONMENT.md, secao 0). Nenhuma credencial no repositorio.

-- SEC-02: agendamento 'wms-slotting-daily' removido. Reagendar somente com
-- app.settings.supabase_functions_url / app.settings.supabase_anon_key
-- (ver docs/ENVIRONMENT.md, secao 0). Nenhuma credencial no repositorio.

CREATE OR REPLACE FUNCTION public.get_operator_productivity(p_days int DEFAULT 7)
RETURNS TABLE (
  operator_id uuid,
  operator_name text,
  tasks_completed bigint,
  avg_seconds_per_task numeric,
  picks bigint,
  putaways bigint,
  last_activity timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ),
  logs AS (
    SELECT tl.operator_id,
           tl.task_type,
           tl.duration_seconds,
           tl.created_at
    FROM public.wms_task_logs tl
    WHERE tl.company_id = (SELECT company_id FROM caller)
      AND tl.created_at >= now() - (p_days || ' days')::interval
  )
  SELECT
    l.operator_id,
    COALESCE(p.name, p.email, l.operator_id::text) AS operator_name,
    COUNT(*) AS tasks_completed,
    ROUND(AVG(NULLIF(l.duration_seconds, 0))::numeric, 1) AS avg_seconds_per_task,
    COUNT(*) FILTER (WHERE l.task_type ILIKE '%pick%') AS picks,
    COUNT(*) FILTER (WHERE l.task_type ILIKE '%putaway%') AS putaways,
    MAX(l.created_at) AS last_activity
  FROM logs l
  LEFT JOIN public.profiles p ON p.id = l.operator_id
  GROUP BY l.operator_id, p.name, p.email
  ORDER BY tasks_completed DESC
  LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.get_operator_productivity(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operator_productivity(int) TO authenticated, service_role;
