-- ============================================================================
-- Solicitação de abastecimento também avisa a FÁBRICA (empresa-raiz):
-- além da tarefa na Loja (analisar origem), nasce tarefa na indústria
-- "Loja solicitou reposição" — a fábrica enxerga toda reposição pedida.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_alert_supply_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_root uuid;
  v_root_branch uuid;
  v_loja text;
BEGIN
  PERFORM public.fn_alert_new_task(
    NEW.company_id, NEW.requester_branch_id, 'transfer', 'high',
    'Solicitação de abastecimento aguardando análise',
    NEW.product_name || ' (' || NEW.quantity::text || ' un). Decida a origem: outra Loja, CD ou fábrica.',
    NEW.id
  );

  v_root := public.company_group_root(NEW.company_id);
  IF v_root IS NOT NULL AND v_root <> NEW.company_id THEN
    SELECT id INTO v_root_branch FROM public.branches
    WHERE company_id = v_root
    ORDER BY is_headquarters DESC, created_at LIMIT 1;
    SELECT name INTO v_loja FROM public.companies WHERE id = NEW.company_id;
    PERFORM public.fn_alert_new_task(
      v_root, v_root_branch, 'replenishment', 'high',
      'Loja solicitou reposição de estoque',
      COALESCE(v_loja, 'Loja') || ' pediu ' || NEW.product_name || ' (' || NEW.quantity::text ||
        ' un). Analise se sai de outra Loja, do CD ou da fábrica.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;
