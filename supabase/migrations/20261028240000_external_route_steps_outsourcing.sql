-- ============================================================================
-- Make-or-buy: etapa externa (terceirizada) no roteiro da OP (T91/P1, manual §6)
--
-- A etapa do roteiro pode ser marcada como externa; a OP herda a marca no
-- snapshot das suas etapas. O envio ao fornecedor e o retorno passam a ser
-- registrados por etapa (outsourcing_orders.production_order_step_id) e o
-- banco bloqueia concluir uma etapa externa sem retorno do fornecedor que
-- cubra a quantidade boa apontada. Etapa não marcada segue interna, sem
-- nenhuma exigência nova.
-- ============================================================================

ALTER TABLE public.production_route_steps
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;
ALTER TABLE public.production_order_steps
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;

ALTER TABLE public.outsourcing_orders
  ADD COLUMN IF NOT EXISTS production_order_step_id uuid
    REFERENCES public.production_order_steps(id),
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.outsourcing_orders oo
   SET company_id = po.company_id
  FROM public.production_orders po
 WHERE po.id = oo.production_order_id AND oo.company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outsourcing_orders_company_key
  ON public.outsourcing_orders (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outsourcing_orders_step
  ON public.outsourcing_orders (production_order_step_id, status);

COMMENT ON COLUMN public.production_route_steps.is_external IS
  'Etapa executada por terceiro (make-or-buy), quando a empresa assim definir no roteiro.';
COMMENT ON COLUMN public.production_order_steps.is_external IS
  'Snapshot da etapa externa do roteiro nesta OP; conclusão exige retorno do fornecedor.';
COMMENT ON COLUMN public.outsourcing_orders.production_order_step_id IS
  'Etapa externa da OP à qual este envio/retorno pertence, quando houver.';

-- Geração das etapas da OP: mesmo corpo vigente (20261013214500), copiando
-- apenas a marca de etapa externa do roteiro para o snapshot da OP.
CREATE OR REPLACE FUNCTION public.generate_op_steps_from_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_route public.production_routes%ROWTYPE;
  v_route_step public.production_route_steps%ROWTYPE;
  v_step_id uuid;
  v_step_count integer;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_route
  FROM public.production_routes r
  WHERE r.product_id = NEW.product_id
    AND r.company_id = NEW.company_id
    AND r.is_active = true
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;
  IF v_route.id IS NULL THEN
    RETURN NEW; -- Planned OP without a configured route; not releasable as complete.
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id
      AND rs.company_id IS DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Roteiro da OP possui etapa sem vínculo válido à empresa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id AND rs.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Roteiro da OP não possui etapas válidas para a empresa'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.production_orders
    SET route_id = v_route.id
    WHERE id = NEW.id AND company_id = NEW.company_id;

  IF EXISTS (
    SELECT 1 FROM public.production_order_steps os
    WHERE os.production_order_id = NEW.id AND os.company_id = NEW.company_id
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_route_step IN
    SELECT rs.* FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id AND rs.company_id = NEW.company_id
    ORDER BY rs.sequence, rs.id
  LOOP
    SELECT count(*)::integer, (array_agg(ps.id ORDER BY ps.id))[1] INTO v_step_count, v_step_id
    FROM public.production_steps ps
    WHERE ps.name = v_route_step.step_name
      AND ps.company_id = NEW.company_id
      AND ps.is_active = true;
    IF v_step_count <> 1 THEN
      RAISE EXCEPTION 'Etapa do roteiro exige exatamente um cadastro ativo na empresa: %', v_route_step.step_name
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.production_order_steps (
      company_id, production_order_id, step_id, sequence,
      estimated_time_minutes, quantity_pending, status, is_external
    ) VALUES (
      NEW.company_id, NEW.id, v_step_id, v_route_step.sequence,
      v_route_step.setup_time_minutes + v_route_step.operation_time_minutes,
      NEW.quantity, 'pending', COALESCE(v_route_step.is_external, false)
    );
  END LOOP;

  UPDATE public.production_orders
    SET estimated_time_minutes = v_route.total_time_minutes
    WHERE id = NEW.id AND company_id = NEW.company_id AND estimated_time_minutes = 0;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_op_steps_from_route() FROM PUBLIC, anon, authenticated;

-- Bloqueio central: etapa externa não conclui sem retorno do fornecedor
-- cobrindo a quantidade boa apontada. Vale para qualquer caminho de
-- conclusão da etapa.
CREATE OR REPLACE FUNCTION public.guard_external_step_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_returned numeric;
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' AND NEW.is_external THEN
    SELECT COALESCE(sum(quantity_returned), 0) INTO v_returned
      FROM public.outsourcing_orders
     WHERE production_order_step_id = NEW.id;
    IF v_returned < NEW.quantity_produced THEN
      RAISE EXCEPTION 'Etapa externa não pode ser concluída: retorno do fornecedor (%) é menor que a quantidade boa apontada (%)',
        v_returned, NEW.quantity_produced USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_external_step_completion ON public.production_order_steps;
CREATE TRIGGER trg_guard_external_step_completion
  BEFORE UPDATE OF status ON public.production_order_steps
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_step_completion();

-- Envio de uma etapa externa ao fornecedor, com idempotência por empresa.
CREATE OR REPLACE FUNCTION public.send_order_step_to_supplier(
  p_step_id uuid,
  p_supplier_name text,
  p_quantity numeric,
  p_expected_return_date date DEFAULT NULL,
  p_service_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_step public.production_order_steps%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_supplier text := NULLIF(btrim(COALESCE(p_supplier_name, '')), '');
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_already_sent numeric;
  v_outsourcing public.outsourcing_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM public.production_order_steps WHERE id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa da OP não encontrada' USING ERRCODE = 'P0002';
  END IF;
  v_order := public.pcp_authorized_order(v_step.production_order_id);
  SELECT * INTO v_step FROM public.production_order_steps WHERE id = p_step_id FOR UPDATE;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_outsourcing FROM public.outsourcing_orders
     WHERE company_id = v_order.company_id AND idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('outsourcing_order_id', v_outsourcing.id,
        'production_order_step_id', v_step.id, 'status', v_outsourcing.status,
        'idempotent_replay', true);
    END IF;
  END IF;

  IF NOT v_step.is_external THEN
    RAISE EXCEPTION 'Etapa não está marcada como externa no roteiro desta OP' USING ERRCODE = '22023';
  END IF;
  IF v_step.status = 'completed' THEN
    RAISE EXCEPTION 'Etapa externa já concluída não recebe novo envio' USING ERRCODE = '55000';
  END IF;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'Informe o fornecedor do envio' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade enviada deve ser positiva' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(quantity_sent), 0) INTO v_already_sent
    FROM public.outsourcing_orders
   WHERE production_order_step_id = v_step.id;
  IF v_already_sent + p_quantity > v_step.quantity_pending + v_step.quantity_produced + 0.0005 THEN
    RAISE EXCEPTION 'Quantidade enviada (já enviada % + nova %) excede a quantidade da etapa (%)',
      v_already_sent, p_quantity, v_step.quantity_pending + v_step.quantity_produced
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outsourcing_orders (
    company_id, production_order_id, production_order_step_id, order_number,
    supplier_name, service_description, sent_date, expected_return_date,
    quantity_sent, quantity_returned, quantity_rejected, status, idempotency_key
  ) VALUES (
    v_order.company_id, v_order.id, v_step.id, v_order.order_number,
    v_supplier, NULLIF(btrim(COALESCE(p_service_description, '')), ''),
    CURRENT_DATE, p_expected_return_date,
    p_quantity, 0, 0, 'sent', v_key
  ) RETURNING * INTO v_outsourcing;

  RETURN jsonb_build_object('outsourcing_order_id', v_outsourcing.id,
    'production_order_step_id', v_step.id, 'status', v_outsourcing.status,
    'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.send_order_step_to_supplier(uuid, text, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_order_step_to_supplier(uuid, text, numeric, date, text, text) TO authenticated, service_role;

-- Retorno (total ou parcial) de um envio a fornecedor.
CREATE OR REPLACE FUNCTION public.receive_order_step_from_supplier(
  p_outsourcing_order_id uuid,
  p_quantity_returned numeric,
  p_quantity_rejected numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outsourcing public.outsourcing_orders%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_returned numeric;
  v_rejected numeric;
  v_status text;
BEGIN
  SELECT * INTO v_outsourcing FROM public.outsourcing_orders WHERE id = p_outsourcing_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envio a fornecedor não encontrado' USING ERRCODE = 'P0002';
  END IF;
  v_order := public.pcp_authorized_order(v_outsourcing.production_order_id);
  SELECT * INTO v_outsourcing FROM public.outsourcing_orders WHERE id = p_outsourcing_order_id FOR UPDATE;

  IF p_quantity_returned IS NULL OR p_quantity_returned < 0
     OR p_quantity_rejected IS NULL OR p_quantity_rejected < 0
     OR (p_quantity_returned = 0 AND p_quantity_rejected = 0) THEN
    RAISE EXCEPTION 'Informe a quantidade retornada e/ou rejeitada do retorno' USING ERRCODE = '22023';
  END IF;

  v_returned := COALESCE(v_outsourcing.quantity_returned, 0) + p_quantity_returned;
  v_rejected := COALESCE(v_outsourcing.quantity_rejected, 0) + p_quantity_rejected;
  IF v_returned + v_rejected > v_outsourcing.quantity_sent + 0.0005 THEN
    RAISE EXCEPTION 'Retorno (retornado % + rejeitado %) excede a quantidade enviada (%)',
      v_returned, v_rejected, v_outsourcing.quantity_sent USING ERRCODE = '22023';
  END IF;

  v_status := CASE
    WHEN v_returned + v_rejected >= v_outsourcing.quantity_sent THEN 'returned'
    ELSE 'partially_returned'
  END;

  UPDATE public.outsourcing_orders
     SET quantity_returned = v_returned,
         quantity_rejected = v_rejected,
         status = v_status,
         actual_return_date = CASE WHEN v_status = 'returned' THEN CURRENT_DATE ELSE actual_return_date END,
         updated_at = now()
   WHERE id = v_outsourcing.id
   RETURNING * INTO v_outsourcing;

  RETURN jsonb_build_object('outsourcing_order_id', v_outsourcing.id,
    'status', v_outsourcing.status,
    'quantity_returned', v_outsourcing.quantity_returned,
    'quantity_rejected', v_outsourcing.quantity_rejected);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_order_step_from_supplier(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_order_step_from_supplier(uuid, numeric, numeric) TO authenticated, service_role;
