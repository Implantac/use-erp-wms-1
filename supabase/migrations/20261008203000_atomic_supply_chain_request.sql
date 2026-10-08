-- A single RPC statement runs in one PostgreSQL transaction: failed item
-- validation/insert rolls back the movement. SECURITY INVOKER preserves RLS.
-- Do not accept company_id or status from the caller.
CREATE OR REPLACE FUNCTION public.create_supply_chain_request(
  _origin_id uuid,
  _origin_type text,
  _destination_id uuid,
  _destination_type text,
  _priority text,
  _items jsonb
) RETURNS public.supply_chain_movements
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_movement public.supply_chain_movements%ROWTYPE;
  v_item record;
  v_count integer;
BEGIN
  v_company := public.get_user_company_id(auth.uid());
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa autenticada não identificada';
  END IF;
  IF _origin_id IS NULL OR _destination_id IS NULL OR _origin_id = _destination_id OR
     _origin_type NOT IN ('factory','warehouse','store') OR
     _destination_type NOT IN ('factory','warehouse','store') OR
     COALESCE(_priority, 'normal') NOT IN ('low','normal','high','critical') THEN
    RAISE EXCEPTION 'Origem, destino ou prioridade inválidos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _origin_id AND company_id = v_company AND is_active) OR
     NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _destination_id AND company_id = v_company AND is_active) THEN
    RAISE EXCEPTION 'Unidades não pertencem à empresa ativa ou estão inativas';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Itens devem ser uma lista';
  END IF;
  v_count := jsonb_array_length(_items);
  IF v_count < 1 OR v_count > 500 THEN
    RAISE EXCEPTION 'Informe entre 1 e 500 itens';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(_items)
    AS x(product_id uuid, requested_qty numeric, unit_price numeric)
  LOOP
    IF v_item.product_id IS NULL OR v_item.requested_qty IS NULL OR
       v_item.requested_qty <= 0 OR
       (v_item.unit_price IS NOT NULL AND v_item.unit_price < 0) OR
       NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_item.product_id AND company_id = v_company) THEN
      RAISE EXCEPTION 'Item inválido ou produto fora da empresa ativa';
    END IF;
  END LOOP;

  INSERT INTO public.supply_chain_movements (
    company_id, origin_id, origin_type, destination_id, destination_type,
    priority, status, items_count
  ) VALUES (
    v_company, _origin_id, _origin_type, _destination_id, _destination_type,
    COALESCE(_priority, 'normal'), 'requested', v_count
  ) RETURNING * INTO v_movement;

  INSERT INTO public.supply_chain_items (movement_id, product_id, requested_qty, unit_price)
  SELECT v_movement.id, x.product_id, x.requested_qty, x.unit_price
  FROM jsonb_to_recordset(_items) AS x(product_id uuid, requested_qty numeric, unit_price numeric);

  RETURN v_movement;
END;
$$;
REVOKE ALL ON FUNCTION public.create_supply_chain_request(uuid,text,uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supply_chain_request(uuid,text,uuid,text,text,jsonb) TO authenticated;
