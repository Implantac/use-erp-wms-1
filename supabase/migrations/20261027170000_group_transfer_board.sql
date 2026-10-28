-- ============================================================================
-- Central de Abastecimento: o gestor do grupo precisa ENXERGAR as
-- transferencias das lojas de todo o grupo.
--
-- Problema: a RLS de stock_transfer_orders so libera a propria empresa
-- (company_id = get_user_company_id(auth.uid())). A Central consultava a
-- tabela direto pedindo as empresas do grupo, mas o PostgREST devolvia
-- apenas as linhas da empresa do gestor — resultado: a Fabrica via
-- "Fluxo: 0 / Solicitacoes: 0" enquanto a Loja via as proprias SUGERIDA.
--
-- Correcao (mesmo padrao da factory_inbox): leitura via RPC SECURITY
-- DEFINER com autorizacao no servidor:
--   - gestor do grupo (is_group_manager): transferencias da raiz e das
--     empresas filhas (a malha inteira);
--   - demais usuarios: apenas a propria empresa (o mesmo que a RLS ja da).
-- Nao altera nenhuma escrita nem o ledger; e somente leitura.
-- Rollback: DROP FUNCTION public.group_transfer_orders();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.group_transfer_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_root uuid;
  v_manager boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
             'id', o.id,
             'company_id', o.company_id,
             'origin_unit_id', o.origin_unit_id,
             'destination_unit_id', o.destination_unit_id,
             'current_status', o.current_status,
             'notes', o.notes,
             'created_at', o.created_at,
             'updated_at', o.updated_at,
             'items_count', (
               SELECT count(*)::int FROM public.stock_transfer_items i
                WHERE i.transfer_id = o.id
             )
           ) AS item,
           o.created_at
      FROM public.stock_transfer_orders o
     WHERE o.current_status NOT IN ('REJEITADA', 'CANCELADA')
       AND (
         (v_manager AND o.company_id IN (
           SELECT c.id FROM public.companies c
            WHERE c.id = v_root OR c.parent_company_id = v_root
         ))
         OR (NOT v_manager AND o.company_id = v_company)
       )
     ORDER BY o.created_at DESC
     LIMIT 200
  ) s;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.group_transfer_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_transfer_orders() TO authenticated, service_role;
