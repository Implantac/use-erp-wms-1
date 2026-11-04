-- ============================================================================
-- Ordem de reprocesso rastreável (T86/P1, do manual PCP têxtil §8.9)
--
-- O retrabalho ganha registro próprio: uma OP de reprocesso vinculada à OP
-- original e ao lote original, com motivo e quantidade. A conclusão do
-- reprocesso consome o lote original e gera o lote resultante com aresta de
-- genealogia original -> resultante. A produção boa do reprocesso SUBSTITUI
-- a do lote original: ela não é somada como produção nova do artigo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.production_rework_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  original_order_id uuid NOT NULL REFERENCES public.production_orders(id),
  original_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  rework_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id),
  output_lot_id uuid REFERENCES public.stock_lots(id),
  quantity numeric(14,3) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_rework_orders_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120),
  CONSTRAINT production_rework_orders_quantity_check CHECK (quantity > 0),
  CONSTRAINT production_rework_orders_reason_check CHECK (length(btrim(reason)) >= 3),
  CONSTRAINT production_rework_orders_status_check
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT production_rework_orders_company_key_unique UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_production_rework_orders_lot
  ON public.production_rework_orders (company_id, original_lot_id, status);

ALTER TABLE public.production_rework_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_rework_orders_select ON public.production_rework_orders;
CREATE POLICY production_rework_orders_select ON public.production_rework_orders
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.production_rework_orders FROM PUBLIC, anon;
GRANT SELECT ON public.production_rework_orders TO authenticated;
GRANT ALL ON public.production_rework_orders TO service_role;

CREATE OR REPLACE FUNCTION public.create_rework_order(
  p_original_order_id uuid,
  p_original_lot_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_original public.production_orders%ROWTYPE;
  v_lot public.stock_lots%ROWTYPE;
  v_existing public.production_rework_orders%ROWTYPE;
  v_active numeric;
  v_created jsonb;
  v_rework public.production_rework_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência do reprocesso inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM public.production_rework_orders
   WHERE company_id = v_company_id AND idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'rework_id', v_existing.id,
      'rework_order_id', v_existing.rework_order_id,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do reprocesso' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade a reprocessar deve ser positiva' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original FROM public.production_orders WHERE id = p_original_order_id;
  IF NOT FOUND OR v_original.company_id <> v_company_id THEN
    RAISE EXCEPTION 'OP original não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_original.status IN ('cancelled', 'canceled') THEN
    RAISE EXCEPTION 'OP original cancelada não gera reprocesso' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_lot FROM public.stock_lots WHERE id = p_original_lot_id FOR UPDATE;
  IF NOT FOUND OR v_lot.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Lote original não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_lot.product_id <> v_original.product_id THEN
    RAISE EXCEPTION 'Lote original não é do produto da OP original' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(v_lot.status, '')) <> 'available' THEN
    RAISE EXCEPTION 'Lote % não está disponível para reprocesso (status: %)', v_lot.lot_number, v_lot.status
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(sum(quantity), 0) INTO v_active
    FROM public.production_rework_orders
   WHERE company_id = v_company_id AND original_lot_id = v_lot.id
     AND status IN ('planned', 'in_progress');
  IF v_active + p_quantity > v_lot.remaining_qty + 0.0005 THEN
    RAISE EXCEPTION 'Quantidade de reprocesso (ativa % + nova %) excede o saldo restante do lote % (%)',
      v_active, p_quantity, v_lot.lot_number, v_lot.remaining_qty USING ERRCODE = '22023';
  END IF;

  v_created := public.create_textile_production_order(
    v_lot.product_id, p_quantity, 'rework-op-' || v_key, 'high', NULL, NULL, NULL, NULL, NULL, NULL, '{}'::jsonb
  );

  INSERT INTO public.production_rework_orders (
    company_id, idempotency_key, original_order_id, original_lot_id,
    rework_order_id, quantity, reason, created_by
  ) VALUES (
    v_company_id, v_key, p_original_order_id, p_original_lot_id,
    (v_created ->> 'production_order_id')::uuid, p_quantity, v_reason, v_user_id
  ) RETURNING * INTO v_rework;

  RETURN jsonb_build_object(
    'rework_id', v_rework.id,
    'rework_order_id', v_rework.rework_order_id,
    'rework_order_number', v_created ->> 'order_number',
    'status', v_rework.status,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_rework_order(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rework_order(uuid, uuid, numeric, text, text) TO authenticated, service_role;

-- Conclusão do reprocesso: mesmas barreiras (etapas, qualidade) da conclusão
-- comum, consumindo o lote original e gerando o lote resultante com
-- genealogia. Não usa a BOM do artigo: o insumo é o próprio lote a refazer.
CREATE OR REPLACE FUNCTION public.complete_rework_order(
  p_rework_order_id uuid,
  p_idempotency_key text,
  p_produced_quantity numeric,
  p_rejected_quantity numeric DEFAULT 0,
  p_output_lot_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_order public.production_orders%ROWTYPE;
  v_rework public.production_rework_orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_lot public.stock_lots%ROWTYPE;
  v_canal public.canal_operacional := 'ATACADO_INDUSTRIA'::public.canal_operacional;
  v_step_count integer := 0;
  v_step_completed integer := 0;
  v_quality_count integer := 0;
  v_quality_approved numeric := 0;
  v_quality_blocked boolean := false;
  v_consumed numeric;
  v_output_lot_id uuid;
  v_output_lot_number text;
  v_completion_id uuid;
  v_movement_id uuid;
  v_existing_request public.production_completion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência da conclusão do reprocesso inválida' USING ERRCODE = '22023';
  END IF;
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade boa do reprocesso deve ser positiva' USING ERRCODE = '22023';
  END IF;
  IF p_rejected_quantity IS NULL OR p_rejected_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade rejeitada do reprocesso deve ser não negativa' USING ERRCODE = '22023';
  END IF;

  v_order := public.pcp_authorized_order(p_rework_order_id);

  SELECT * INTO v_rework
    FROM public.production_rework_orders
   WHERE rework_order_id = v_order.id AND company_id = v_order.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta OP não é uma ordem de reprocesso registrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_rework.status = 'completed' THEN
    SELECT * INTO v_existing_request
      FROM public.production_completion_requests
     WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
    RETURN jsonb_build_object(
      'completion_id', v_existing_request.id,
      'production_order_id', v_order.id,
      'output_lot_id', v_rework.output_lot_id,
      'produced_quantity', p_produced_quantity,
      'status', 'completed',
      'idempotent_replay', true
    );
  END IF;
  IF v_rework.status = 'cancelled' THEN
    RAISE EXCEPTION 'Reprocesso cancelado não pode ser concluído' USING ERRCODE = '55000';
  END IF;
  IF v_order.status NOT IN ('in_progress', 'finishing', 'quality_check') THEN
    RAISE EXCEPTION 'OP de reprocesso precisa estar em produção/acabamento/qualidade para concluir; status atual: %', v_order.status
      USING ERRCODE = '55000';
  END IF;

  v_consumed := v_rework.quantity;
  IF p_produced_quantity + p_rejected_quantity < v_consumed THEN
    RAISE EXCEPTION 'Quantidade processada (%) é parcial frente ao reprocesso planejado (%)', p_produced_quantity + p_rejected_quantity, v_consumed
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_product FROM public.products
   WHERE id = v_order.product_id AND company_id = v_order.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa' USING ERRCODE = '42501';
  END IF;
  v_canal := public.pcp_order_canal(v_order);

  PERFORM 1 FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id FOR UPDATE;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'completed' AND quantity_pending <= 0)::integer
    INTO v_step_count, v_step_completed
    FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_step_count = 0 OR v_step_completed <> v_step_count THEN
    RAISE EXCEPTION 'OP de reprocesso possui operação obrigatória pendente (% de % concluídas)', v_step_completed, v_step_count
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id FOR UPDATE;
  SELECT count(*) FILTER (WHERE lower(status) = 'approved')::integer,
         COALESCE(sum(approved_quantity) FILTER (WHERE lower(status) = 'approved'), 0),
         COALESCE(bool_or(lower(status) IN ('blocked','rejected','quarantine','bloqueada','bloqueado','rejeitada','rejeitado','quarentena')), false)
    INTO v_quality_count, v_quality_approved, v_quality_blocked
    FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_quality_count = 0 THEN
    RAISE EXCEPTION 'OP de reprocesso sem inspeção de qualidade aprovada não pode ser concluída' USING ERRCODE = '23514';
  END IF;
  IF v_quality_blocked THEN
    RAISE EXCEPTION 'OP de reprocesso possui inspeção bloqueada/rejeitada/em quarentena' USING ERRCODE = '23514';
  END IF;
  IF v_quality_approved < p_produced_quantity THEN
    RAISE EXCEPTION 'Quantidade aprovada na qualidade (%) é menor que a quantidade boa (%)', v_quality_approved, p_produced_quantity
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_lot FROM public.stock_lots WHERE id = v_rework.original_lot_id FOR UPDATE;
  IF lower(COALESCE(v_lot.status, '')) <> 'available' THEN
    RAISE EXCEPTION 'Lote % não está disponível (status: %)', v_lot.lot_number, v_lot.status USING ERRCODE = '23514';
  END IF;
  IF v_lot.remaining_qty < v_consumed THEN
    RAISE EXCEPTION 'Lote % possui saldo restante insuficiente (%, requerido %)', v_lot.lot_number, v_lot.remaining_qty, v_consumed
      USING ERRCODE = '23514';
  END IF;

  v_output_lot_number := COALESCE(
    NULLIF(btrim(p_output_lot_number), ''),
    'REPROC-' || v_order.order_number || '-' || upper(substr(md5(v_key), 1, 8))
  );
  IF EXISTS (SELECT 1 FROM public.stock_lots WHERE company_id = v_order.company_id AND lot_number = v_output_lot_number) THEN
    RAISE EXCEPTION 'Já existe lote com o número % nesta empresa', v_output_lot_number USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.stock_lots (
    company_id, product_id, product_code, product_name, lot_number,
    quantity, remaining_qty, initial_quantity, consumed_qty, received_qty,
    unit_cost, origin, origin_type, origin_reference, status, quality_status, notes
  ) VALUES (
    v_order.company_id, v_order.product_id, v_order.product_code, v_order.product_name,
    v_output_lot_number, p_produced_quantity, p_produced_quantity,
    p_produced_quantity, 0, p_produced_quantity, COALESCE(v_lot.unit_cost, 0),
    'Reprocesso OP ' || v_order.order_number, 'PRODUCAO', v_order.order_number,
    'available', 'approved',
    'Lote resultante de reprocesso do lote ' || v_lot.lot_number || '; motivo: ' || v_rework.reason
  ) RETURNING id INTO v_output_lot_id;

  INSERT INTO public.production_completion_requests (
    company_id, branch_id, production_order_id, idempotency_key, requested_by,
    produced_quantity, rejected_quantity, output_lot_id, output_unit_cost, status
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, v_key, v_user_id,
    p_produced_quantity, p_rejected_quantity, v_output_lot_id, COALESCE(v_lot.unit_cost, 0), 'completed'
  ) RETURNING id INTO v_completion_id;

  UPDATE public.stock_lots
     SET remaining_qty = remaining_qty - v_consumed,
         consumed_qty = COALESCE(consumed_qty, 0) + v_consumed,
         status = CASE WHEN remaining_qty - v_consumed <= 0 THEN 'consumed' ELSE status END,
         updated_at = now()
   WHERE id = v_lot.id AND company_id = v_order.company_id;

  INSERT INTO public.stock_movements (
    company_id, branch_id, canal_operacional, product_id, product_code,
    product_name, type, direction, quantity, unit_cost, total_cost,
    document_number, operator, source, origin, destination, reference,
    notes, lot_id, batch
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_canal, v_lot.product_id,
    v_lot.product_code, v_lot.product_name, 'production_consumption', 'out',
    v_consumed, COALESCE(v_lot.unit_cost, 0), v_consumed * COALESCE(v_lot.unit_cost, 0),
    'PROD-' || v_order.order_number, v_user_id::text, 'rework_completion',
    'rework_completion', 'OP ' || v_order.order_number,
    'production_order_id=' || v_order.id::text,
    'Consumo do lote original no reprocesso; completion_id=' || v_completion_id::text,
    v_lot.id, v_lot.lot_number
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.material_consumptions (
    company_id, production_order_id, order_number, component_code,
    component_name, expected_quantity, consumed_quantity, unit, batch,
    location, consumed_by, lot_id, completion_id, stock_movement_id
  ) VALUES (
    v_order.company_id, v_order.id, v_order.order_number, v_lot.product_code,
    v_lot.product_name, v_consumed, v_consumed, v_product.unit,
    v_lot.lot_number, v_lot.location, v_user_id::text, v_lot.id, v_completion_id, v_movement_id
  );

  INSERT INTO public.production_lot_genealogy (
    company_id, branch_id, production_order_id, completion_id, input_lot_id,
    output_lot_id, input_quantity, output_quantity, input_unit, output_unit,
    conversion_reference, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, v_completion_id,
    v_lot.id, v_output_lot_id, v_consumed, p_produced_quantity,
    v_product.unit, COALESCE(NULLIF(v_order.unit, ''), v_product.unit),
    'Reprocesso do lote ' || v_lot.lot_number || ': a quantidade boa substitui a do lote original, sem nova contagem de produção.',
    v_user_id
  );

  INSERT INTO public.stock_movements (
    company_id, branch_id, canal_operacional, product_id, product_code,
    product_name, type, direction, quantity, unit_cost, total_cost,
    document_number, operator, source, origin, destination, reference,
    notes, lot_id, batch
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_canal, v_order.product_id,
    v_order.product_code, v_order.product_name, 'production', 'in',
    p_produced_quantity, COALESCE(v_lot.unit_cost, 0), p_produced_quantity * COALESCE(v_lot.unit_cost, 0),
    'PROD-' || v_order.order_number, v_user_id::text, 'rework_completion',
    'OP ' || v_order.order_number, 'rework_completion',
    'production_order_id=' || v_order.id::text,
    'Entrada do lote resultante do reprocesso; completion_id=' || v_completion_id::text,
    v_output_lot_id, v_output_lot_number
  );

  UPDATE public.production_orders
     SET status = 'completed', produced_quantity = p_produced_quantity,
         rejected_quantity = p_rejected_quantity, completed_date = now(), updated_at = now()
   WHERE id = v_order.id AND company_id = v_order.company_id;

  UPDATE public.production_rework_orders
     SET status = 'completed', output_lot_id = v_output_lot_id, updated_at = now()
   WHERE id = v_rework.id;

  RETURN jsonb_build_object(
    'completion_id', v_completion_id,
    'production_order_id', v_order.id,
    'output_lot_id', v_output_lot_id,
    'output_lot_number', v_output_lot_number,
    'produced_quantity', p_produced_quantity,
    'rejected_quantity', p_rejected_quantity,
    'status', 'completed',
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_rework_order(uuid, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_rework_order(uuid, text, numeric, numeric, text) TO authenticated, service_role;

-- Mantém o status do registro de reprocesso alinhado ao da OP.
CREATE OR REPLACE FUNCTION public.sync_rework_order_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'cancelled' OR NEW.status = 'canceled' THEN
    UPDATE public.production_rework_orders
       SET status = 'cancelled', updated_at = now()
     WHERE rework_order_id = NEW.id AND status IN ('planned', 'in_progress');
  ELSIF NEW.status IN ('in_progress', 'finishing', 'quality_check') THEN
    UPDATE public.production_rework_orders
       SET status = 'in_progress', updated_at = now()
     WHERE rework_order_id = NEW.id AND status = 'planned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rework_order_status ON public.production_orders;
CREATE TRIGGER trg_sync_rework_order_status
  AFTER UPDATE OF status ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_rework_order_status();

COMMENT ON TABLE public.production_rework_orders IS
  'Reprocesso rastreável: OP original, lote original, motivo, OP de reprocesso e lote resultante.';
