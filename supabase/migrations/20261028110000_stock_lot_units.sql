-- ============================================================================
-- Rolos/peças como unidade física do lote (T81/P0)
--
-- A conclusão da OP cria um lote e o saldo. Faltava identificar cada rolo ou
-- peça dentro desse lote para inspecionar, localizar e embalar sem depender
-- apenas do total do lote.
--
-- stock_lot_units NÃO é um segundo ledger: a quantidade continua no lote e
-- em stock_balances. A unidade apenas subdivide fisicamente o lote; a soma
-- das unidades nunca pode passar da quantidade física registrada no lote.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stock_lot_unit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  unit_count integer NOT NULL,
  total_quantity numeric(14,3) NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lot_unit_requests_key_check
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120),
  CONSTRAINT stock_lot_unit_requests_count_check CHECK (unit_count > 0),
  CONSTRAINT stock_lot_unit_requests_quantity_check CHECK (total_quantity > 0),
  CONSTRAINT stock_lot_unit_requests_company_key_unique UNIQUE (company_id, idempotency_key)
);

ALTER TABLE public.stock_lot_unit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_lot_unit_requests_select ON public.stock_lot_unit_requests;
CREATE POLICY stock_lot_unit_requests_select ON public.stock_lot_unit_requests
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.stock_lot_unit_requests FROM PUBLIC, anon;
GRANT SELECT ON public.stock_lot_unit_requests TO authenticated;
GRANT ALL ON public.stock_lot_unit_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.stock_lot_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.stock_lot_unit_requests(id) ON DELETE SET NULL,
  production_order_id uuid REFERENCES public.production_orders(id) ON DELETE SET NULL,
  unit_code text NOT NULL,
  unit_type text NOT NULL DEFAULT 'roll',
  quantity numeric(14,3) NOT NULL,
  unit text NOT NULL DEFAULT 'UN',
  length_m numeric(14,3),
  width_cm numeric(14,3),
  weight_kg numeric(14,3),
  location text,
  status text NOT NULL DEFAULT 'available',
  quality_status text NOT NULL DEFAULT 'pending',
  inspection_notes text,
  inspected_by uuid REFERENCES public.profiles(id),
  inspected_at timestamptz,
  packed_at timestamptz,
  shipped_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lot_units_company_code_unique UNIQUE (company_id, unit_code),
  CONSTRAINT stock_lot_units_type_check
    CHECK (unit_type IN ('roll', 'piece', 'bale', 'package')),
  CONSTRAINT stock_lot_units_quantity_check CHECK (quantity > 0),
  CONSTRAINT stock_lot_units_length_check CHECK (length_m IS NULL OR length_m >= 0),
  CONSTRAINT stock_lot_units_width_check CHECK (width_cm IS NULL OR width_cm >= 0),
  CONSTRAINT stock_lot_units_weight_check CHECK (weight_kg IS NULL OR weight_kg >= 0),
  CONSTRAINT stock_lot_units_status_check
    CHECK (status IN ('available', 'reserved', 'packed', 'shipped', 'consumed', 'blocked')),
  CONSTRAINT stock_lot_units_quality_check
    CHECK (quality_status IN ('pending', 'approved', 'quarantine', 'rejected', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_stock_lot_units_lot
  ON public.stock_lot_units (company_id, lot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_lot_units_status
  ON public.stock_lot_units (company_id, status, quality_status);

ALTER TABLE public.stock_lot_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_lot_units_select ON public.stock_lot_units;
CREATE POLICY stock_lot_units_select ON public.stock_lot_units
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.stock_lot_units FROM PUBLIC, anon;
GRANT SELECT ON public.stock_lot_units TO authenticated;
GRANT ALL ON public.stock_lot_units TO service_role;

CREATE TABLE IF NOT EXISTS public.stock_lot_unit_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.stock_lot_units(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE CASCADE,
  inspector_id uuid REFERENCES public.profiles(id),
  decision text NOT NULL,
  reason text,
  notes text,
  defect_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_lot_unit_inspections_decision_check
    CHECK (decision IN ('approved', 'quarantine', 'rejected')),
  CONSTRAINT stock_lot_unit_inspections_defects_check CHECK (defect_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_lot_unit_inspections_unit
  ON public.stock_lot_unit_inspections (company_id, unit_id, created_at DESC);

ALTER TABLE public.stock_lot_unit_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_lot_unit_inspections_select ON public.stock_lot_unit_inspections;
CREATE POLICY stock_lot_unit_inspections_select ON public.stock_lot_unit_inspections
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.stock_lot_unit_inspections FROM PUBLIC, anon;
GRANT SELECT ON public.stock_lot_unit_inspections TO authenticated;
GRANT ALL ON public.stock_lot_unit_inspections TO service_role;

CREATE OR REPLACE FUNCTION public.register_stock_lot_units(
  p_lot_id uuid,
  p_units jsonb,
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
  v_lot public.stock_lots%ROWTYPE;
  v_request public.stock_lot_unit_requests%ROWTYPE;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_item jsonb;
  v_codes text[] := ARRAY[]::text[];
  v_code text;
  v_type text;
  v_quantity numeric;
  v_total numeric := 0;
  v_existing_total numeric := 0;
  v_physical_total numeric := 0;
  v_product_unit text := 'UN';
  v_production_order_id uuid;
  v_request_id uuid;
  v_unit_ids uuid[] := ARRAY[]::uuid[];
  v_unit_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'Chave de idempotência da divisão em rolos/peças inválida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request
    FROM public.stock_lot_unit_requests
   WHERE company_id = v_company_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_request.lot_id <> p_lot_id THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada para outro lote' USING ERRCODE = '23505';
    END IF;
    SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::uuid[]) INTO v_unit_ids
      FROM public.stock_lot_units WHERE request_id = v_request.id;
    RETURN jsonb_build_object(
      'lot_id', v_request.lot_id,
      'request_id', v_request.id,
      'unit_ids', to_jsonb(v_unit_ids),
      'unit_count', v_request.unit_count,
      'total_quantity', v_request.total_quantity,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_lot
    FROM public.stock_lots
   WHERE id = p_lot_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' OR jsonb_array_length(p_units) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um rolo/peça para registrar' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_units) > 200 THEN
    RAISE EXCEPTION 'Registre no máximo 200 rolos/peças por lote de envio' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':lot-units:' || v_lot.id::text, 0));

  -- Valida o lote inteiro antes de inserir qualquer unidade.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    v_code := NULLIF(btrim(COALESCE(v_item ->> 'unit_code', '')), '');
    v_type := COALESCE(NULLIF(btrim(COALESCE(v_item ->> 'unit_type', '')), ''), 'roll');
    v_quantity := CASE
      WHEN NULLIF(v_item ->> 'quantity', '') IS NULL THEN NULL
      ELSE (v_item ->> 'quantity')::numeric
    END;

    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Informe o código/etiqueta de cada rolo/peça' USING ERRCODE = '22023';
    END IF;
    IF lower(v_code) = ANY(v_codes) THEN
      RAISE EXCEPTION 'O código % está repetido nesta divisão', v_code USING ERRCODE = '23505';
    END IF;
    v_codes := array_append(v_codes, lower(v_code));

    IF v_type NOT IN ('roll', 'piece', 'bale', 'package') THEN
      RAISE EXCEPTION 'Tipo de unidade inválido para %', v_code USING ERRCODE = '22023';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Informe uma quantidade válida para %', v_code USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.stock_lot_units
       WHERE company_id = v_company_id AND lower(unit_code) = lower(v_code)
    ) THEN
      RAISE EXCEPTION 'O código de rolo/peça % já existe nesta empresa', v_code USING ERRCODE = '23505';
    END IF;
    v_total := v_total + v_quantity;
  END LOOP;

  SELECT COALESCE(sum(quantity), 0) INTO v_existing_total
    FROM public.stock_lot_units
   WHERE company_id = v_company_id AND lot_id = v_lot.id;

  v_physical_total := COALESCE(v_lot.remaining_qty, 0) + COALESCE(v_lot.consumed_qty, 0);
  IF v_physical_total <= 0 THEN
    v_physical_total := COALESCE(v_lot.quantity, 0);
  END IF;

  IF v_existing_total + v_total > v_physical_total + 0.0005 THEN
    RAISE EXCEPTION 'A soma dos rolos/peças (%, com % já registrados) não pode passar da quantidade física do lote (%)',
      v_total, v_existing_total, v_physical_total USING ERRCODE = '22023';
  END IF;

  IF v_lot.product_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(unit, ''), 'UN') INTO v_product_unit
      FROM public.products WHERE id = v_lot.product_id AND company_id = v_company_id;
  END IF;

  SELECT production_order_id INTO v_production_order_id
    FROM public.production_completion_requests
   WHERE company_id = v_company_id AND output_lot_id = v_lot.id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_production_order_id IS NULL THEN
    SELECT production_order_id INTO v_production_order_id
      FROM public.production_lot_genealogy
     WHERE company_id = v_company_id AND output_lot_id = v_lot.id
     LIMIT 1;
  END IF;

  INSERT INTO public.stock_lot_unit_requests (
    company_id, idempotency_key, lot_id, unit_count, total_quantity, created_by
  ) VALUES (
    v_company_id, v_key, v_lot.id, jsonb_array_length(p_units), v_total, v_user_id
  ) RETURNING id INTO v_request_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    INSERT INTO public.stock_lot_units (
      company_id, lot_id, request_id, production_order_id,
      unit_code, unit_type, quantity, unit,
      length_m, width_cm, weight_kg, location,
      status, quality_status, created_by
    ) VALUES (
      v_company_id, v_lot.id, v_request_id, v_production_order_id,
      btrim(v_item ->> 'unit_code'),
      COALESCE(NULLIF(btrim(COALESCE(v_item ->> 'unit_type', '')), ''), 'roll'),
      (v_item ->> 'quantity')::numeric,
      COALESCE(v_product_unit, 'UN'),
      CASE WHEN NULLIF(v_item ->> 'length_m', '') IS NULL THEN NULL ELSE (v_item ->> 'length_m')::numeric END,
      CASE WHEN NULLIF(v_item ->> 'width_cm', '') IS NULL THEN NULL ELSE (v_item ->> 'width_cm')::numeric END,
      CASE WHEN NULLIF(v_item ->> 'weight_kg', '') IS NULL THEN NULL ELSE (v_item ->> 'weight_kg')::numeric END,
      COALESCE(NULLIF(btrim(COALESCE(v_item ->> 'location', '')), ''), v_lot.location),
      'available', 'pending', v_user_id
    ) RETURNING id INTO v_unit_id;
    v_unit_ids := array_append(v_unit_ids, v_unit_id);
  END LOOP;

  RETURN jsonb_build_object(
    'lot_id', v_lot.id,
    'request_id', v_request_id,
    'unit_ids', to_jsonb(v_unit_ids),
    'unit_count', jsonb_array_length(p_units),
    'total_quantity', v_total,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_stock_lot_units(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_stock_lot_units(uuid, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inspect_stock_lot_unit(
  p_unit_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_defect_count integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_unit public.stock_lot_units%ROWTYPE;
  v_decision text := lower(COALESCE(p_decision, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_decision NOT IN ('approved', 'quarantine', 'rejected') THEN
    RAISE EXCEPTION 'Decisão de inspeção do rolo/peça inválida' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_defect_count, 0) < 0 THEN
    RAISE EXCEPTION 'A quantidade de defeitos não pode ser negativa' USING ERRCODE = '22023';
  END IF;
  IF v_decision <> 'approved' AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da quarentena/rejeição do rolo/peça' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_unit
    FROM public.stock_lot_units
   WHERE id = p_unit_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rolo/peça não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_unit.status IN ('shipped', 'consumed') THEN
    RAISE EXCEPTION 'Rolo/peça já expedido/consumido não pode ser inspecionado novamente' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.stock_lot_unit_inspections (
    company_id, unit_id, lot_id, inspector_id, decision, reason, notes, defect_count
  ) VALUES (
    v_company_id, v_unit.id, v_unit.lot_id, v_user_id, v_decision,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    COALESCE(p_defect_count, 0)
  );

  UPDATE public.stock_lot_units
     SET quality_status = v_decision,
         inspection_notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), NULLIF(btrim(COALESCE(p_reason, '')), ''), inspection_notes),
         inspected_by = v_user_id,
         inspected_at = now(),
         updated_at = now()
   WHERE id = v_unit.id
   RETURNING * INTO v_unit;

  RETURN to_jsonb(v_unit);
END;
$$;

REVOKE ALL ON FUNCTION public.inspect_stock_lot_unit(uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspect_stock_lot_unit(uuid, text, text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_stock_lot_unit_packing_status(
  p_unit_id uuid,
  p_status text,
  p_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_unit public.stock_lot_units%ROWTYPE;
  v_status text := lower(COALESCE(p_status, ''));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('available', 'packed') THEN
    RAISE EXCEPTION 'A embalagem do rolo/peça aceita apenas disponível ou embalado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_unit
    FROM public.stock_lot_units
   WHERE id = p_unit_id AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rolo/peça não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'packed' THEN
    IF v_unit.status <> 'available' THEN
      RAISE EXCEPTION 'Somente rolo/peça disponível pode ser embalado' USING ERRCODE = '55000';
    END IF;
    IF v_unit.quality_status <> 'approved' THEN
      RAISE EXCEPTION 'O rolo/peça precisa estar aprovado na inspeção para ser embalado' USING ERRCODE = '55000';
    END IF;
    UPDATE public.stock_lot_units
       SET status = 'packed',
           location = COALESCE(NULLIF(btrim(COALESCE(p_location, '')), ''), location),
           packed_at = now(),
           updated_at = now()
     WHERE id = v_unit.id
     RETURNING * INTO v_unit;
  ELSE
    IF v_unit.status <> 'packed' THEN
      RAISE EXCEPTION 'Somente rolo/peça embalado pode voltar para disponível' USING ERRCODE = '55000';
    END IF;
    UPDATE public.stock_lot_units
       SET status = 'available',
           location = COALESCE(NULLIF(btrim(COALESCE(p_location, '')), ''), location),
           packed_at = NULL,
           updated_at = now()
     WHERE id = v_unit.id
     RETURNING * INTO v_unit;
  END IF;

  RETURN to_jsonb(v_unit);
END;
$$;

REVOKE ALL ON FUNCTION public.set_stock_lot_unit_packing_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_lot_unit_packing_status(uuid, text, text) TO authenticated, service_role;

COMMENT ON TABLE public.stock_lot_units IS
  'Unidades físicas (rolo/peça/fardo/pacote) de um lote; não substituem o saldo oficial do lote.';
COMMENT ON FUNCTION public.register_stock_lot_units(uuid, jsonb, text) IS
  'Subdivide fisicamente um lote em rolos/peças sem criar saldo paralelo.';
