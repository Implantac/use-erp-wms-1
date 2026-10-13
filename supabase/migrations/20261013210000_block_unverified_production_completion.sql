-- Fail closed: completing an OP can trigger an automatic finished-stock entry.
-- Do not allow this before a server-side transaction proves materials, mandatory
-- operations, quality release, lot lineage, quantities and tenant authorization.
-- Existing completed orders and other updates are not rewritten by this migration.
CREATE OR REPLACE FUNCTION public.block_unverified_production_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION 'Conclusão de OP indisponível até validação transacional de consumo e qualidade'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Conclusão de OP indisponível até validação transacional de consumo e qualidade'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_unverified_production_completion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_unverified_production_completion ON public.production_orders;
CREATE TRIGGER tr_block_unverified_production_completion
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.block_unverified_production_completion();
