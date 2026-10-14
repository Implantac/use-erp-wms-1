-- Prospectively freeze route identity/steps once any OP references a route.
-- OP assignment and step changes lock the same route row to serialize races.
-- New technical revisions must use a NEW route ID. Historical OPs are not rewritten.
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
  IF TG_OP = 'UPDATE' AND OLD.route_id IS NOT NULL
     AND NEW.route_id IS DISTINCT FROM OLD.route_id THEN
    RAISE EXCEPTION 'OP com roteiro vinculado não pode trocar ou apagar a revisão técnica'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.route_id IS NOT NULL THEN
    SELECT r.company_id, r.product_id INTO v_route_company, v_route_product
    FROM public.production_routes r WHERE r.id = NEW.route_id
    FOR UPDATE OF r;
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

CREATE OR REPLACE FUNCTION public.block_referenced_route_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_orders o WHERE o.route_id = OLD.id) THEN
    RAISE EXCEPTION 'Roteiro vinculado a OP não pode ser editado ou excluído; crie nova revisão'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_referenced_route_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_referenced_route_mutation ON public.production_routes;
CREATE TRIGGER tr_block_referenced_route_mutation
  BEFORE UPDATE OR DELETE ON public.production_routes
  FOR EACH ROW EXECUTE FUNCTION public.block_referenced_route_mutation();

CREATE OR REPLACE FUNCTION public.block_referenced_route_step_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_route uuid;
  v_new_route uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_route := OLD.route_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_route := NEW.route_id; END IF;

  -- Lock parent rows in ID order; OP assignment locks the same row FOR UPDATE.
  PERFORM 1 FROM public.production_routes r
  WHERE r.id = ANY (ARRAY[v_old_route, v_new_route])
  ORDER BY r.id FOR UPDATE OF r;
  IF EXISTS (
    SELECT 1 FROM public.production_orders o
    WHERE o.route_id = ANY (ARRAY[v_old_route, v_new_route])
  ) THEN
    RAISE EXCEPTION 'Etapas de roteiro vinculado a OP não podem mudar; crie nova revisão'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_referenced_route_step_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_referenced_route_step_mutation ON public.production_route_steps;
CREATE TRIGGER tr_block_referenced_route_step_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.production_route_steps
  FOR EACH ROW EXECUTE FUNCTION public.block_referenced_route_step_mutation();
