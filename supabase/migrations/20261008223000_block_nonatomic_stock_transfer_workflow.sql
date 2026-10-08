-- Fail closed until a single server-side, role-checked, idempotent transaction
-- persists order + items and transitions status + ledger + stock effects.
-- The old browser workflow executed these as separate HTTP requests and ignored
-- some stock RPC errors. Preserve existing records; do not rewrite history.
CREATE OR REPLACE FUNCTION public.block_nonatomic_stock_transfer_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' OR auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Criação de transferência indisponível até operação atômica no servidor'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Exclusão de transferência indisponível até auditoria do estoque'
        USING ERRCODE = '42501';
    ELSIF OLD.current_status IS DISTINCT FROM NEW.current_status THEN
      RAISE EXCEPTION 'Transição de transferência indisponível até conciliação transacional do estoque'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_nonatomic_stock_transfer_workflow() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_block_nonatomic_stock_transfer_workflow ON public.stock_transfer_orders;
CREATE TRIGGER tr_block_nonatomic_stock_transfer_workflow
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.block_nonatomic_stock_transfer_workflow();

-- SECURITY DEFINER adjust_stock allows a signed-in user to supply arbitrary
-- p_quantity/p_reserved without an authorized stock document. Contain it until
-- a server-side role/document/tenant-checked API replaces direct execution.
REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid,uuid,numeric,numeric,numeric) FROM authenticated, anon, PUBLIC;

-- Disallow fabricating/modifying transfer lines while the order workflow is frozen.
REVOKE INSERT, UPDATE, DELETE ON public.stock_transfer_items FROM authenticated;
