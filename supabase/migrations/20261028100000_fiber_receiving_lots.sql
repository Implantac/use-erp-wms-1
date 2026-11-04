-- ============================================================================
-- Recebimento estruturado de fibra/pluma (T81/P0)
--
-- Antes desta migration, a conferência de recebimento gravava o movimento
-- sem lot_id e o cadastro manual de lote não gerava saldo. Resultado: o lote
-- da pluma não era reservável pelo PCP.
--
-- Este lote fecha o elo sem criar um segundo ledger:
--   1) register_fiber_receipt cria o lote pendente de qualidade, grava a
--      classificação informada pela empresa e lança UM stock_movement com
--      lot_id; o trigger oficial apply_stock_movement_to_balance gera o saldo
--      daquele mesmo lote.
--   2) finalize_receiving_conference passa a vincular o movimento ao lote
--      conferido (criando o lote pendente quando ele ainda não existe).
--
-- Nenhum valor de umidade/classificação é presumido: campo ausente continua
-- NULL e significa apenas "não informado".
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fiber_lot_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL UNIQUE REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  bale_count integer,
  gross_weight_kg numeric(14,3),
  net_weight_kg numeric(14,3),
  moisture_pct numeric(6,2),
  micronaire numeric(8,3),
  staple_length_mm numeric(8,2),
  strength_g_tex numeric(8,2),
  trash_pct numeric(6,2),
  color_grade text,
  classification_grade text,
  classified_by uuid REFERENCES public.profiles(id),
  classified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiber_lot_classifications_bale_count_check
    CHECK (bale_count IS NULL OR bale_count >= 0),
  CONSTRAINT fiber_lot_classifications_gross_weight_check
    CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0),
  CONSTRAINT fiber_lot_classifications_net_weight_check
    CHECK (net_weight_kg IS NULL OR net_weight_kg >= 0),
  CONSTRAINT fiber_lot_classifications_weight_order_check
    CHECK (gross_weight_kg IS NULL OR net_weight_kg IS NULL OR net_weight_kg <= gross_weight_kg),
  CONSTRAINT fiber_lot_classifications_moisture_check
    CHECK (moisture_pct IS NULL OR (moisture_pct >= 0 AND moisture_pct <= 100)),
  CONSTRAINT fiber_lot_classifications_micronaire_check
    CHECK (micronaire IS NULL OR micronaire >= 0),
  CONSTRAINT fiber_lot_classifications_length_check
    CHECK (staple_length_mm IS NULL OR staple_length_mm >= 0),
  CONSTRAINT fiber_lot_classifications_strength_check
    CHECK (strength_g_tex IS NULL OR strength_g_tex >= 0),
  CONSTRAINT fiber_lot_classifications_trash_check
    CHECK (trash_pct IS NULL OR (trash_pct >= 0 AND trash_pct <= 100))
);

CREATE INDEX IF NOT EXISTS idx_fiber_lot_classifications_company
  ON public.fiber_lot_classifications (company_id, lot_id);

ALTER TABLE public.fiber_lot_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiber_lot_classifications_select ON public.fiber_lot_classifications;
CREATE POLICY fiber_lot_classifications_select ON public.fiber_lot_classifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.fiber_lot_classifications FROM PUBLIC, anon;
GRANT SELECT ON public.fiber_lot_classifications TO authenticated;
GRANT ALL ON public.fiber_lot_classifications TO service_role;

CREATE TABLE IF NOT EXISTS public.fiber_receipt_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id),
  lot_number text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiber_receipt_requests_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120),
  CONSTRAINT fiber_receipt_requests_quantity_check CHECK (quantity > 0),
  CONSTRAINT fiber_receipt_requests_company_key_unique UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fiber_receipt_requests_lot
  ON public.fiber_receipt_requests (company_id, lot_id);

ALTER TABLE public.fiber_receipt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiber_receipt_requests_select ON public.fiber_receipt_requests;
CREATE POLICY fiber_receipt_requests_select ON public.fiber_receipt_requests
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.fiber_receipt_requests FROM PUBLIC, anon;
GRANT SELECT ON public.fiber_receipt_requests TO authenticated;
GRANT ALL ON public.fiber_receipt_requests TO service_role;

-- Normaliza/valida o JSON de classificação. Continua sendo função interna:
-- as RPCs SECURITY DEFINER são a única porta de escrita.
CREATE OR REPLACE FUNCTION public.fiber_normalize_classification(p_classification jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_input jsonb := COALESCE(p_classification, '{}'::jsonb);
  v_bale_count integer;
  v_gross_weight numeric;
  v_net_weight numeric;
  v_moisture numeric;
  v_micronaire numeric;
  v_length numeric;
  v_strength numeric;
  v_trash numeric;
BEGIN
  IF jsonb_typeof(v_input) <> 'object' THEN
    RAISE EXCEPTION 'A classificação da fibra deve ser um objeto JSON' USING ERRCODE = '22023';
  END IF;

  v_bale_count := CASE
    WHEN NULLIF(v_input ->> 'bale_count', '') IS NULL THEN NULL
    ELSE (v_input ->> 'bale_count')::integer
  END;
  v_gross_weight := CASE
    WHEN NULLIF(v_input ->> 'gross_weight_kg', '') IS NULL THEN NULL
    ELSE (v_input ->> 'gross_weight_kg')::numeric
  END;
  v_net_weight := CASE
    WHEN NULLIF(v_input ->> 'net_weight_kg', '') IS NULL THEN NULL
    ELSE (v_input ->> 'net_weight_kg')::numeric
  END;
  v_moisture := CASE
    WHEN NULLIF(v_input ->> 'moisture_pct', '') IS NULL THEN NULL
    ELSE (v_input ->> 'moisture_pct')::numeric
  END;
  v_micronaire := CASE
    WHEN NULLIF(v_input ->> 'micronaire', '') IS NULL THEN NULL
    ELSE (v_input ->> 'micronaire')::numeric
  END;
  v_length := CASE
    WHEN NULLIF(v_input ->> 'staple_length_mm', '') IS NULL THEN NULL
    ELSE (v_input ->> 'staple_length_mm')::numeric
  END;
  v_strength := CASE
    WHEN NULLIF(v_input ->> 'strength_g_tex', '') IS NULL THEN NULL
    ELSE (v_input ->> 'strength_g_tex')::numeric
  END;
  v_trash := CASE
    WHEN NULLIF(v_input ->> 'trash_pct', '') IS NULL THEN NULL
    ELSE (v_input ->> 'trash_pct')::numeric
  END;

  IF v_bale_count IS NOT NULL AND v_bale_count < 0 THEN
    RAISE EXCEPTION 'A quantidade de fardos não pode ser negativa' USING ERRCODE = '22023';
  END IF;
  IF v_gross_weight IS NOT NULL AND v_gross_weight < 0 THEN
    RAISE EXCEPTION 'O peso bruto não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  IF v_net_weight IS NOT NULL AND v_net_weight < 0 THEN
    RAISE EXCEPTION 'O peso líquido não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  IF v_gross_weight IS NOT NULL AND v_net_weight IS NOT NULL AND v_net_weight > v_gross_weight THEN
    RAISE EXCEPTION 'O peso líquido não pode ser maior que o peso bruto' USING ERRCODE = '22023';
  END IF;
  IF v_moisture IS NOT NULL AND (v_moisture < 0 OR v_moisture > 100) THEN
    RAISE EXCEPTION 'A umidade deve ficar entre 0%% e 100%%' USING ERRCODE = '22023';
  END IF;
  IF v_micronaire IS NOT NULL AND v_micronaire < 0 THEN
    RAISE EXCEPTION 'O micronaire não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  IF v_length IS NOT NULL AND v_length < 0 THEN
    RAISE EXCEPTION 'O comprimento da fibra não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  IF v_strength IS NOT NULL AND v_strength < 0 THEN
    RAISE EXCEPTION 'A resistência da fibra não pode ser negativa' USING ERRCODE = '22023';
  END IF;
  IF v_trash IS NOT NULL AND (v_trash < 0 OR v_trash > 100) THEN
    RAISE EXCEPTION 'O teor de impurezas deve ficar entre 0%% e 100%%' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'bale_count', v_bale_count,
    'gross_weight_kg', v_gross_weight,
    'net_weight_kg', v_net_weight,
    'moisture_pct', v_moisture,
    'micronaire', v_micronaire,
    'staple_length_mm', v_length,
    'strength_g_tex', v_strength,
    'trash_pct', v_trash,
    'color_grade', NULLIF(btrim(COALESCE(v_input ->> 'color_grade', '')), ''),
    'classification_grade', NULLIF(btrim(COALESCE(v_input ->> 'classification_grade', '')), ''),
    'notes', NULLIF(btrim(COALESCE(v_input ->> 'notes', '')), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiber_normalize_classification(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiber_normalize_classification(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.register_fiber_receipt(
  p_product_id uuid,
  p_lot_number text,
  p_quantity_kg numeric,
  p_idempotency_key text,
  p_supplier_id uuid DEFAULT NULL,
  p_supplier_name text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_origin_reference text DEFAULT NULL,
  p_unit_cost numeric DEFAULT 0,
  p_branch_id uuid DEFAULT NULL,
  p_canal_operacional public.canal_operacional DEFAULT NULL,
  p_classification jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_product public.products%ROWTYPE;
  v_supplier_name text := NULLIF(btrim(COALESCE(p_supplier_name, '')), '');
  v_lot_number text := NULLIF(btrim(COALESCE(p_lot_number, '')), '');
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_existing_request public.fiber_receipt_requests%ROWTYPE;
  v_existing_lot public.stock_lots%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_canal public.canal_operacional;
  v_classification jsonb;
  v_has_classification boolean := false;
  v_lot_id uuid;
  v_balance_qty numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência do recebimento inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing_request
    FROM public.fiber_receipt_requests
   WHERE company_id = v_company_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing_request.product_id <> p_product_id
       OR v_existing_request.lot_number <> v_lot_number
       OR v_existing_request.quantity <> p_quantity_kg THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada em outro recebimento de fibra'
        USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_existing_lot FROM public.stock_lots WHERE id = v_existing_request.lot_id;
    SELECT COALESCE(sum(quantity), 0) INTO v_balance_qty
      FROM public.stock_balances
     WHERE company_id = v_company_id AND lot_id = v_existing_lot.id;

    RETURN jsonb_build_object(
      'lot_id', v_existing_lot.id,
      'lot_number', v_existing_lot.lot_number,
      'product_id', v_existing_lot.product_id,
      'quantity', v_existing_request.quantity,
      'remaining_qty', v_existing_lot.remaining_qty,
      'quality_status', v_existing_lot.quality_status,
      'balance_quantity', v_balance_qty,
      'idempotent_replay', true
    );
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o produto de fibra/pluma recebido' USING ERRCODE = '22023';
  END IF;
  IF v_lot_number IS NULL THEN
    RAISE EXCEPTION 'Informe o número do lote do fornecedor' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_kg IS NULL OR p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Informe o peso recebido em kg' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_unit_cost, 0) < 0 THEN
    RAISE EXCEPTION 'O custo unitário não pode ser negativo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = p_product_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  IF lower(COALESCE(v_product.unit, '')) NOT IN ('kg', 'quilo', 'quilograma') THEN
    RAISE EXCEPTION 'O produto da fibra/pluma deve estar cadastrado em kg para receber por peso'
      USING ERRCODE = '22023';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT name INTO v_supplier_name
      FROM public.suppliers
     WHERE id = p_supplier_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fornecedor não pertence à empresa do usuário' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Informe o fornecedor do lote' USING ERRCODE = '22023';
  END IF;

  v_classification := public.fiber_normalize_classification(p_classification);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_each(v_classification) item WHERE item.value <> 'null'::jsonb
  ) INTO v_has_classification;

  IF (v_classification ->> 'net_weight_kg') IS NOT NULL
     AND abs((v_classification ->> 'net_weight_kg')::numeric - p_quantity_kg) > 0.001 THEN
    RAISE EXCEPTION 'O peso líquido deve ser igual ao peso que entrará no estoque'
      USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_branch
      FROM public.branches
     WHERE id = p_branch_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Filial não pertence à empresa do usuário' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_branch
      FROM public.branches
     WHERE id = public.get_user_branch_id(v_user_id) AND company_id = v_company_id;
    IF NOT FOUND THEN
      SELECT * INTO v_branch
        FROM public.branches
       WHERE company_id = v_company_id AND is_headquarters
       ORDER BY created_at
       LIMIT 1;
    END IF;
  END IF;

  v_canal := COALESCE(p_canal_operacional, v_branch.canal_padrao, 'ATACADO_INDUSTRIA'::public.canal_operacional);

  -- Evita corrida de dois recebimentos simultâneos para o mesmo lote.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company_id::text || ':' || v_product.code || ':' || v_lot_number, 0));

  IF EXISTS (
    SELECT 1 FROM public.stock_lots
     WHERE company_id = v_company_id
       AND product_id = v_product.id
       AND lot_number = v_lot_number
  ) THEN
    RAISE EXCEPTION 'O lote % já existe para este produto. Use outro número ou registre a classificação no lote existente.', v_lot_number
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.stock_lots (
    company_id, product_id, product_code, product_name, lot_number,
    quantity, initial_quantity, received_qty, remaining_qty,
    supplier, supplier_id, location, unit_cost,
    status, quality_status, origin, origin_type, origin_reference,
    auto_generated
  ) VALUES (
    v_company_id, v_product.id, v_product.code, v_product.name, v_lot_number,
    p_quantity_kg, p_quantity_kg, p_quantity_kg, p_quantity_kg,
    v_supplier_name, p_supplier_id, NULLIF(btrim(COALESCE(p_location, '')), ''),
    COALESCE(p_unit_cost, 0),
    'available', 'pending', 'purchase', 'COMPRA',
    NULLIF(btrim(COALESCE(p_origin_reference, '')), ''), false
  ) RETURNING id INTO v_lot_id;

  IF v_has_classification THEN
    INSERT INTO public.fiber_lot_classifications (
      company_id, lot_id, bale_count, gross_weight_kg, net_weight_kg,
      moisture_pct, micronaire, staple_length_mm, strength_g_tex, trash_pct,
      color_grade, classification_grade, classified_by, classified_at, notes
    ) VALUES (
      v_company_id, v_lot_id,
      (v_classification ->> 'bale_count')::integer,
      (v_classification ->> 'gross_weight_kg')::numeric,
      (v_classification ->> 'net_weight_kg')::numeric,
      (v_classification ->> 'moisture_pct')::numeric,
      (v_classification ->> 'micronaire')::numeric,
      (v_classification ->> 'staple_length_mm')::numeric,
      (v_classification ->> 'strength_g_tex')::numeric,
      (v_classification ->> 'trash_pct')::numeric,
      v_classification ->> 'color_grade',
      v_classification ->> 'classification_grade',
      v_user_id, now(), v_classification ->> 'notes'
    );
  END IF;

  -- O ledger oficial é stock_movements. O trigger dele cria/atualiza
  -- stock_balances já com este lot_id — nenhum saldo paralelo é gravado aqui.
  INSERT INTO public.stock_movements (
    document_number, product_id, product_code, product_name,
    type, direction, quantity, unit_cost, total_cost,
    batch, reference, notes, operator, source,
    company_id, branch_id, canal_operacional, lot_id
  ) VALUES (
    COALESCE(NULLIF(btrim(COALESCE(p_origin_reference, '')), ''), v_lot_number),
    v_product.id, v_product.code, v_product.name,
    'receiving', 'in', p_quantity_kg, COALESCE(p_unit_cost, 0),
    p_quantity_kg * COALESCE(p_unit_cost, 0),
    v_lot_number,
    NULLIF(btrim(COALESCE(p_origin_reference, '')), ''),
    'Recebimento de fibra/pluma aguardando inspeção de qualidade',
    '', 'fiber_receipt',
    v_company_id, v_branch.id, v_canal, v_lot_id
  );

  INSERT INTO public.fiber_receipt_requests (
    company_id, idempotency_key, lot_id, product_id, lot_number, quantity, created_by
  ) VALUES (
    v_company_id, v_key, v_lot_id, v_product.id, v_lot_number, p_quantity_kg, v_user_id
  );

  SELECT COALESCE(sum(quantity), 0) INTO v_balance_qty
    FROM public.stock_balances
   WHERE company_id = v_company_id AND lot_id = v_lot_id;

  RETURN jsonb_build_object(
    'lot_id', v_lot_id,
    'lot_number', v_lot_number,
    'product_id', v_product.id,
    'quantity', p_quantity_kg,
    'remaining_qty', p_quantity_kg,
    'quality_status', 'pending',
    'balance_quantity', v_balance_qty,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_fiber_receipt(uuid, text, numeric, text, uuid, text, text, text, numeric, uuid, public.canal_operacional, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_fiber_receipt(uuid, text, numeric, text, uuid, text, text, text, numeric, uuid, public.canal_operacional, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.classify_fiber_lot(
  p_lot_id uuid,
  p_classification jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_lot public.stock_lots%ROWTYPE;
  v_classification jsonb;
  v_has_classification boolean := false;
  v_row public.fiber_lot_classifications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lot
    FROM public.stock_lots
   WHERE id = p_lot_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  v_classification := public.fiber_normalize_classification(p_classification);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_each(v_classification) item WHERE item.value <> 'null'::jsonb
  ) INTO v_has_classification;

  IF NOT v_has_classification THEN
    DELETE FROM public.fiber_lot_classifications WHERE lot_id = v_lot.id AND company_id = v_company_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.fiber_lot_classifications (
    company_id, lot_id, bale_count, gross_weight_kg, net_weight_kg,
    moisture_pct, micronaire, staple_length_mm, strength_g_tex, trash_pct,
    color_grade, classification_grade, classified_by, classified_at, notes
  ) VALUES (
    v_company_id, v_lot.id,
    (v_classification ->> 'bale_count')::integer,
    (v_classification ->> 'gross_weight_kg')::numeric,
    (v_classification ->> 'net_weight_kg')::numeric,
    (v_classification ->> 'moisture_pct')::numeric,
    (v_classification ->> 'micronaire')::numeric,
    (v_classification ->> 'staple_length_mm')::numeric,
    (v_classification ->> 'strength_g_tex')::numeric,
    (v_classification ->> 'trash_pct')::numeric,
    v_classification ->> 'color_grade',
    v_classification ->> 'classification_grade',
    v_user_id, now(), v_classification ->> 'notes'
  )
  ON CONFLICT (lot_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    bale_count = EXCLUDED.bale_count,
    gross_weight_kg = EXCLUDED.gross_weight_kg,
    net_weight_kg = EXCLUDED.net_weight_kg,
    moisture_pct = EXCLUDED.moisture_pct,
    micronaire = EXCLUDED.micronaire,
    staple_length_mm = EXCLUDED.staple_length_mm,
    strength_g_tex = EXCLUDED.strength_g_tex,
    trash_pct = EXCLUDED.trash_pct,
    color_grade = EXCLUDED.color_grade,
    classification_grade = EXCLUDED.classification_grade,
    classified_by = EXCLUDED.classified_by,
    classified_at = EXCLUDED.classified_at,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.classify_fiber_lot(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_fiber_lot(uuid, jsonb) TO authenticated, service_role;

-- A conferência WMS continua sendo uma porta válida de recebimento, mas o
-- movimento agora nasce amarrado ao lote conferido. Lote novo entra pendente
-- de qualidade; lote existente recebe o acréscimo sem trocar sua decisão.
CREATE OR REPLACE FUNCTION public.finalize_receiving_conference(_conference_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conf RECORD;
  v_recv RECORD;
  v_company uuid;
  v_missing int;
  v_inserted int := 0;
  v_item RECORD;
  v_lot public.stock_lots%ROWTYPE;
  v_lot_id uuid;
  v_supplier_id uuid;
BEGIN
  v_company := get_user_company_id(auth.uid());
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada';
  END IF;

  SELECT * INTO v_conf FROM public.wms_conference_records
  WHERE id = _conference_id AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conferência % não encontrada para esta empresa', _conference_id;
  END IF;

  IF v_conf.reference_type <> 'receiving' THEN
    RAISE EXCEPTION 'Conferência não é de recebimento (tipo: %)', v_conf.reference_type;
  END IF;

  IF v_conf.status = 'completed' THEN
    RAISE EXCEPTION 'Conferência % já foi finalizada', v_conf.conference_number;
  END IF;

  SELECT COUNT(*) INTO v_missing
  FROM public.wms_conference_items
  WHERE conference_id = _conference_id
    AND checked_qty > 0
    AND product_id IS NULL;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Existem % item(ns) conferido(s) sem produto vinculado. Vincule antes de finalizar.', v_missing;
  END IF;

  IF v_conf.reference_id IS NOT NULL THEN
    SELECT * INTO v_recv FROM public.wms_receiving_orders
    WHERE id = v_conf.reference_id AND company_id = v_company;
  END IF;

  IF v_recv.id IS NOT NULL AND NULLIF(btrim(COALESCE(v_recv.supplier, '')), '') IS NOT NULL THEN
    SELECT id INTO v_supplier_id
      FROM public.suppliers
     WHERE company_id = v_company
       AND lower(name) = lower(btrim(v_recv.supplier))
     ORDER BY created_at
     LIMIT 1;
  END IF;

  PERFORM set_config('app.stock_ledger_bypass', 'receiving_finalize', true);

  FOR v_item IN
    SELECT ci.*
    FROM public.wms_conference_items ci
    WHERE ci.conference_id = _conference_id
      AND ci.checked_qty > 0
      AND ci.product_id IS NOT NULL
  LOOP
    v_lot_id := NULL;

    IF NULLIF(btrim(COALESCE(v_item.lot_number, '')), '') IS NOT NULL THEN
      SELECT * INTO v_lot
        FROM public.stock_lots
       WHERE company_id = v_company
         AND lot_number = btrim(v_item.lot_number)
         AND product_code = v_item.product_code
       LIMIT 1;

      IF FOUND THEN
        IF v_lot.product_id IS NOT NULL AND v_lot.product_id <> v_item.product_id THEN
          RAISE EXCEPTION 'O lote % já pertence a outro produto', v_item.lot_number;
        END IF;

        UPDATE public.stock_lots
           SET product_id = COALESCE(product_id, v_item.product_id),
               quantity = COALESCE(quantity, 0) + v_item.checked_qty,
               initial_quantity = COALESCE(initial_quantity, quantity, 0) + v_item.checked_qty,
               received_qty = COALESCE(received_qty, 0) + v_item.checked_qty,
               remaining_qty = COALESCE(remaining_qty, 0) + v_item.checked_qty,
               supplier = COALESCE(supplier, NULLIF(btrim(COALESCE(v_recv.supplier, '')), '')),
               supplier_id = COALESCE(supplier_id, v_supplier_id),
               status = CASE
                 WHEN status = 'consumed' AND COALESCE(remaining_qty, 0) <= 0 THEN 'available'
                 ELSE status
               END,
               updated_at = now()
         WHERE id = v_lot.id;
        v_lot_id := v_lot.id;
      ELSE
        INSERT INTO public.stock_lots (
          company_id, product_id, product_code, product_name, lot_number,
          quantity, initial_quantity, received_qty, remaining_qty,
          supplier, supplier_id, unit_cost, status, quality_status,
          origin, origin_type, origin_reference, auto_generated
        ) VALUES (
          v_company, v_item.product_id, v_item.product_code, v_item.product_name,
          btrim(v_item.lot_number),
          v_item.checked_qty, v_item.checked_qty, v_item.checked_qty, v_item.checked_qty,
          NULLIF(btrim(COALESCE(v_recv.supplier, '')), ''), v_supplier_id, 0,
          'available', 'pending', 'purchase', 'COMPRA',
          COALESCE(v_recv.order_number, v_conf.reference_number), false
        ) RETURNING id INTO v_lot_id;
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      document_number, product_id, product_code, product_name,
      type, direction, quantity, unit_cost, total_cost,
      batch, reference, notes, operator, source,
      company_id, branch_id, canal_operacional, lot_id
    ) VALUES (
      COALESCE(v_conf.conference_number, ''),
      v_item.product_id,
      v_item.product_code,
      v_item.product_name,
      'receiving',
      'in',
      v_item.checked_qty,
      0, 0,
      v_item.lot_number,
      COALESCE(v_recv.order_number, v_conf.reference_number),
      'Recebimento finalizado via conferência ' || v_conf.conference_number,
      COALESCE(v_conf.operator, ''),
      'wms_receiving',
      v_company,
      v_recv.branch_id,
      v_recv.canal_operacional,
      v_lot_id
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  PERFORM set_config('app.stock_ledger_bypass', '', true);

  UPDATE public.wms_conference_records
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = _conference_id;

  IF v_recv.id IS NOT NULL THEN
    UPDATE public.wms_receiving_orders
       SET status = 'completed', received_date = now()
     WHERE id = v_recv.id;
  END IF;

  RETURN jsonb_build_object(
    'conference_id', _conference_id,
    'items_ledgered', v_inserted,
    'receiving_order_id', v_recv.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_receiving_conference(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_receiving_conference(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.fiber_lot_classifications IS
  'Classificação física informada no recebimento da fibra/pluma; ausência de valor significa não informado.';
COMMENT ON FUNCTION public.register_fiber_receipt(uuid, text, numeric, text, uuid, text, text, text, numeric, uuid, public.canal_operacional, jsonb) IS
  'Recebe fibra/pluma criando lote pendente de qualidade e movimento oficial com lot_id (o saldo nasce pelo trigger do ledger).';
