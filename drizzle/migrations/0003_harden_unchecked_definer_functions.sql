-- Faturamento sem checagem de empresa: não usado pela aplicação; bloqueado para usuários.
REVOKE EXECUTE ON FUNCTION public.process_invoice_atomic(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_invoice_atomic(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

-- Auditoria financeira varre todas as empresas: somente o serviço agendado executa.
REVOKE EXECUTE ON FUNCTION public.run_financial_audit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_financial_audit(text) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_stock_integrity(_company_id uuid)
 RETURNS TABLE(product_id uuid, balance_qty numeric, movement_sum numeric, divergence numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND _company_id IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
      RAISE EXCEPTION 'Acesso negado a esta empresa.';
    END IF;
    RETURN QUERY
    WITH movement_agg AS (
        SELECT m.product_id, SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END) as total_mov
        FROM public.stock_movements m WHERE m.company_id = _company_id GROUP BY m.product_id
    )
    SELECT sb.product_id, SUM(sb.quantity), COALESCE(ma.total_mov, 0), SUM(sb.quantity) - COALESCE(ma.total_mov, 0)
    FROM public.stock_balances sb LEFT JOIN movement_agg ma ON sb.product_id = ma.product_id
    WHERE sb.company_id = _company_id
    GROUP BY sb.product_id, ma.total_mov
    HAVING SUM(sb.quantity) - COALESCE(ma.total_mov, 0) != 0;
END;
$function$;