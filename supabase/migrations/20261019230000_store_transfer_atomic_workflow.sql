-- ============================================================================
-- Fluxo operacional de lojas: a transação atômica de transferência.
--
-- Contexto (achado da revisão do fluxo de lojas): a migration
-- 20261008223000 CONGELOU `stock_transfer_orders` para `authenticated`
-- ("fail closed") até existir "uma única transação no servidor, com papel
-- checado e idempotente" — e ela nunca foi construída: a loja não consegue
-- nem criar a solicitação (INSERT bloqueado), e o front lança erro em
-- `transferWorkflow.transition`. Este lote entrega a transação prometida:
--
--  1. O gatilho de congelamento ganha a isenção oficial do projeto
--     (GUC transacional `app.stock_transfer_rpc = 'on'`, mesmo padrão de
--     `app.allow_tenant_link`): só as RPCs abaixo atravessam.
--  2. `create_stock_transfer_request`: pedido da loja atômico (ordem +
--     itens), status SUGERIDA — quem aprova é o gestor, não a loja.
--  3. `transition_stock_transfer`: máquina de estados no servidor (mesmo
--     mapa do front), com efeitos no LEDGER único (`stock_movements`):
--     EXPEDIDA baixa na origem; RECEBIDA* entra no destino com a
--     quantidade conferida (divergência recalculada no servidor);
--     histórico em `stock_transfer_workflow_logs` na mesma transação.
--  4. `register_stock_loss` / `register_inventory_count`: perda e contagem
--     da loja como documento de estoque (movimento no ledger), substituindo
--     o `adjust_stock` revogado.
--  5. Aposenta `process_stock_transfer` (gatilho de 2026-08 que esperava
--     status em inglês e escrevia saldo direto — nunca disparava com os
--     status em português e duplicaria o ledger).
--
-- Rollback: recriar o gatilho/função antigos a partir de 20260807142750,
-- remover a isenção do gatilho de congelamento e dropar as RPCs.
-- ============================================================================

-- 1) Isenção oficial no gatilho de congelamento ------------------------------
CREATE OR REPLACE FUNCTION public.block_nonatomic_stock_transfer_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Caminho oficial: RPCs atômicas deste lote sinalizam pela GUC da transação.
  IF current_setting('app.stock_transfer_rpc', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
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

-- 5) Aposenta o gatilho legado ----------------------------------------------
DROP TRIGGER IF EXISTS on_transfer_status_change ON public.stock_transfer_orders;
DROP FUNCTION IF EXISTS public.process_stock_transfer();

-- Canal com saldo real do produto numa unidade (para o ledger acertar a linha)
CREATE OR REPLACE FUNCTION public.stock_balance_canal(p_company uuid, p_branch uuid, p_product uuid, p_default text)
RETURNS public.canal_operacional
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_canal public.canal_operacional;
BEGIN
  SELECT canal_operacional INTO v_canal FROM public.stock_balances
   WHERE company_id = p_company AND branch_id = p_branch AND product_id = p_product
   ORDER BY quantity DESC LIMIT 1;
  RETURN COALESCE(v_canal, p_default::public.canal_operacional);
END;
$$;
REVOKE ALL ON FUNCTION public.stock_balance_canal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 2) Criação atômica da solicitação ------------------------------------------
CREATE OR REPLACE FUNCTION public.create_stock_transfer_request(
  p_origin_unit_id uuid,
  p_destination_unit_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_id uuid;
  v_item jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_origin_unit_id = p_destination_unit_id THEN
    RAISE EXCEPTION 'Origem e destino devem ser unidades diferentes' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_origin_unit_id AND company_id = v_company)
     OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_destination_unit_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Unidades não pertencem à sua empresa' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.stock_transfer_rpc', 'on', true);
  INSERT INTO public.stock_transfer_orders (
    company_id, origin_unit_id, destination_unit_id, current_status, requested_by, notes
  ) VALUES (v_company, p_origin_unit_id, p_destination_unit_id, 'SUGERIDA', auth.uid(), p_notes)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE id = (v_item ->> 'product_id')::uuid AND company_id = v_company
    ) THEN
      RAISE EXCEPTION 'Produto % não pertence à sua empresa', v_item ->> 'product_id' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty)
    VALUES (v_id, (v_item ->> 'product_id')::uuid, (v_item ->> 'quantity')::numeric);
  END LOOP;

  INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, notes)
  VALUES (v_id, auth.uid(), 'SUGERIDA', p_notes);

  RETURN jsonb_build_object('id', v_id, 'status', 'SUGERIDA');
END;
$$;
REVOKE ALL ON FUNCTION public.create_stock_transfer_request(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_request(uuid, uuid, jsonb, text) TO authenticated, service_role;

-- 3) Transição atômica com efeitos no ledger ---------------------------------
CREATE OR REPLACE FUNCTION public.transition_stock_transfer(
  p_transfer_id uuid,
  p_to_status text,
  p_items jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order public.stock_transfer_orders%ROWTYPE;
  v_allowed text[];
  v_item record;
  v_qty numeric;
  v_moved numeric := 0;
  v_divergence numeric := 0;
  v_final_status text := p_to_status;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.stock_transfer_orders WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.company_id <> v_company THEN
    RAISE EXCEPTION 'Transferência de outra empresa' USING ERRCODE = '42501';
  END IF;

  -- Aprovar/rejeitar é decisão de gestor; o restante é operação da rede.
  IF p_to_status IN ('APROVADA', 'REJEITADA') AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = auth.uid() AND ur.company_id = v_company
       AND ur.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Aprovação/rejeição é decisão do gestor (admin/manager)' USING ERRCODE = '42501';
  END IF;

  v_allowed := CASE v_order.current_status::text
    WHEN 'SUGERIDA' THEN ARRAY['APROVADA', 'REJEITADA', 'CANCELADA']
    WHEN 'APROVADA' THEN ARRAY['RESERVADA', 'CANCELADA']
    WHEN 'RESERVADA' THEN ARRAY['SEPARAÇÃO', 'CANCELADA']
    WHEN 'SEPARAÇÃO' THEN ARRAY['CONFERÊNCIA', 'CANCELADA']
    WHEN 'CONFERÊNCIA' THEN ARRAY['EXPEDIDA', 'CANCELADA']
    WHEN 'EXPEDIDA' THEN ARRAY['EM TRÂNSITO']
    WHEN 'EM TRÂNSITO' THEN ARRAY['RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA']
    WHEN 'RECEBIDA' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'RECEBIDA PARCIAL' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'RECEBIDA COM DIVERGÊNCIA' THEN ARRAY['CONFERIDA', 'ENCERRADA']
    WHEN 'CONFERIDA' THEN ARRAY['ENCERRADA']
    ELSE ARRAY[]::text[]
  END;
  IF NOT (p_to_status = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Transição inválida: % -> %', v_order.current_status, p_to_status USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.stock_transfer_rpc', 'on', true);

  IF p_to_status = 'EXPEDIDA' THEN
    FOR v_item IN
      SELECT ti.id, ti.product_id, ti.requested_qty, p.code, p.name
        FROM public.stock_transfer_items ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transfer_id = v_order.id
    LOOP
      v_qty := COALESCE(
        NULLIF((SELECT (e ->> 'quantity')::numeric FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
                 WHERE (e ->> 'item_id')::uuid = v_item.id), NULL),
        v_item.requested_qty);
      UPDATE public.stock_transfer_items SET shipped_qty = v_qty WHERE id = v_item.id;
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        v_company, v_order.origin_unit_id, v_item.product_id, v_item.code, v_item.name, v_qty,
        'out', 'transfer_out',
        public.stock_balance_canal(v_company, v_order.origin_unit_id, v_item.product_id, 'ATACADO_INDUSTRIA'),
        v_order.id::text, 'Expedição de transferência entre unidades', auth.uid()::text, 'stock_transfer'
      );
      v_moved := v_moved + v_qty;
    END LOOP;
    UPDATE public.stock_transfer_orders SET shipped_at = now() WHERE id = v_order.id;
  END IF;

  IF p_to_status IN ('RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA') THEN
    FOR v_item IN
      SELECT ti.id, ti.product_id, ti.requested_qty, ti.shipped_qty, p.code, p.name
        FROM public.stock_transfer_items ti
        JOIN public.products p ON p.id = ti.product_id
       WHERE ti.transfer_id = v_order.id
    LOOP
      v_qty := COALESCE(
        NULLIF((SELECT (e ->> 'quantity')::numeric FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
                 WHERE (e ->> 'item_id')::uuid = v_item.id), NULL),
        v_item.shipped_qty, v_item.requested_qty);
      UPDATE public.stock_transfer_items SET received_qty = v_qty WHERE id = v_item.id;
      v_divergence := v_divergence + (COALESCE(v_item.shipped_qty, v_item.requested_qty) - v_qty);
      INSERT INTO public.stock_movements (
        company_id, branch_id, product_id, product_code, product_name, quantity,
        direction, type, canal_operacional, reference, notes, operator, source
      ) VALUES (
        v_company, v_order.destination_unit_id, v_item.product_id, v_item.code, v_item.name, v_qty,
        'in', 'transfer_in',
        public.stock_balance_canal(v_company, v_order.destination_unit_id, v_item.product_id, 'VAREJO_PDV'),
        v_order.id::text, 'Recebimento de transferência entre unidades', auth.uid()::text, 'stock_transfer'
      );
      v_moved := v_moved + v_qty;
    END LOOP;
    IF v_divergence > 0 AND p_to_status = 'RECEBIDA' THEN
      v_final_status := 'RECEBIDA COM DIVERGÊNCIA';
    END IF;
    UPDATE public.stock_transfer_orders SET received_at = now() WHERE id = v_order.id;
  END IF;

  UPDATE public.stock_transfer_orders
     SET current_status = v_final_status::public.transfer_workflow_status,
         approved_by = CASE WHEN p_to_status = 'APROVADA' THEN auth.uid() ELSE approved_by END
   WHERE id = v_order.id;

  INSERT INTO public.stock_transfer_workflow_logs (transfer_id, user_id, status, quantity, divergence, notes)
  VALUES (v_order.id, auth.uid(), v_final_status::public.transfer_workflow_status, v_moved, v_divergence, p_notes);

  RETURN jsonb_build_object(
    'id', v_order.id, 'from_status', v_order.current_status, 'status', v_final_status,
    'moved_quantity', v_moved, 'divergence', v_divergence
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transition_stock_transfer(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_stock_transfer(uuid, text, jsonb, text) TO authenticated, service_role;

-- 4) Perda e contagem como documento de estoque -------------------------------
CREATE OR REPLACE FUNCTION public.register_stock_loss(
  p_product_id uuid,
  p_branch_id uuid,
  p_quantity numeric,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade da perda deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stock_movements (
    company_id, branch_id, product_id, product_code, product_name, quantity,
    direction, type, canal_operacional, reference, notes, operator, source, adjustment_reason
  ) VALUES (
    v_company, p_branch_id, v_product.id, v_product.code, v_product.name, p_quantity,
    'out', 'loss',
    public.stock_balance_canal(v_company, p_branch_id, v_product.id, 'VAREJO_PDV'),
    'perda', p_notes, auth.uid()::text, 'store_loss', p_reason
  );
  RETURN jsonb_build_object('product_id', v_product.id, 'quantity', p_quantity, 'type', 'loss');
END;
$$;
REVOKE ALL ON FUNCTION public.register_stock_loss(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_stock_loss(uuid, uuid, numeric, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_inventory_count(
  p_product_id uuid,
  p_branch_id uuid,
  p_counted_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_product public.products%ROWTYPE;
  v_current numeric;
  v_delta numeric;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade contada inválida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Unidade não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM public.stock_balances
   WHERE company_id = v_company AND branch_id = p_branch_id AND product_id = p_product_id;
  v_delta := p_counted_quantity - v_current;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements (
      company_id, branch_id, product_id, product_code, product_name, quantity,
      direction, type, canal_operacional, reference, notes, operator, source, adjustment_reason
    ) VALUES (
      v_company, p_branch_id, v_product.id, v_product.code, v_product.name, abs(v_delta),
      CASE WHEN v_delta > 0 THEN 'in' ELSE 'out' END, 'inventory_count',
      public.stock_balance_canal(v_company, p_branch_id, v_product.id, 'VAREJO_PDV'),
      'inventario', p_notes, auth.uid()::text, 'store_inventory', 'contagem física'
    );
  END IF;

  RETURN jsonb_build_object(
    'product_id', v_product.id, 'system_quantity', v_current,
    'counted_quantity', p_counted_quantity, 'delta', v_delta
  );
END;
$$;
REVOKE ALL ON FUNCTION public.register_inventory_count(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_inventory_count(uuid, uuid, numeric, text) TO authenticated, service_role;
