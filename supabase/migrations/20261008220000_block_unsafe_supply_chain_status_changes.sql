-- Fail closed: the old client performed arbitrary authenticated status UPDATEs,
-- without role checks, expected-state CAS, inventory effects or legal transitions.
-- This is a temporary containment, NOT the final WMS transition implementation.
-- Keep historical statuses and existing rows untouched; privileged maintenance
-- still requires a separately audited operator/service-role procedure.
CREATE OR REPLACE FUNCTION public.block_unsafe_supply_chain_status_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND (current_user = 'authenticated' OR auth.role() = 'authenticated') THEN
    RAISE EXCEPTION 'Transição de movimentação indisponível até homologação da autorização e dos efeitos de estoque'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_unsafe_supply_chain_status_changes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_unsafe_supply_chain_status_changes ON public.supply_chain_movements;
CREATE TRIGGER tr_block_unsafe_supply_chain_status_changes
  BEFORE UPDATE OF status ON public.supply_chain_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_unsafe_supply_chain_status_changes();
