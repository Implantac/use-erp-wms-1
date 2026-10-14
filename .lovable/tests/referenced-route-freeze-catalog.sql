-- Run after migration on isolated staging. Catalog presence is not race proof.
DO $$
DECLARE v_assignment text; v_steps text;
BEGIN
  SELECT pg_get_functiondef('public.validate_op_product_and_route_tenancy()'::regprocedure) INTO v_assignment;
  SELECT pg_get_functiondef('public.block_referenced_route_step_mutation()'::regprocedure) INTO v_steps;
  IF v_assignment NOT LIKE '%NEW.route_id IS DISTINCT FROM OLD.route_id%'
     OR v_assignment NOT LIKE '%FOR UPDATE OF r%'
     OR v_steps NOT LIKE '%ORDER BY r.id FOR UPDATE OF r%'
  THEN RAISE EXCEPTION 'Route freeze/serialization logic absent'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE
      (tgrelid, tgname) IN (
        ('public.production_routes'::regclass, 'tr_block_referenced_route_mutation'),
        ('public.production_route_steps'::regclass, 'tr_block_referenced_route_step_mutation'))
      AND NOT tgisinternal AND tgenabled <> 'D') <> 2
  THEN RAISE EXCEPTION 'Referenced route freeze triggers absent or disabled'; END IF;
END;
$$;
