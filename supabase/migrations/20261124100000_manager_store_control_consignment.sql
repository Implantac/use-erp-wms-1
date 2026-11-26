-- ============================================================
-- Torre do Gestor de Lojas — módulo de CONSIGNADO + apoio à decisão
-- Data: 2026-11-24
--
-- Escopo:
--   1) Consignado fábrica → loja: envio, recebimento, venda,
--      patrocínio (peça cedida mesmo sendo consignada), transferência
--      entre lojas (remanejo por giro), devolução e liquidação.
--   2) Saldos por loja com disponibilidade e valor a liquidar.
--
-- Modelo: as peças consignadas entram no estoque FÍSICO da loja
-- (stock_movements + stock_balances, ledger único do sistema) e a
-- PROPRIEDADE é rastreada em consignment_* (a loja não é dona até
-- vender/liquidar). Venda consignada lança type='sale' — conta no
-- giro/demanda (get_branch_daily_demand). Patrocínio lança
-- type='sponsorship' — NÃO conta como demanda (não é venda).
-- ============================================================

-- 1) Envios (fábrica/CD → loja) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.consignment_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  origin_branch_id uuid NOT NULL REFERENCES public.branches(id),
  destination_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'EM_TRANSITO'
    CHECK (status IN ('EM_TRANSITO', 'RECEBIDA', 'CANCELADA')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  shipped_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consignment_shipment_diff_units CHECK (origin_branch_id <> destination_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_consignment_shipments_company
  ON public.consignment_shipments(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_shipments_destination
  ON public.consignment_shipments(destination_branch_id, status);

-- 2) Itens do envio ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.consignment_shipments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
  quantity_received numeric(15,4) NOT NULL DEFAULT 0,
  -- valor que a loja repassa à fábrica por peça vendida (preço de consignação)
  unit_consignment_price numeric(15,4) NOT NULL DEFAULT 0,
  -- preço sugerido de venda ao consumidor
  unit_retail_price numeric(15,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_items_shipment
  ON public.consignment_items(shipment_id);

-- 3) Saldos de consignação por loja × produto -------------------------------
CREATE TABLE IF NOT EXISTS public.consignment_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty_received numeric(15,4) NOT NULL DEFAULT 0,
  qty_sold numeric(15,4) NOT NULL DEFAULT 0,
  qty_sponsored numeric(15,4) NOT NULL DEFAULT 0,
  qty_returned numeric(15,4) NOT NULL DEFAULT 0,
  qty_transferred_in numeric(15,4) NOT NULL DEFAULT 0,
  qty_transferred_out numeric(15,4) NOT NULL DEFAULT 0,
  -- valor das peças ENCONTRADAS sob consignação nesta loja
  consigned_value numeric(15,2) NOT NULL DEFAULT 0,
  -- vendido em consignação (dívida da loja) e já liquidado (pagou)
  sold_value numeric(15,2) NOT NULL DEFAULT 0,
  settled_value numeric(15,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_consignment_balances_branch
  ON public.consignment_balances(branch_id);

-- 4) Livro de movimentações de consignação ----------------------------------
CREATE TABLE IF NOT EXISTS public.consignment_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  counterparty_branch_id uuid REFERENCES public.branches(id),
  product_id uuid REFERENCES public.products(id),
  shipment_id uuid REFERENCES public.consignment_shipments(id),
  movement_type text NOT NULL
    CHECK (movement_type IN (
      'ENVIO', 'RECEBIMENTO', 'VENDA', 'PATROCINIO',
      'DEVOLUCAO', 'TRANSFERENCIA_OUT', 'TRANSFERENCIA_IN', 'LIQUIDACAO'
    )),
  quantity numeric(15,4) NOT NULL DEFAULT 0,
  unit_price numeric(15,4) NOT NULL DEFAULT 0,
  value numeric(15,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consignment_movements_company
  ON public.consignment_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_movements_branch
  ON public.consignment_movements(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_movements_shipment
  ON public.consignment_movements(shipment_id);

-- 5) RLS: leitura company + branch; escrita SÓ por RPC (SECURITY DEFINER) ---
ALTER TABLE public.consignment_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consignment_shipments_select ON public.consignment_shipments;
CREATE POLICY consignment_shipments_select ON public.consignment_shipments
FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (
    public.is_matriz_viewer(auth.uid())
    OR origin_branch_id = public.get_user_branch_id(auth.uid())
    OR destination_branch_id = public.get_user_branch_id(auth.uid())
  )
);

DROP POLICY IF EXISTS consignment_items_select ON public.consignment_items;
CREATE POLICY consignment_items_select ON public.consignment_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.consignment_shipments s
    WHERE s.id = consignment_items.shipment_id
      AND s.company_id = public.get_user_company_id(auth.uid())
      AND (
        public.is_matriz_viewer(auth.uid())
        OR s.origin_branch_id = public.get_user_branch_id(auth.uid())
        OR s.destination_branch_id = public.get_user_branch_id(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS consignment_balances_select ON public.consignment_balances;
CREATE POLICY consignment_balances_select ON public.consignment_balances
FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (
    public.is_matriz_viewer(auth.uid())
    OR branch_id = public.get_user_branch_id(auth.uid())
  )
);

DROP POLICY IF EXISTS consignment_movements_select ON public.consignment_movements;
CREATE POLICY consignment_movements_select ON public.consignment_movements
FOR SELECT TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (
    public.is_matriz_viewer(auth.uid())
    OR branch_id = public.get_user_branch_id(auth.uid())
    OR counterparty_branch_id = public.get_user_branch_id(auth.uid())
  )
);

GRANT SELECT ON public.consignment_shipments TO authenticated;
GRANT SELECT ON public.consignment_items TO authenticated;
GRANT SELECT ON public.consignment_balances TO authenticated;
GRANT SELECT ON public.consignment_movements TO authenticated;
-- Sem GRANT de INSERT/UPDATE/DELETE: escrita apenas via RPC abaixo.

-- 6) View derivada (disponível + a liquidar), respeitando RLS da base -----
CREATE OR REPLACE VIEW public.v_consignment_balances
WITH (security_invoker = true) AS
SELECT
  cb.*,
  (cb.qty_received + cb.qty_transferred_in
     - cb.qty_sold - cb.qty_sponsored - cb.qty_returned - cb.qty_transferred_out
  ) AS qty_available,
  (cb.sold_value - cb.settled_value) AS pending_value
FROM public.consignment_balances cb;

-- 7) Helpers internos -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._consignment_available(
  p_received numeric, p_t_in numeric, p_sold numeric,
  p_sponsored numeric, p_returned numeric, p_t_out numeric
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_received + p_t_in - p_sold - p_sponsored - p_returned - p_t_out;
$$;

-- Valor unitário médio das peças sob consignação (para saídas)
CREATE OR REPLACE FUNCTION public._consignment_unit_value(
  p_company uuid, p_branch uuid, p_product uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN cb.consigned_value <= 0 THEN 0
    ELSE round(
      cb.consigned_value / nullif(
        public._consignment_available(
          cb.qty_received, cb.qty_transferred_in, cb.qty_sold,
          cb.qty_sponsored, cb.qty_returned, cb.qty_transferred_out
        ), 0
      ), 2)
  END
  FROM public.consignment_balances cb
  WHERE cb.company_id = p_company AND cb.branch_id = p_branch AND cb.product_id = p_product;
$$;

REVOKE ALL ON FUNCTION public._consignment_available(numeric, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._consignment_unit_value(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._consignment_unit_value(uuid, uuid, uuid) TO authenticated, service_role;

-- Disponibilidade física (saldo - reservado) na unidade
CREATE OR REPLACE FUNCTION public._physical_available(
  p_company uuid, p_branch uuid, p_product uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(sum(sb.quantity - sb.reserved_qty), 0)
  FROM public.stock_balances sb
  WHERE sb.company_id = p_company
    AND sb.branch_id = p_branch
    AND sb.product_id = p_product;
$$;

REVOKE ALL ON FUNCTION public._physical_available(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._physical_available(uuid, uuid, uuid) TO authenticated, service_role;

-- 8) RPC: envio em consignação (fábrica/CD → loja) --------------------------
CREATE OR REPLACE FUNCTION public.create_consignment_shipment(
  p_origin_branch uuid,
  p_destination_branch uuid,
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
  v_shipment uuid;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty numeric;
  v_price_consign numeric;
  v_price_retail numeric;
  v_avail numeric;
  v_origin public.branches%ROWTYPE;
  v_dest public.branches%ROWTYPE;
  v_canal public.canal_operacional;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_matriz_viewer(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o gestor da rede pode enviar peças em consignação' USING ERRCODE = '42501';
  END IF;
  IF p_origin_branch = p_destination_branch THEN
    RAISE EXCEPTION 'Origem e destino devem ser unidades diferentes' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_origin FROM public.branches
   WHERE id = p_origin_branch AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Origem não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_dest FROM public.branches
   WHERE id = p_destination_branch AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destino não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;
  IF v_dest.tipo NOT IN ('filial', 'STORE') THEN
    RAISE EXCEPTION 'Consignação tem por destino uma LOJA' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.consignment_shipments
    (company_id, origin_branch_id, destination_branch_id, status, notes, created_by)
  VALUES (v_company, p_origin_branch, p_destination_branch, 'EM_TRANSITO', p_notes, auth.uid())
  RETURNING id INTO v_shipment;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price_consign := COALESCE((v_item ->> 'unit_consignment_price')::numeric, 0);
    v_price_retail := COALESCE((v_item ->> 'unit_retail_price')::numeric, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida no item' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM public.products
     WHERE id = (v_item ->> 'product_id')::uuid AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não pertence à sua empresa' USING ERRCODE = '42501';
    END IF;

    v_avail := public._physical_available(v_company, p_origin_branch, v_product.id);
    IF v_avail < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente na origem para % (% disp., % solicitado)',
        v_product.code, v_avail, v_qty
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.consignment_items
      (shipment_id, product_id, product_code, product_name,
       quantity, unit_consignment_price, unit_retail_price)
    VALUES (v_shipment, v_product.id, v_product.code, v_product.name,
            v_qty, v_price_consign, v_price_retail);

    -- Saída física do estoque da origem (ledger único)
    v_canal := public.stock_balance_canal(v_company, p_origin_branch, v_product.id,
      CASE WHEN v_origin.tipo IN ('cd', 'DISTRIBUTION_CENTER', 'industria', 'FACTORY')
           THEN 'ATACADO_INDUSTRIA' ELSE 'VAREJO_PDV' END);

    INSERT INTO public.stock_movements
      (company_id, branch_id, product_id, product_code, product_name, quantity,
       direction, type, canal_operacional, reference, notes, operator, source)
    VALUES
      (v_company, p_origin_branch, v_product.id, v_product.code, v_product.name, v_qty,
       'out', 'consignment_out', v_canal, v_shipment::text,
       'Saída de peças em consignação para ' || v_dest.name, auth.uid()::text, 'consignment');

    INSERT INTO public.consignment_movements
      (company_id, branch_id, counterparty_branch_id, product_id, shipment_id,
       movement_type, quantity, unit_price, value, notes, created_by)
    VALUES
      (v_company, p_origin_branch, p_destination_branch, v_product.id, v_shipment,
       'ENVIO', v_qty, v_price_consign, round(v_qty * v_price_consign, 2),
       'Envio em consignação', auth.uid());
  END LOOP;

  RETURN jsonb_build_object(
    'shipment_id', v_shipment,
    'status', 'EM_TRANSITO',
    'items', jsonb_array_length(p_items)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_consignment_shipment(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_consignment_shipment(uuid, uuid, jsonb, text) TO authenticated, service_role;

-- 9) RPC: recebimento do envio pela loja ------------------------------------
-- p_received: NULL = recebe tudo; ou [{"product_id": "...", "quantity": n}]
CREATE OR REPLACE FUNCTION public.receive_consignment_shipment(
  p_shipment_id uuid,
  p_received jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_ship public.consignment_shipments%ROWTYPE;
  v_item public.consignment_items%ROWTYPE;
  v_qty numeric;
  v_override numeric;
  v_total int := 0;
  v_canal public.canal_operacional;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ship FROM public.consignment_shipments
   WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND OR v_ship.company_id <> v_company THEN
    RAISE EXCEPTION 'Envio não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_ship.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'Envio já foi recebido ou cancelado' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR v_ship.destination_branch_id = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Somente a loja destino pode receber este envio' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN
    SELECT * FROM public.consignment_items WHERE shipment_id = p_shipment_id
  LOOP
    v_qty := v_item.quantity;
    IF p_received IS NOT NULL AND jsonb_typeof(p_received) = 'array' THEN
      SELECT COALESCE((e ->> 'quantity')::numeric, v_qty)
        INTO v_override
        FROM jsonb_array_elements(p_received) e
       WHERE (e ->> 'product_id')::uuid = v_item.product_id
       LIMIT 1;
      IF FOUND AND v_override IS NOT NULL THEN
        v_qty := v_override;
      END IF;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    IF v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'Recebido maior que enviado para %', v_item.product_code
        USING ERRCODE = '22023';
    END IF;

    -- Entrada física no estoque da loja
    v_canal := public.stock_balance_canal(v_company, v_ship.destination_branch_id,
      v_item.product_id, 'VAREJO_PDV');

    INSERT INTO public.stock_movements
      (company_id, branch_id, product_id, product_code, product_name, quantity,
       direction, type, canal_operacional, reference, notes, operator, source)
    VALUES
      (v_company, v_ship.destination_branch_id, v_item.product_id,
       v_item.product_code, v_item.product_name, v_qty,
       'in', 'consignment_in', v_canal, p_shipment_id::text,
       'Recebimento de peças em consignação', auth.uid()::text, 'consignment');

    -- Saldo de propriedade da loja
    INSERT INTO public.consignment_balances
      (company_id, branch_id, product_id, qty_received, consigned_value, updated_at)
    VALUES
      (v_company, v_ship.destination_branch_id, v_item.product_id,
       v_qty, round(v_qty * v_item.unit_consignment_price, 2), now())
    ON CONFLICT (company_id, branch_id, product_id) DO UPDATE SET
      qty_received = public.consignment_balances.qty_received + EXCLUDED.qty_received,
      consigned_value = public.consignment_balances.consigned_value + EXCLUDED.consigned_value,
      updated_at = now();

    UPDATE public.consignment_items
       SET quantity_received = quantity_received + v_qty
     WHERE id = v_item.id;

    INSERT INTO public.consignment_movements
      (company_id, branch_id, counterparty_branch_id, product_id, shipment_id,
       movement_type, quantity, unit_price, value, notes, created_by)
    VALUES
      (v_company, v_ship.destination_branch_id, v_ship.origin_branch_id, v_item.product_id,
       p_shipment_id, 'RECEBIMENTO', v_qty, v_item.unit_consignment_price,
       round(v_qty * v_item.unit_consignment_price, 2),
       'Recebimento em consignação', auth.uid());

    v_total := v_total + 1;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nenhum item para receber' USING ERRCODE = '22023';
  END IF;

  UPDATE public.consignment_shipments
     SET status = 'RECEBIDA', received_at = now()
   WHERE id = p_shipment_id;

  RETURN jsonb_build_object('shipment_id', p_shipment_id, 'status', 'RECEBIDA', 'items', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_consignment_shipment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_consignment_shipment(uuid, jsonb) TO authenticated, service_role;

-- 10) RPC: venda de peça consignada (conta no giro da loja) ------------------
CREATE OR REPLACE FUNCTION public.register_consignment_sale(
  p_branch uuid,
  p_product uuid,
  p_quantity numeric,
  p_unit_price numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_bal public.consignment_balances%ROWTYPE;
  v_avail numeric;
  v_phys numeric;
  v_unit_value numeric;
  v_price numeric;
  v_canal public.canal_operacional;
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR p_branch = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para vender nesta unidade' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bal FROM public.consignment_balances
   WHERE company_id = v_company AND branch_id = p_branch AND product_id = p_product
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não há peças em consignação nesta unidade para o produto' USING ERRCODE = 'P0002';
  END IF;

  v_avail := public._consignment_available(
    v_bal.qty_received, v_bal.qty_transferred_in, v_bal.qty_sold,
    v_bal.qty_sponsored, v_bal.qty_returned, v_bal.qty_transferred_out);
  IF v_avail < p_quantity THEN
    RAISE EXCEPTION 'Disponível em consignação: % — solicitado %', v_avail, p_quantity
      USING ERRCODE = '22023';
  END IF;

  v_phys := public._physical_available(v_company, p_branch, p_product);
  IF v_phys < p_quantity THEN
    RAISE EXCEPTION 'Estoque físico insuficiente na unidade (% disp.)', v_phys
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product;
  v_price := COALESCE(NULLIF(p_unit_price, 0), v_bal.sold_value / NULLIF(v_bal.qty_sold, 0), 0);
  IF v_price IS NULL OR v_price <= 0 THEN
    v_price := COALESCE(v_product.cost_price, 0);
  END IF;
  v_unit_value := COALESCE(public._consignment_unit_value(v_company, p_branch, p_product), 0);

  -- Saída física contando como VENDA (entra na demanda/giro da loja)
  v_canal := public.stock_balance_canal(v_company, p_branch, p_product, 'VAREJO_PDV');
  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_branch, p_product, v_product.code, v_product.name, p_quantity,
     'out', 'sale', v_canal, 'consignment-sale',
     COALESCE(p_notes, 'Venda de peça consignada'), auth.uid()::text, 'consignment');

  UPDATE public.consignment_balances
     SET qty_sold = qty_sold + p_quantity,
         sold_value = sold_value + round(p_quantity * v_price, 2),
         consigned_value = greatest(0, consigned_value - round(p_quantity * v_unit_value, 2)),
         updated_at = now()
   WHERE id = v_bal.id;

  INSERT INTO public.consignment_movements
    (company_id, branch_id, product_id, movement_type, quantity, unit_price, value, notes, created_by)
  VALUES
    (v_company, p_branch, p_product, 'VENDA', p_quantity, v_price,
     round(p_quantity * v_price, 2), p_notes, auth.uid());

  RETURN jsonb_build_object(
    'qty_sold', p_quantity,
    'value', round(p_quantity * v_price, 2),
    'pending', (v_bal.sold_value + round(p_quantity * v_price, 2)) - v_bal.settled_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_consignment_sale(uuid, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_consignment_sale(uuid, uuid, numeric, numeric, text) TO authenticated, service_role;

-- 11) RPC: patrocínio — peça cedida (mesmo sendo consignada) ----------------
-- Sai do estoque da loja e é absorvido pela fábrica (não gera dívida da loja,
-- não conta como demanda/venda).
CREATE OR REPLACE FUNCTION public.register_consignment_sponsorship(
  p_branch uuid,
  p_product uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_bal public.consignment_balances%ROWTYPE;
  v_avail numeric;
  v_phys numeric;
  v_unit_value numeric;
  v_canal public.canal_operacional;
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR p_branch = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar nesta unidade' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bal FROM public.consignment_balances
   WHERE company_id = v_company AND branch_id = p_branch AND product_id = p_product
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não há peças em consignação nesta unidade para o produto' USING ERRCODE = 'P0002';
  END IF;

  v_avail := public._consignment_available(
    v_bal.qty_received, v_bal.qty_transferred_in, v_bal.qty_sold,
    v_bal.qty_sponsored, v_bal.qty_returned, v_bal.qty_transferred_out);
  IF v_avail < p_quantity THEN
    RAISE EXCEPTION 'Disponível em consignação: % — solicitado %', v_avail, p_quantity
      USING ERRCODE = '22023';
  END IF;

  v_phys := public._physical_available(v_company, p_branch, p_product);
  IF v_phys < p_quantity THEN
    RAISE EXCEPTION 'Estoque físico insuficiente na unidade (% disp.)', v_phys
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product;
  v_unit_value := COALESCE(public._consignment_unit_value(v_company, p_branch, p_product), 0);

  -- Patrocínio NÃO conta como demanda (type != sale/transfer/loss)
  v_canal := public.stock_balance_canal(v_company, p_branch, p_product, 'VAREJO_PDV');
  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_branch, p_product, v_product.code, v_product.name, p_quantity,
     'out', 'sponsorship', v_canal, 'consignment-sponsorship',
     COALESCE(p_notes, 'Peça consignada cedida em patrocínio'), auth.uid()::text, 'consignment');

  UPDATE public.consignment_balances
     SET qty_sponsored = qty_sponsored + p_quantity,
         consigned_value = greatest(0, consigned_value - round(p_quantity * v_unit_value, 2)),
         updated_at = now()
   WHERE id = v_bal.id;

  INSERT INTO public.consignment_movements
    (company_id, branch_id, product_id, movement_type, quantity, unit_price, value, notes, created_by)
  VALUES
    (v_company, p_branch, p_product, 'PATROCINIO', p_quantity, v_unit_value,
     round(p_quantity * v_unit_value, 2),
     COALESCE(p_notes, 'Patrocínio — custo absorvido pela fábrica'), auth.uid());

  RETURN jsonb_build_object('qty_sponsored', p_quantity, 'value', round(p_quantity * v_unit_value, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.register_consignment_sponsorship(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_consignment_sponsorship(uuid, uuid, numeric, text) TO authenticated, service_role;

-- 12) RPC: transferência de consignadas entre lojas (remanejo por giro) ------
CREATE OR REPLACE FUNCTION public.transfer_consignment_stock(
  p_from_branch uuid,
  p_to_branch uuid,
  p_product uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_from public.consignment_balances%ROWTYPE;
  v_avail numeric;
  v_phys numeric;
  v_unit_value numeric;
  v_canal_out public.canal_operacional;
  v_canal_in public.canal_operacional;
  v_product public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF p_from_branch = p_to_branch THEN
    RAISE EXCEPTION 'Origem e destino devem ser diferentes' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR p_from_branch = public.get_user_branch_id(auth.uid())
          OR p_to_branch = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para transferir entre estas unidades' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches
                  WHERE id = p_from_branch AND company_id = v_company)
     OR NOT EXISTS (SELECT 1 FROM public.branches
                     WHERE id = p_to_branch AND company_id = v_company) THEN
    RAISE EXCEPTION 'Unidades não pertencem à sua empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_from FROM public.consignment_balances
   WHERE company_id = v_company AND branch_id = p_from_branch AND product_id = p_product
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Origem não possui peças em consignação deste produto' USING ERRCODE = 'P0002';
  END IF;

  v_avail := public._consignment_available(
    v_from.qty_received, v_from.qty_transferred_in, v_from.qty_sold,
    v_from.qty_sponsored, v_from.qty_returned, v_from.qty_transferred_out);
  IF v_avail < p_quantity THEN
    RAISE EXCEPTION 'Disponível em consignação na origem: % — solicitado %', v_avail, p_quantity
      USING ERRCODE = '22023';
  END IF;

  v_phys := public._physical_available(v_company, p_from_branch, p_product);
  IF v_phys < p_quantity THEN
    RAISE EXCEPTION 'Estoque físico insuficiente na origem (% disp.)', v_phys
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product;
  v_unit_value := COALESCE(public._consignment_unit_value(v_company, p_from_branch, p_product), 0);

  -- Físico: sai da origem e entra no destino (ledger único)
  v_canal_out := public.stock_balance_canal(v_company, p_from_branch, p_product, 'VAREJO_PDV');
  v_canal_in := public.stock_balance_canal(v_company, p_to_branch, p_product, 'VAREJO_PDV');

  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_from_branch, p_product, v_product.code, v_product.name, p_quantity,
     'out', 'consignment_transfer_out', v_canal_out, 'consignment-transfer',
     COALESCE(p_notes, 'Transferência de consignada para outra loja'), auth.uid()::text, 'consignment');

  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_to_branch, p_product, v_product.code, v_product.name, p_quantity,
     'in', 'consignment_transfer_in', v_canal_in, 'consignment-transfer',
     COALESCE(p_notes, 'Transferência de consignada recebida'), auth.uid()::text, 'consignment');

  -- Propriedade: sai da origem e entra no destino com o valor embutido
  UPDATE public.consignment_balances
     SET qty_transferred_out = qty_transferred_out + p_quantity,
         consigned_value = greatest(0, consigned_value - round(p_quantity * v_unit_value, 2)),
         updated_at = now()
   WHERE id = v_from.id;

  INSERT INTO public.consignment_balances
    (company_id, branch_id, product_id, qty_transferred_in, consigned_value, updated_at)
  VALUES
    (v_company, p_to_branch, p_product, p_quantity, round(p_quantity * v_unit_value, 2), now())
  ON CONFLICT (company_id, branch_id, product_id) DO UPDATE SET
    qty_transferred_in = public.consignment_balances.qty_transferred_in + EXCLUDED.qty_transferred_in,
    consigned_value = public.consignment_balances.consigned_value + EXCLUDED.consigned_value,
    updated_at = now();

  INSERT INTO public.consignment_movements
    (company_id, branch_id, counterparty_branch_id, product_id,
     movement_type, quantity, unit_price, value, notes, created_by)
  VALUES
    (v_company, p_from_branch, p_to_branch, p_product,
     'TRANSFERENCIA_OUT', p_quantity, v_unit_value,
     round(p_quantity * v_unit_value, 2), p_notes, auth.uid());

  INSERT INTO public.consignment_movements
    (company_id, branch_id, counterparty_branch_id, product_id,
     movement_type, quantity, unit_price, value, notes, created_by)
  VALUES
    (v_company, p_to_branch, p_from_branch, p_product,
     'TRANSFERENCIA_IN', p_quantity, v_unit_value,
     round(p_quantity * v_unit_value, 2), p_notes, auth.uid());

  RETURN jsonb_build_object('qty', p_quantity, 'from', p_from_branch, 'to', p_to_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_consignment_stock(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_consignment_stock(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- 13) RPC: devolução de consignadas à fábrica/CD ----------------------------
CREATE OR REPLACE FUNCTION public.return_consignment_stock(
  p_branch uuid,
  p_to_branch uuid,
  p_product uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_bal public.consignment_balances%ROWTYPE;
  v_avail numeric;
  v_phys numeric;
  v_unit_value numeric;
  v_canal_out public.canal_operacional;
  v_canal_in public.canal_operacional;
  v_product public.products%ROWTYPE;
  v_dest public.branches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF p_branch = p_to_branch THEN
    RAISE EXCEPTION 'Origem e destino devem ser diferentes' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR p_branch = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para devolver nesta unidade' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dest FROM public.branches WHERE id = p_to_branch AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destino da devolução não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bal FROM public.consignment_balances
   WHERE company_id = v_company AND branch_id = p_branch AND product_id = p_product
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não há peças em consignação nesta unidade para o produto' USING ERRCODE = 'P0002';
  END IF;

  v_avail := public._consignment_available(
    v_bal.qty_received, v_bal.qty_transferred_in, v_bal.qty_sold,
    v_bal.qty_sponsored, v_bal.qty_returned, v_bal.qty_transferred_out);
  IF v_avail < p_quantity THEN
    RAISE EXCEPTION 'Disponível em consignação: % — solicitado %', v_avail, p_quantity
      USING ERRCODE = '22023';
  END IF;

  v_phys := public._physical_available(v_company, p_branch, p_product);
  IF v_phys < p_quantity THEN
    RAISE EXCEPTION 'Estoque físico insuficiente na unidade (% disp.)', v_phys
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product;
  v_unit_value := COALESCE(public._consignment_unit_value(v_company, p_branch, p_product), 0);

  v_canal_out := public.stock_balance_canal(v_company, p_branch, p_product, 'VAREJO_PDV');
  v_canal_in := public.stock_balance_canal(v_company, p_to_branch, p_product,
    CASE WHEN v_dest.tipo IN ('cd', 'DISTRIBUTION_CENTER', 'industria', 'FACTORY')
         THEN 'ATACADO_INDUSTRIA' ELSE 'VAREJO_PDV' END);

  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_branch, p_product, v_product.code, v_product.name, p_quantity,
     'out', 'consignment_return_out', v_canal_out, 'consignment-return',
     COALESCE(p_notes, 'Devolução de consignada'), auth.uid()::text, 'consignment');

  INSERT INTO public.stock_movements
    (company_id, branch_id, product_id, product_code, product_name, quantity,
     direction, type, canal_operacional, reference, notes, operator, source)
  VALUES
    (v_company, p_to_branch, p_product, v_product.code, v_product.name, p_quantity,
     'in', 'consignment_return_in', v_canal_in, 'consignment-return',
     COALESCE(p_notes, 'Devolução de consignada recebida'), auth.uid()::text, 'consignment');

  UPDATE public.consignment_balances
     SET qty_returned = qty_returned + p_quantity,
         consigned_value = greatest(0, consigned_value - round(p_quantity * v_unit_value, 2)),
         updated_at = now()
   WHERE id = v_bal.id;

  INSERT INTO public.consignment_movements
    (company_id, branch_id, counterparty_branch_id, product_id,
     movement_type, quantity, unit_price, value, notes, created_by)
  VALUES
    (v_company, p_branch, p_to_branch, p_product,
     'DEVOLUCAO', p_quantity, v_unit_value,
     round(p_quantity * v_unit_value, 2), p_notes, auth.uid());

  RETURN jsonb_build_object('qty', p_quantity, 'returned_to', p_to_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.return_consignment_stock(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_consignment_stock(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- 14) RPC: liquidação — loja paga à fábrica o que vendeu --------------------
CREATE OR REPLACE FUNCTION public.settle_consignment(
  p_branch uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_pending numeric;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa do usuário não identificada' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_matriz_viewer(auth.uid())
          OR public.has_role(auth.uid(), 'financeiro'::text)
          OR p_branch = public.get_user_branch_id(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar consignação' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(cb.sold_value - cb.settled_value), 0)
    INTO v_pending
    FROM public.consignment_balances cb
   WHERE cb.company_id = v_company AND cb.branch_id = p_branch;

  IF p_amount > v_pending + 0.009 THEN
    RAISE EXCEPTION 'Valor acima do pendente (a liquidar: %)', round(v_pending, 2)
      USING ERRCODE = '22023';
  END IF;

  -- Distribui o pagamento proporcionalmente aos produtos com saldo devedor
  UPDATE public.consignment_balances cb
     SET settled_value = least(
           cb.sold_value,
           cb.settled_value + round(
             p_amount * (cb.sold_value - cb.settled_value) / nullif(v_pending, 0), 2)
         ),
         updated_at = now()
   WHERE cb.company_id = v_company
     AND cb.branch_id = p_branch
     AND cb.sold_value > cb.settled_value;

  INSERT INTO public.consignment_movements
    (company_id, branch_id, movement_type, quantity, value, notes, created_by)
  VALUES
    (v_company, p_branch, 'LIQUIDACAO', 0, p_amount,
     COALESCE(p_notes, 'Liquidação de consignação vendida'), auth.uid());

  RETURN jsonb_build_object('settled', p_amount, 'pending_before', round(v_pending, 2));
END;
$$;

REVOKE ALL ON FUNCTION public.settle_consignment(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_consignment(uuid, numeric, text) TO authenticated, service_role;

-- 15) RPC: visão do gestor — posição de consignação por loja ----------------
CREATE OR REPLACE FUNCTION public.get_consignment_network()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_code text,
  product_name text,
  qty_available numeric,
  qty_sold numeric,
  qty_sponsored numeric,
  qty_returned numeric,
  consigned_value numeric,
  sold_value numeric,
  settled_value numeric,
  pending_value numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cb.branch_id, b.name::text, cb.product_id,
         COALESCE(p.code, '')::text, COALESCE(p.name, '')::text,
         public._consignment_available(
           cb.qty_received, cb.qty_transferred_in, cb.qty_sold,
           cb.qty_sponsored, cb.qty_returned, cb.qty_transferred_out),
         cb.qty_sold, cb.qty_sponsored, cb.qty_returned,
         cb.consigned_value, cb.sold_value, cb.settled_value,
         (cb.sold_value - cb.settled_value)
  FROM public.consignment_balances cb
  JOIN public.branches b ON b.id = cb.branch_id
  LEFT JOIN public.products p ON p.id = cb.product_id
  WHERE cb.company_id = public.get_user_company_id(auth.uid())
  ORDER BY b.name, p.name;
$$;

REVOKE ALL ON FUNCTION public.get_consignment_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_consignment_network() TO authenticated, service_role;
