-- ============================================================================
-- Expedição por rolo/peça (T81/P1)
--
-- A expedição já reservava/separava/expedia por lote. Agora o pedido pode
-- vincular rolos/peças específicos (embalados e aprovados) às reservas do
-- lote: ao separar, a alocação vira "picked"; ao expedir, a alocação e a
-- unidade viram "shipped". O saldo continua sendo o do lote — a unidade é a
-- identidade física daquilo que saiu.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_lot_unit_allocation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  unit_count integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lot_unit_allocation_requests_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120),
  CONSTRAINT stock_lot_unit_allocation_requests_count_check CHECK (unit_count > 0),
  CONSTRAINT stock_lot_unit_allocation_requests_company_key_unique UNIQUE (company_id, idempotency_key)
);

ALTER TABLE public.stock_lot_unit_allocation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_lot_unit_allocation_requests_select ON public.stock_lot_unit_allocation_requests;
CREATE POLICY stock_lot_unit_allocation_requests_select ON public.stock_lot_unit_allocation_requests
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.stock_lot_unit_allocation_requests FROM PUBLIC, anon;
GRANT SELECT ON public.stock_lot_unit_allocation_requests TO authenticated;
GRANT ALL ON public.stock_lot_unit_allocation_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.stock_lot_unit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.stock_lot_units(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.stock_reservations(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.stock_lot_unit_allocation_requests(id) ON DELETE SET NULL,
  quantity numeric(14,3) NOT NULL,
  status text NOT NULL DEFAULT 'allocated',
  allocated_by uuid REFERENCES public.profiles(id),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  shipped_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lot_unit_allocations_quantity_check CHECK (quantity > 0),
  CONSTRAINT stock_lot_unit_allocations_status_check
    CHECK (status IN ('allocated', 'picked', 'shipped', 'released'))
);

-- Uma unidade física só pode estar comprometida com um pedido por vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_lot_unit_allocations_active_unit
  ON public.stock_lot_unit_allocations (unit_id)
  WHERE status IN ('allocated', 'picked');
CREATE INDEX IF NOT EXISTS idx_stock_lot_unit_allocations_order
  ON public.stock_lot_unit_allocations (company_id, order_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_lot_unit_allocations_reservation
  ON public.stock_lot_unit_allocations (company_id, reservation_id, status);

ALTER TABLE public.stock_lot_unit_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_lot_unit_allocations_select ON public.stock_lot_unit_allocations;
CREATE POLICY stock_lot_unit_allocations_select ON public.stock_lot_unit_allocations
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.stock_lot_unit_allocations FROM PUBLIC, anon;
GRANT SELECT ON public.stock_lot_unit_allocations TO authenticated;
GRANT ALL ON public.stock_lot_unit_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_stock_lot_units_to_order(
  p_order_id uuid,
  p_unit_ids uuid[],
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
  v_order_company uuid;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_request public.stock_lot_unit_allocation_requests%ROWTYPE;
  v_request_id uuid;
  v_unit public.stock_lot_units%ROWTYPE;
  v_unit_id uuid;
  v_reservation public.stock_reservations%ROWTYPE;
  v_chosen_reservation uuid;
  v_chosen_status text;
  v_capacity numeric;
  v_existing numeric;
  v_allocation_ids uuid[] := ARRAY[]::uuid[];
  v_allocation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência da alocação de rolos inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
    FROM public.stock_lot_unit_allocation_requests
   WHERE company_id = v_company_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_request.order_id <> p_order_id THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada para outro pedido' USING ERRCODE = '23505';
    END IF;
    SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::uuid[]) INTO v_allocation_ids
      FROM public.stock_lot_unit_allocations WHERE request_id = v_request.id;
    RETURN jsonb_build_object(
      'order_id', v_request.order_id,
      'request_id', v_request.id,
      'allocation_ids', to_jsonb(v_allocation_ids),
      'unit_count', v_request.unit_count,
      'idempotent_replay', true
    );
  END IF;

  SELECT company_id INTO v_order_company FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_order_company <> v_company_id THEN
    RAISE EXCEPTION 'Pedido não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  IF p_unit_ids IS NULL OR cardinality(p_unit_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um rolo/peça para vincular ao pedido' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_unit_ids) > 200 THEN
    RAISE EXCEPTION 'Vincule no máximo 200 rolos/peças por envio' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT unit_id) FROM unnest(p_unit_ids) unit_id) <> cardinality(p_unit_ids) THEN
    RAISE EXCEPTION 'A lista de rolos/peças contém repetidos' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':unit-allocation:' || p_order_id::text, 0));

  INSERT INTO public.stock_lot_unit_allocation_requests (
    company_id, idempotency_key, order_id, unit_count, created_by
  ) VALUES (
    v_company_id, v_key, p_order_id, cardinality(p_unit_ids), v_user_id
  ) RETURNING id INTO v_request_id;

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT * INTO v_unit
      FROM public.stock_lot_units
     WHERE id = v_unit_id AND company_id = v_company_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rolo/peça não pertence à empresa do usuário' USING ERRCODE = '42501';
    END IF;
    IF v_unit.quality_status <> 'approved' THEN
      RAISE EXCEPTION 'O rolo/peça % precisa estar aprovado para ser vinculado ao pedido', v_unit.unit_code
        USING ERRCODE = '55000';
    END IF;
    IF v_unit.status <> 'packed' THEN
      RAISE EXCEPTION 'O rolo/peça % precisa estar embalado para ser vinculado ao pedido', v_unit.unit_code
        USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.stock_lot_unit_allocations
       WHERE unit_id = v_unit.id AND status IN ('allocated', 'picked', 'shipped')
    ) THEN
      RAISE EXCEPTION 'O rolo/peça % já está vinculado a um pedido', v_unit.unit_code USING ERRCODE = '23505';
    END IF;

    v_chosen_reservation := NULL;
    v_chosen_status := NULL;
    FOR v_reservation IN
      SELECT * FROM public.stock_reservations
       WHERE company_id = v_company_id AND order_id = p_order_id
         AND lot_id = v_unit.lot_id AND status IN ('reserved', 'picked')
       ORDER BY created_at
       FOR UPDATE
    LOOP
      SELECT COALESCE(sum(quantity), 0) INTO v_existing
        FROM public.stock_lot_unit_allocations
       WHERE reservation_id = v_reservation.id AND status IN ('allocated', 'picked');
      v_capacity := (CASE WHEN v_reservation.status = 'picked'
                          THEN COALESCE(v_reservation.picked_qty, 0)
                          ELSE COALESCE(v_reservation.reserved_qty, 0) END) - v_existing;
      IF v_unit.quantity <= v_capacity + 0.0005 THEN
        v_chosen_reservation := v_reservation.id;
        v_chosen_status := CASE WHEN v_reservation.status = 'picked' THEN 'picked' ELSE 'allocated' END;
        EXIT;
      END IF;
    END LOOP;

    IF v_chosen_reservation IS NULL THEN
      RAISE EXCEPTION 'O rolo/peça % (quantidade %) excede a reserva separável do lote neste pedido',
        v_unit.unit_code, v_unit.quantity USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.stock_lot_unit_allocations (
      company_id, unit_id, lot_id, order_id, reservation_id, request_id,
      quantity, status, allocated_by, picked_at
    ) VALUES (
      v_company_id, v_unit.id, v_unit.lot_id, p_order_id, v_chosen_reservation, v_request_id,
      v_unit.quantity, v_chosen_status, v_user_id,
      CASE WHEN v_chosen_status = 'picked' THEN now() ELSE NULL END
    ) RETURNING id INTO v_allocation_id;
    v_allocation_ids := array_append(v_allocation_ids, v_allocation_id);
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'request_id', v_request_id,
    'allocation_ids', to_jsonb(v_allocation_ids),
    'unit_count', cardinality(p_unit_ids),
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_stock_lot_units_to_order(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_stock_lot_units_to_order(uuid, uuid[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_stock_lot_unit_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_allocation public.stock_lot_unit_allocations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_allocation
    FROM public.stock_lot_unit_allocations
   WHERE id = p_allocation_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alocação de rolo/peça não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_allocation.status = 'shipped' THEN
    RAISE EXCEPTION 'Rolo/peça já expedido não pode ser liberado' USING ERRCODE = '55000';
  END IF;
  IF v_allocation.status = 'released' THEN
    RETURN to_jsonb(v_allocation);
  END IF;

  UPDATE public.stock_lot_unit_allocations
     SET status = 'released', released_at = now(), updated_at = now()
   WHERE id = v_allocation.id
   RETURNING * INTO v_allocation;
  RETURN to_jsonb(v_allocation);
END;
$$;

REVOKE ALL ON FUNCTION public.release_stock_lot_unit_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_stock_lot_unit_allocation(uuid) TO authenticated, service_role;

-- Separação: alocações vinculadas antes do picking acompanham a reserva.
CREATE OR REPLACE FUNCTION public.wms_pick_order_stock(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order_company uuid; v_order_number text;
  r RECORD; v_take numeric; v_remaining numeric; v_lot_number text; v_lot_remaining numeric;
  v_total_picked numeric := 0; v_lines_picked int := 0; v_lines_short int := 0;
BEGIN
  PERFORM set_config('app.stock_ledger_bypass','on', true);

  IF v_company IS NULL THEN RAISE EXCEPTION 'forbidden: user has no company'; END IF;
  SELECT company_id, number INTO v_order_company, v_order_number FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order_company <> v_company THEN RAISE EXCEPTION 'forbidden: cross-tenant order'; END IF;

  FOR r IN
    SELECT id, product_id, product_code, product_name, reserved_qty, picked_qty, lot_id
    FROM public.stock_reservations
    WHERE order_id = p_order_id AND company_id = v_company AND status = 'reserved'
    FOR UPDATE
  LOOP
    v_remaining := r.reserved_qty - COALESCE(r.picked_qty, 0);
    IF v_remaining <= 0 THEN CONTINUE; END IF;

    FOR v_take IN
      SELECT LEAST(sb.reserved_qty, v_remaining)
      FROM public.stock_balances sb
      WHERE sb.company_id = v_company AND sb.product_id = r.product_id AND sb.reserved_qty > 0
        AND (r.lot_id IS NULL OR sb.lot_id = r.lot_id)
      ORDER BY sb.created_at FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      UPDATE public.stock_balances sb
         SET reserved_qty = reserved_qty - v_take,
             quantity     = GREATEST(quantity - v_take, 0),
             last_movement_at = now(), updated_at = now()
       WHERE sb.company_id = v_company AND sb.product_id = r.product_id AND sb.reserved_qty >= v_take
         AND (r.lot_id IS NULL OR sb.lot_id = r.lot_id)
         AND ctid = (SELECT ctid FROM public.stock_balances
                     WHERE company_id = v_company AND product_id = r.product_id AND reserved_qty > 0
                       AND (r.lot_id IS NULL OR lot_id = r.lot_id)
                     ORDER BY created_at LIMIT 1);
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining = 0 THEN
      UPDATE public.stock_reservations SET status = 'picked', picked_qty = reserved_qty, updated_at = now() WHERE id = r.id;
      v_lines_picked := v_lines_picked + 1;
      v_total_picked := v_total_picked + r.reserved_qty;

      -- Rolos/peças vinculados a esta reserva são considerados separados.
      UPDATE public.stock_lot_unit_allocations
         SET status = 'picked', picked_at = COALESCE(picked_at, now()), updated_at = now()
       WHERE company_id = v_company AND order_id = p_order_id
         AND reservation_id = r.id AND status = 'allocated';

      v_lot_number := NULL;
      IF r.lot_id IS NOT NULL THEN
        UPDATE public.stock_lots
           SET remaining_qty = GREATEST(remaining_qty - r.reserved_qty, 0),
               status = CASE WHEN remaining_qty - r.reserved_qty <= 0 THEN 'consumed' ELSE status END,
               updated_at = now()
         WHERE id = r.lot_id AND company_id = v_company
         RETURNING lot_number INTO v_lot_number;
      END IF;
      INSERT INTO public.stock_movements
        (product_id, product_code, product_name, type, direction, quantity,
         reference, notes, operator, source, company_id, lot_id, batch)
      VALUES
        (r.product_id, r.product_code, r.product_name, 'outbound', 'transfer', r.reserved_qty,
         COALESCE(v_order_number, p_order_id::text),
         'Separação de pedido', COALESCE(auth.uid()::text,'system'), 'wms_pick', v_company,
         r.lot_id, v_lot_number);
    ELSE
      UPDATE public.stock_reservations SET picked_qty = reserved_qty - v_remaining, updated_at = now() WHERE id = r.id;
      v_lines_short := v_lines_short + 1;
      v_total_picked := v_total_picked + (r.reserved_qty - v_remaining);
    END IF;
  END LOOP;

  PERFORM set_config('app.stock_ledger_bypass','off', true);
  RETURN jsonb_build_object('order_id', p_order_id, 'lines_picked', v_lines_picked,
    'lines_short', v_lines_short, 'total_picked', v_total_picked);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.wms_pick_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_pick_order_stock(uuid) TO authenticated, service_role;

-- Expedição: reservas separadas viram expedidas e os rolos/peças alocados
-- são marcados como expedidos na mesma transação.
CREATE OR REPLACE FUNCTION public.wms_ship_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_order_company uuid;
  v_count int;
  v_units int := 0;
BEGIN
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'forbidden: user has no company';
  END IF;

  SELECT company_id INTO v_order_company FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order_company <> v_company THEN RAISE EXCEPTION 'forbidden: cross-tenant order'; END IF;

  UPDATE public.stock_reservations
     SET status = 'shipped',
         updated_at = now()
   WHERE order_id = p_order_id
     AND company_id = v_company
     AND status = 'picked';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  WITH shipped_allocations AS (
    UPDATE public.stock_lot_unit_allocations
       SET status = 'shipped', shipped_at = now(), updated_at = now()
     WHERE company_id = v_company AND order_id = p_order_id
       AND status IN ('allocated', 'picked')
     RETURNING unit_id
  )
  UPDATE public.stock_lot_units u
     SET status = 'shipped', shipped_at = now(), updated_at = now()
    FROM shipped_allocations sa
   WHERE u.id = sa.unit_id AND u.company_id = v_company;
  GET DIAGNOSTICS v_units = ROW_COUNT;

  RETURN jsonb_build_object('order_id', p_order_id, 'lines_shipped', v_count, 'units_shipped', v_units);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wms_ship_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_ship_order(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.stock_lot_unit_allocations IS
  'Vínculo de rolos/peças embalados a um pedido/reserva; a baixa de saldo continua no lote.';
