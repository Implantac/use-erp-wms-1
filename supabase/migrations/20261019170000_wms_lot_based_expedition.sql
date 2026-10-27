-- ============================================================================
-- Expedição por lote (WMS): reserva, separação e movimento identificam o lote
--
-- Lacuna evidenciada na rodada 5 do gerente (scripts/live-manager-journey.mjs):
--   wms_reserve_order_stock reservava por produto sem lot_id e
--   wms_pick_order_stock baixava o saldo por produto gravando o movimento de
--   separação sem lote. Resultado: após expedir, stock_lots.remaining_qty não
--   baixava e era impossível afirmar qual lote foi para qual cliente.
--
-- Correção (mesmas assinaturas e retornos; um único ledger stock_movements):
--   1) wms_reserve_order_stock: FIFO por saldo passa a pular lote com
--      qualidade bloqueada/quarentena/rejeitada e grava lot_id na reserva
--      (saldos legados sem lote seguem com lot_id NULL — compatível);
--   2) wms_pick_order_stock: com lote amarrado, baixa SOMENTE o saldo daquele
--      lote, debita stock_lots.remaining_qty na separação (esgotou ->
--      'consumed', mesma semântica da conclusão de OP) e grava o movimento
--      com lot_id e batch=número do lote. direction='transfer' preservado:
--      nenhum outro caminho recontabiliza (o trigger apply_lot_movement é
--      opt-in via feature flag e ignora 'transfer').
--   wms_ship_order não muda: expedir é documental; a saída física é a separação.
-- Reversão: restaurar os corpos de 20260630161620 (reserve) e 20260721150915
-- (pick) — a expedição volta a ser por produto, sem identificação de lote.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.wms_reserve_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_order_company uuid;
  v_user uuid := auth.uid();
  v_item RECORD;
  v_bal RECORD;
  v_remaining numeric;
  v_take numeric;
  v_total_reserved numeric := 0;
  v_items_done int := 0;
  v_items_partial int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'company_not_found';
  END IF;

  SELECT company_id INTO v_order_company FROM public.orders WHERE id = p_order_id;
  IF v_order_company IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF v_order_company <> v_company THEN
    RAISE EXCEPTION 'cross_tenant_forbidden';
  END IF;

  -- Prevent duplicate active reservations for the same order
  IF EXISTS (
    SELECT 1 FROM public.stock_reservations
    WHERE order_id = p_order_id AND status IN ('pending','reserved')
  ) THEN
    RAISE EXCEPTION 'order_already_reserved';
  END IF;

  FOR v_item IN
    SELECT id, product_id, product_code, product_name, quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND company_id = v_company
  LOOP
    v_remaining := v_item.quantity;

    -- FIFO across balances with available stock
    FOR v_bal IN
      SELECT id, location_code, available_qty, reserved_qty, quantity, lot_id
      FROM public.stock_balances
      WHERE company_id = v_company
        AND (product_id = v_item.product_id OR product_code = v_item.product_code)
        AND stock_status = 'available'
        AND COALESCE(available_qty, quantity - reserved_qty) > 0
        -- Expedição por lote: lote bloqueado/quarentena/rejeitado nunca é reservado
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_lots l
           WHERE l.id = stock_balances.lot_id
             AND lower(COALESCE(l.quality_status, '')) IN (
               'blocked','quarantine','rejected','bloqueada','bloqueado',
               'rejeitada','rejeitado','quarentena'))
      ORDER BY created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, COALESCE(v_bal.available_qty, v_bal.quantity - v_bal.reserved_qty));

      UPDATE public.stock_balances
        SET reserved_qty = reserved_qty + v_take,
            updated_at = now()
      WHERE id = v_bal.id;

      INSERT INTO public.stock_reservations (
        company_id, order_id, order_item_id, product_id, product_code, product_name,
        requested_qty, reserved_qty, picked_qty, location, status, reserved_by, reserved_at, lot_id
      ) VALUES (
        v_company, p_order_id, v_item.id, v_item.product_id, v_item.product_code, v_item.product_name,
        v_item.quantity, v_take, 0, v_bal.location_code, 'reserved', v_user::text, now(), v_bal.lot_id
      );

      v_remaining := v_remaining - v_take;
      v_total_reserved := v_total_reserved + v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      -- Pending row for unfulfilled portion
      INSERT INTO public.stock_reservations (
        company_id, order_id, order_item_id, product_id, product_code, product_name,
        requested_qty, reserved_qty, picked_qty, status, reserved_by, reserved_at
      ) VALUES (
        v_company, p_order_id, v_item.id, v_item.product_id, v_item.product_code, v_item.product_name,
        v_remaining, 0, 0, 'pending', v_user::text, now()
      );
      v_items_partial := v_items_partial + 1;
    ELSE
      v_items_done := v_items_done + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'total_reserved', v_total_reserved,
    'items_fully_reserved', v_items_done,
    'items_partial', v_items_partial
  );
END;
$$;

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
        -- Com lote amarrado, baixa SOMENTE o saldo daquele lote; sem lote, FIFO legado
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

      -- Expedição por lote: baixa o lote separado e o identifica no movimento.
      -- direction='transfer' mantido: o ledger não recontabiliza o saldo (a baixa
      -- de saldo/lote é explícita aqui, um único caminho de escrita).
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

REVOKE EXECUTE ON FUNCTION public.wms_reserve_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_reserve_order_stock(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.wms_pick_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_pick_order_stock(uuid) TO authenticated, service_role;
