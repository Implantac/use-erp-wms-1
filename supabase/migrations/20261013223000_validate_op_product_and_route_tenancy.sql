-- Fail closed for future OP identity/route assignments, including direct API writes.
-- Do not rewrite historical OPs or validate unrelated updates of legacy rows.
CREATE OR REPLACE FUNCTION public.validate_op_product_and_route_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_route_company uuid;
  v_route_product uuid;
BEGIN
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.route_id IS NOT NULL THEN
    SELECT r.company_id, r.product_id INTO v_route_company, v_route_product
    FROM public.production_routes r WHERE r.id = NEW.route_id;
    IF NOT FOUND OR v_route_company IS DISTINCT FROM NEW.company_id
      OR v_route_product IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'Roteiro da OP deve pertencer à empresa e ao produto da ordem'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_op_product_and_route_tenancy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_validate_op_product_and_route_tenancy ON public.production_orders;
CREATE TRIGGER tr_validate_op_product_and_route_tenancy
  BEFORE INSERT OR UPDATE OF company_id, product_id, route_id
  ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_op_product_and_route_tenancy();
