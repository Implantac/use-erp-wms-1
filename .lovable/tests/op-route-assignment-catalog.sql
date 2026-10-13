-- Only after migration on isolated staging; catalog proof, not behavior proof.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.validate_op_product_and_route_tenancy()'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%p.company_id = NEW.company_id%'
    OR v_def NOT LIKE '%v_route_company IS DISTINCT FROM NEW.company_id%'
    OR v_def NOT LIKE '%v_route_product IS DISTINCT FROM NEW.product_id%'
  THEN
    RAISE EXCEPTION 'OP product/route validation is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.production_orders'::regclass
      AND tgname = 'tr_validate_op_product_and_route_tenancy'
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'OP identity/route validation trigger absent or disabled';
  END IF;
END;
$$;
