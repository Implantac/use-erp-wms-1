-- ============================================================================
-- Alertas operacionais AUTOMÁTICOS (operational_tasks)
--
-- Antes, a aba "Alertas" da Central da Loja só mostrava tarefas criadas à
-- mão (ou por seed): ninguém era avisado de solicitação recebida, remessa
-- chegando ou divergência. Agora o banco gera a tarefa no ato:
--   * transferência criada (SUGERIDA)  -> origem aprova/executa;
--   * remessa EM TRÂNSITO              -> destino confere o recebimento;
--   * recebimento PARCIAL/COM DIVERGÊNCIA -> destino trata as faltas;
--   * solicitação de abastecimento     -> almoxarifado analisa a origem;
--   * pedido intercompany (à fábrica)  -> gestor da indústria decide.
-- Sem duplicar: se já há tarefa pendente do mesmo tipo p/ a mesma origem,
-- não cria outra.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_alert_new_task(
  p_company uuid, p_branch uuid, p_category text, p_priority text,
  p_title text, p_description text, p_origin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_company IS NULL OR p_branch IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.operational_tasks
    WHERE origin_id = p_origin_id AND category = p_category AND status = 'pending'
  ) THEN RETURN; END IF;
  INSERT INTO public.operational_tasks (
    company_id, branch_id, title, description, priority, status,
    category, origin_type, origin_id
  ) VALUES (
    p_company, p_branch, p_title, p_description, p_priority, 'pending',
    p_category, 'stock_transfer', p_origin_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_alert_transfer_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_dest text;
BEGIN
  SELECT name INTO v_dest FROM public.branches WHERE id = NEW.destination_unit_id;
  PERFORM public.fn_alert_new_task(
    NEW.company_id, NEW.origin_unit_id, 'transfer', 'high',
    'Nova solicitação de transferência aguardando aprovação',
    'Destino: ' || COALESCE(v_dest, 'unidade') || '. Aprove para a origem separar e expedir.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_transfer_created ON public.stock_transfer_orders;
CREATE TRIGGER trg_alert_transfer_created
AFTER INSERT ON public.stock_transfer_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_alert_transfer_created();

CREATE OR REPLACE FUNCTION public.fn_alert_transfer_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_order public.stock_transfer_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.stock_transfer_orders WHERE id = NEW.transfer_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status::text = 'EM TRÂNSITO' THEN
    PERFORM public.fn_alert_new_task(
      v_order.company_id, v_order.destination_unit_id, 'receiving', 'high',
      'Mercadoria em trânsito chegando — conferir recebimento',
      'Confira item a item ao receber: o que faltar vira divergência automática.',
      v_order.id
    );
  ELSIF NEW.status::text IN ('RECEBIDA COM DIVERGÊNCIA', 'RECEBIDA PARCIAL') THEN
    PERFORM public.fn_alert_new_task(
      v_order.company_id, v_order.destination_unit_id, 'receiving', 'critical',
      'Recebimento com divergência — tratar as faltas',
      'Parte da remessa não chegou. Verifique a divergência registrada e acione a origem.',
      v_order.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_transfer_workflow ON public.stock_transfer_workflow_logs;
CREATE TRIGGER trg_alert_transfer_workflow
AFTER INSERT ON public.stock_transfer_workflow_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_alert_transfer_workflow();

CREATE OR REPLACE FUNCTION public.fn_alert_supply_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.fn_alert_new_task(
    NEW.company_id, NEW.requester_branch_id, 'transfer', 'high',
    'Solicitação de abastecimento aguardando análise',
    NEW.product_name || ' (' || NEW.quantity::text || ' un). Decida a origem: outra Loja, CD ou fábrica.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_supply_created ON public.supply_requests;
CREATE TRIGGER trg_alert_supply_created
AFTER INSERT ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_alert_supply_created();

CREATE OR REPLACE FUNCTION public.fn_alert_intercompany_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_branch uuid; v_loja text;
BEGIN
  SELECT id INTO v_branch FROM public.branches
  WHERE company_id = NEW.group_root_company_id
  ORDER BY is_headquarters DESC, created_at LIMIT 1;
  SELECT name INTO v_loja FROM public.companies WHERE id = NEW.requesting_company_id;
  PERFORM public.fn_alert_new_task(
    NEW.group_root_company_id, v_branch, 'transfer', 'high',
    'Pedido de Loja aguardando decisão da indústria',
    COALESCE(v_loja, 'Loja') || ' pediu ' || NEW.product_name || ' (' || NEW.quantity::text ||
      ' un). Decida: vender, transferir, remanejar ou produzir.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_intercompany_created ON public.intercompany_replenishment_requests;
CREATE TRIGGER trg_alert_intercompany_created
AFTER INSERT ON public.intercompany_replenishment_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_alert_intercompany_created();
