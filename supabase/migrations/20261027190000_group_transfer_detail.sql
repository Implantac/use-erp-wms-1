-- ============================================================================
-- Central de Abastecimento: o detalhe da transferência (itens + histórico)
-- precisa ser legível pelo gestor do grupo.
--
-- Problema: ao clicar numa transferência SOLICITADO, o detalhe abria vazio
-- ("Nenhum item encontrado" / "Nenhum histórico encontrado"), mesmo com o
-- cartão exibindo "1 ITENS". A contagem vinha da RPC group_transfer_orders
-- (SECURITY DEFINER), mas o detalhe lia stock_transfer_items,
-- stock_transfer_workflow_logs e products DIRETO pelo PostgREST — e as
-- policies dessas tabelas só liberam a própria empresa. Resultado: para as
-- transferências das lojas, o gestor do grupo recebia 0 linhas em silêncio.
--
-- Correção (mesmo padrão de group_transfer_orders/factory_inbox): leitura
-- via RPC SECURITY DEFINER com autorização no servidor:
--   - gestor do grupo (is_group_manager): qualquer transferência da malha
--     (empresa raiz + filhas);
--   - demais usuários: apenas transferências da própria empresa;
--   - sem sessão/empresa ou fora do alcance: erro 42501.
-- Somente leitura: não altera escrita, ledger nem policies existentes.
-- Rollback: DROP FUNCTION public.group_transfer_detail(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.group_transfer_detail(p_transfer_id uuid)
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
  v_order_company uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT o.company_id INTO v_order_company
    FROM public.stock_transfer_orders o
   WHERE o.id = p_transfer_id;

  IF v_order_company IS NULL THEN
    RAISE EXCEPTION 'Transferência não encontrada' USING ERRCODE = '42501';
  END IF;

  v_root := public.company_group_root(v_company);
  v_manager := public.is_group_manager(v_company);

  IF NOT (
    v_order_company = v_company
    OR (v_manager AND v_order_company IN (
      SELECT c.id FROM public.companies c
       WHERE c.id = v_root OR c.parent_company_id = v_root
    ))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta transferência' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
           'items', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', i.id,
                        'product_id', i.product_id,
                        'requested_qty', i.requested_qty,
                        'shipped_qty', i.shipped_qty,
                        'received_qty', i.received_qty,
                        'product_name', p.name,
                        'product_code', p.code,
                        'image_url', p.image_url
                      ) ORDER BY i.created_at, i.id)
               FROM public.stock_transfer_items i
               LEFT JOIN public.products p ON p.id = i.product_id
              WHERE i.transfer_id = p_transfer_id
           ), '[]'::jsonb),
           'history', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id', l.id,
                        'status', l.status::text,
                        'notes', l.notes,
                        'created_at', l.created_at
                      ) ORDER BY l.created_at, l.id)
               FROM public.stock_transfer_workflow_logs l
              WHERE l.transfer_id = p_transfer_id
           ), '[]'::jsonb)
         )
    INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.group_transfer_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_transfer_detail(uuid) TO authenticated, service_role;
