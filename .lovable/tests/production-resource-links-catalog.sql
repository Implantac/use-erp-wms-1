-- After migration in isolated staging. Structural assertion, not A/B proof.
DO $$
DECLARE v_line text; v_resource text;
BEGIN
  SELECT pg_get_functiondef('public.validate_production_line_links()'::regprocedure) INTO v_line;
  SELECT pg_get_functiondef('public.validate_production_resource_links()'::regprocedure) INTO v_resource;
  IF v_line NOT LIKE '%s.company_id = NEW.company_id%'
     OR v_resource NOT LIKE '%s.company_id = NEW.company_id%'
     OR v_resource NOT LIKE '%l.id = NEW.line_id AND l.company_id = NEW.company_id%'
  THEN RAISE EXCEPTION 'Production line/resource tenant validation incomplete'; END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE (tgrelid, tgname) IN (
        ('public.production_lines'::regclass, 'tr_validate_production_line_links'),
        ('public.production_resources'::regclass, 'tr_validate_production_resource_links'))
        AND NOT tgisinternal AND tgenabled <> 'D') <> 2
  THEN RAISE EXCEPTION 'Production line/resource validation triggers missing or disabled'; END IF;
END;
$$;
