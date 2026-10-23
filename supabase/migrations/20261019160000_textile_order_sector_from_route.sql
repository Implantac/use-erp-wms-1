-- ============================================================================
-- Correção: OP de fiação/malharia nascia com setor fixo 'Tecelagem'
--
-- Evidência (harness scripts/live-manager-journey.mjs, 2026-10-19):
--   create_textile_production_order gravava sector='Tecelagem' fixo; a OP de
--   fiação (fio 30 cardado) e a de malharia concluíam com setor errado,
--   poluindo filtros e relatórios por setor do gerente de produção.
--
-- Correção mínima (mesma assinatura, mesmos grants): o setor da OP passa a
-- ser o setor cadastrado na primeira operação do roteiro congelado
-- (production_steps.sector da empresa); sem cadastro, mantém 'Tecelagem',
-- preservando o comportamento atual das OPs de tecelagem.
-- Reversão: restaurar o corpo de 20261019110000 (setor volta a ser fixo).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_textile_production_order(
  p_product_id uuid,
  p_quantity numeric,
  p_idempotency_key text,
  p_priority text DEFAULT 'medium',
  p_due_date timestamptz DEFAULT NULL,
  p_work_center text DEFAULT NULL,
  p_sales_order_id uuid DEFAULT NULL,
  p_order_item_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_weaving_profile jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_branch_id uuid;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_product public.products%ROWTYPE;
  v_route public.production_routes%ROWTYPE;
  v_existing public.production_orders%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_next integer;
  v_order_number text;
  v_step_count integer;
  v_sector text := 'Tecelagem';
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501'; END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  PERFORM public.pcp_assert_actor_for_company(v_company_id);
  IF p_product_id IS NULL OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Produto e quantidade positiva são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_priority, 'medium') NOT IN ('urgent','high','medium','low') THEN
    RAISE EXCEPTION 'Prioridade inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.production_orders
   WHERE company_id = v_company_id AND creation_idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('production_order_id', v_existing.id, 'order_number', v_existing.order_number,
      'status', v_existing.status, 'idempotent_replay', true);
  END IF;
  IF p_sales_order_id IS NOT NULL AND p_order_item_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.production_orders
     WHERE company_id = v_company_id AND sales_order_id = p_sales_order_id AND order_item_id = p_order_item_id;
    IF FOUND THEN
      RETURN jsonb_build_object('production_order_id', v_existing.id, 'order_number', v_existing.order_number,
        'status', v_existing.status, 'idempotent_replay', true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_sales_order_id AND company_id = v_company_id) THEN
      RAISE EXCEPTION 'Pedido de venda não pertence à empresa' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.order_items WHERE id = p_order_item_id AND order_id = p_sales_order_id
        AND company_id = v_company_id AND product_id = p_product_id
    ) THEN RAISE EXCEPTION 'Item do pedido não corresponde ao produto da OP' USING ERRCODE = '42501'; END IF;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_bom WHERE company_id = v_company_id AND product_id = p_product_id
  ) THEN RAISE EXCEPTION 'Produto sem ficha de materiais (BOM); cadastre a estrutura antes de gerar a OP' USING ERRCODE = '23514'; END IF;

  IF v_product.production_route_id IS NOT NULL THEN
    SELECT * INTO v_route FROM public.production_routes
     WHERE id = v_product.production_route_id AND company_id = v_company_id AND product_id = p_product_id AND is_active;
  END IF;
  IF v_route.id IS NULL THEN
    SELECT * INTO v_route FROM public.production_routes
     WHERE company_id = v_company_id AND product_id = p_product_id AND is_active
     ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;
  IF v_route.id IS NULL THEN
    RAISE EXCEPTION 'Produto sem roteiro ativo; cadastre o roteiro de tecelagem antes de gerar a OP' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.production_route_steps WHERE route_id = v_route.id AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'Roteiro ativo sem etapas' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT rs.step_name FROM public.production_route_steps rs
     WHERE rs.route_id = v_route.id AND rs.company_id = v_company_id
     GROUP BY rs.step_name
     HAVING (SELECT count(*) FROM public.production_steps ps WHERE ps.company_id = v_company_id AND ps.name = rs.step_name AND ps.is_active) <> 1
  ) THEN RAISE EXCEPTION 'Cada etapa do roteiro exige exatamente uma operação ativa correspondente' USING ERRCODE = '23514'; END IF;

  -- Setor da OP = setor cadastrado na primeira operação do roteiro
  -- (configuração da empresa); sem cadastro, mantém 'Tecelagem' (legado).
  SELECT COALESCE(NULLIF(btrim(ps.sector), ''), 'Tecelagem')
    INTO v_sector
    FROM public.production_route_steps rs
    JOIN public.production_steps ps
      ON ps.company_id = rs.company_id AND ps.name = rs.step_name AND ps.is_active
   WHERE rs.route_id = v_route.id AND rs.company_id = v_company_id
   ORDER BY rs.sequence, rs.id
   LIMIT 1;
  v_sector := COALESCE(v_sector, 'Tecelagem');

  v_branch_id := public.get_user_branch_id(v_user_id);
  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = v_branch_id AND company_id = v_company_id
  ) THEN v_branch_id := NULL; END IF;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM public.branches
     WHERE company_id = v_company_id AND is_headquarters ORDER BY created_at, id LIMIT 1;
  END IF;

  INSERT INTO public.production_order_counters(company_id, counter_day, last_number)
  VALUES (v_company_id, CURRENT_DATE, 1)
  ON CONFLICT (company_id, counter_day) DO UPDATE
    SET last_number = public.production_order_counters.last_number + 1
  RETURNING last_number INTO v_next;
  v_order_number := 'OP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(v_next::text, 4, '0');

  INSERT INTO public.production_orders (
    id, company_id, branch_id, order_number, product_id, product_code, product_name,
    quantity, produced_quantity, rejected_quantity, unit, status, priority,
    due_date, work_center, sector, sales_order_id, order_item_id, client_id,
    client_name, route_id, creation_idempotency_key
  ) VALUES (
    gen_random_uuid(), v_company_id, v_branch_id, v_order_number, v_product.id, v_product.code, v_product.name,
    p_quantity, 0, 0, v_product.unit, 'planned', COALESCE(p_priority, 'medium'),
    p_due_date, NULLIF(btrim(p_work_center), ''), v_sector, p_sales_order_id,
    p_order_item_id, p_client_id, NULLIF(btrim(p_client_name), ''), v_route.id, v_key
  ) RETURNING * INTO v_order;


  SELECT count(*)::integer INTO v_step_count FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_company_id;
  IF v_order.route_id IS NULL OR v_step_count = 0 THEN
    RAISE EXCEPTION 'OP criada sem roteiro/etapas; transação revertida' USING ERRCODE = '23514';
  END IF;

  IF p_weaving_profile IS NOT NULL AND p_weaving_profile <> '{}'::jsonb THEN
    PERFORM public.pcp_apply_weaving_profile(v_order, p_weaving_profile);
  END IF;

  SELECT * INTO v_order FROM public.production_orders WHERE id = v_order.id;
  RETURN jsonb_build_object(
    'production_order_id', v_order.id, 'order_number', v_order.order_number,
    'status', v_order.status, 'route_id', v_order.route_id,
    'technical_snapshot_at', v_order.technical_snapshot_at,
    'technical_snapshot_hash', v_order.technical_snapshot_hash,
    'idempotent_replay', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_textile_production_order(uuid, numeric, text, text, timestamptz, text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_textile_production_order(uuid, numeric, text, text, timestamptz, text, uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
