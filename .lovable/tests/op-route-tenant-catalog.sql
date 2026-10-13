-- Run after migrations on isolated staging with: psql -v ON_ERROR_STOP=1 -f ...
-- Catalog proof only; complete A/B behavior still requires two tenant fixtures.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.generate_op_steps_from_route()'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%r.company_id = NEW.company_id%'
    OR v_def NOT LIKE '%rs.company_id = NEW.company_id%'
    OR v_def NOT LIKE '%ps.company_id = NEW.company_id%'
    OR v_def NOT LIKE '%p.company_id = NEW.company_id%'
    OR v_def NOT LIKE '%NEW.company_id, NEW.id, v_step_id%'
  THEN
    RAISE EXCEPTION 'OP route generation lacks required tenant-scoped lookups';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.production_orders'::regclass
      AND tgname = 'trg_generate_op_steps_from_route' AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'OP route generation trigger is missing or disabled';
  END IF;
END;
$$;
