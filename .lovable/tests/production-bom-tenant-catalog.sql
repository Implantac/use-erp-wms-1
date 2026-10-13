-- Run after migration in isolated staging; structural proof only.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.validate_production_bom_tenancy()'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%p.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%c.company_id = NEW.company_id%'
     OR v_def NOT LIKE '%NEW.product_id = NEW.component_id%'
  THEN RAISE EXCEPTION 'BOM tenant validation missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.production_bom'::regclass
      AND tgname = 'tr_validate_production_bom_tenancy'
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN RAISE EXCEPTION 'BOM validation trigger missing or disabled'; END IF;
END;
$$;
