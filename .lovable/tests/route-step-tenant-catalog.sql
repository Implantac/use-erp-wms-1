-- After migration in isolated staging: catalog check only, not A/B behavior proof.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.validate_production_route_step_tenancy()'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%r.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%s.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%res.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%ps.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%v_operation_count <> 1%'
  THEN RAISE EXCEPTION 'Route-step tenant validation missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.production_route_steps'::regclass
      AND tgname = 'tr_validate_production_route_step_tenancy'
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN RAISE EXCEPTION 'Route-step validation trigger disabled or absent'; END IF;
END;
$$;
