-- PCP de tecelagem executável: snapshot técnico da OP, reserva de materiais,
-- programação finita, apontamento de etapas, perfil/eventos de tecelagem,
-- qualidade formal e geração idempotente de compra a partir do MRP.
--
-- Princípios:
-- * Nenhum segundo ledger: todo efeito físico continua em stock_movements e
--   nos saldos derivados por stock_balances/stock_lots.
-- * BOM, roteiro, receita e qualidade continuam conceitos distintos. Este
--   incremento congela BOM + roteiro + produto na criação da OP; receita
--   química continua fora do snapshot porque tinturaria não é presumida em
--   uma OP de tecelagem.
-- * OPs antigas não recebem snapshot retroativo: seria falso afirmar que a
--   estrutura atual era a estrutura vigente na criação delas.
-- * Rollback manual: remover RPCs/tabelas/colunas deste arquivo e restaurar
--   complete_production_order da migration 20261019100000. Não apagar
--   movimentos, reservas consumidas, genealogia ou pedidos já criados sem
--   uma reversão operacional auditada.

-- ---------------------------------------------------------------------------
-- Snapshot técnico e chave de criação da OP
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS technical_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS technical_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS technical_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS production_orders_creation_key_uidx
  ON public.production_orders (company_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_orders_snapshot_idx
  ON public.production_orders (company_id, technical_snapshot_at DESC);

CREATE TABLE IF NOT EXISTS public.production_order_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id),
  counter_day date NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, counter_day),
  CONSTRAINT production_order_counters_positive CHECK (last_number >= 0)
);
ALTER TABLE public.production_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_order_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.production_order_counters TO service_role;

CREATE OR REPLACE FUNCTION public.pcp_snapshot_production_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = NEW.id;
  IF v_order.id IS NULL OR v_order.product_id IS NULL OR v_order.technical_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT jsonb_build_object(
    'version', 1,
    'captured_at', now(),
    'product', (
      SELECT jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'unit', p.unit,
        'production_route_id', p.production_route_id
      ) FROM public.products p WHERE p.id = v_order.product_id AND p.company_id = v_order.company_id
    ),
    'bom', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bom.id, 'component_id', bom.component_id,
        'component_code', component.code, 'component_name', component.name,
        'component_unit', component.unit, 'quantity', bom.quantity,
        'waste_percentage', COALESCE(bom.waste_percentage, 0)
      ) ORDER BY component.code, bom.id)
      FROM public.production_bom bom
      JOIN public.products component
        ON component.id = bom.component_id AND component.company_id = bom.company_id
      WHERE bom.company_id = v_order.company_id AND bom.product_id = v_order.product_id
    ), '[]'::jsonb),
    'route', (
      SELECT jsonb_build_object(
        'id', r.id, 'code', r.code, 'version', r.version,
        'product_id', r.product_id, 'total_time_minutes', r.total_time_minutes
      ) FROM public.production_routes r
      WHERE r.id = v_order.route_id AND r.company_id = v_order.company_id
    ),
    'route_steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rs.id, 'sequence', rs.sequence, 'step_name', rs.step_name,
        'sector_id', rs.sector_id, 'resource_id', rs.resource_id,
        'setup_time_minutes', rs.setup_time_minutes,
        'operation_time_minutes', rs.operation_time_minutes,
        'description', rs.description
      ) ORDER BY rs.sequence, rs.id)
      FROM public.production_route_steps rs
      WHERE rs.route_id = v_order.route_id AND rs.company_id = v_order.company_id
    ), '[]'::jsonb)
  ) INTO v_snapshot;

  UPDATE public.production_orders
     SET technical_snapshot = v_snapshot,
         technical_snapshot_hash = md5(v_snapshot::text),
         technical_snapshot_at = now()
   WHERE id = v_order.id AND technical_snapshot IS NULL;

  -- Copia recurso/centro do roteiro congelado para a execução da etapa.
  UPDATE public.production_order_steps os
     SET resource_id = rs.resource_id,
         work_center = COALESCE(os.work_center, resource.name, rs.step_name)
    FROM public.production_route_steps rs
    LEFT JOIN public.production_resources resource ON resource.id = rs.resource_id
   WHERE os.production_order_id = v_order.id
     AND os.company_id = v_order.company_id
     AND rs.route_id = v_order.route_id
     AND rs.company_id = v_order.company_id
     AND rs.sequence = os.sequence;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_snapshot_production_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_z_pcp_snapshot_production_order ON public.production_orders;
CREATE TRIGGER trg_z_pcp_snapshot_production_order
  AFTER INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.pcp_snapshot_production_order();

-- ---------------------------------------------------------------------------
-- Campos de execução das etapas e da programação
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_order_steps
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.production_resources(id),
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.production_machines(id),
  ADD COLUMN IF NOT EXISTS work_center text,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS operator_name text;

ALTER TABLE public.production_schedule
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.production_resources(id),
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.production_machines(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS production_schedule_idempotency_uidx
  ON public.production_schedule (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS production_schedule_resource_window_idx
  ON public.production_schedule (company_id, resource_id, planned_start, planned_end)
  WHERE status NOT IN ('completed', 'cancelled', 'canceled');
CREATE INDEX IF NOT EXISTS production_schedule_machine_window_idx
  ON public.production_schedule (company_id, machine_id, planned_start, planned_end)
  WHERE status NOT IN ('completed', 'cancelled', 'canceled');

-- ---------------------------------------------------------------------------
-- Perfil e eventos específicos de tecelagem (valores sempre configurados)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weaving_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  loom_resource_id uuid REFERENCES public.production_resources(id),
  machine_id uuid REFERENCES public.production_machines(id),
  work_center text,
  warp_product_id uuid REFERENCES public.products(id),
  weft_product_id uuid REFERENCES public.products(id),
  warp_lot_id uuid REFERENCES public.stock_lots(id),
  weft_lot_id uuid REFERENCES public.stock_lots(id),
  beam_code text,
  reed_code text,
  picks_per_cm numeric,
  warp_thread_count integer,
  planned_width_cm numeric,
  planned_length_m numeric,
  setup_minutes numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weaving_order_profiles_nonnegative CHECK (
    (picks_per_cm IS NULL OR picks_per_cm >= 0)
    AND (warp_thread_count IS NULL OR warp_thread_count >= 0)
    AND (planned_width_cm IS NULL OR planned_width_cm >= 0)
    AND (planned_length_m IS NULL OR planned_length_m >= 0)
    AND (setup_minutes IS NULL OR setup_minutes >= 0)
  )
);
CREATE INDEX IF NOT EXISTS weaving_order_profiles_company_idx
  ON public.weaving_order_profiles (company_id, production_order_id);
ALTER TABLE public.weaving_order_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weaving_order_profiles_select ON public.weaving_order_profiles;
CREATE POLICY weaving_order_profiles_select ON public.weaving_order_profiles
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.weaving_order_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.weaving_order_profiles TO authenticated;
GRANT ALL ON public.weaving_order_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.weaving_production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  production_order_step_id uuid REFERENCES public.production_order_steps(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.production_machines(id),
  resource_id uuid REFERENCES public.production_resources(id),
  event_type text NOT NULL,
  quantity_m numeric,
  downtime_minutes numeric,
  reason text,
  operator_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weaving_production_events_type_check CHECK (event_type IN (
    'setup','start','pause','resume','stop','yarn_break','warp_break','weft_break',
    'beam_change','quality_hold','quality_release','inspection','note'
  )),
  CONSTRAINT weaving_production_events_values_check CHECK (
    (quantity_m IS NULL OR quantity_m >= 0)
    AND (downtime_minutes IS NULL OR downtime_minutes >= 0)
  )
);
CREATE INDEX IF NOT EXISTS weaving_production_events_order_idx
  ON public.weaving_production_events (company_id, production_order_id, occurred_at DESC);
ALTER TABLE public.weaving_production_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weaving_production_events_select ON public.weaving_production_events;
CREATE POLICY weaving_production_events_select ON public.weaving_production_events
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.weaving_production_events FROM PUBLIC, anon;
GRANT SELECT ON public.weaving_production_events TO authenticated;
GRANT ALL ON public.weaving_production_events TO service_role;

-- ---------------------------------------------------------------------------
-- Reservas de materiais da produção e solicitações de compra do MRP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_material_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.products(id),
  lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  stock_balance_id uuid REFERENCES public.stock_balances(id),
  requested_qty numeric NOT NULL,
  reserved_qty numeric NOT NULL,
  consumed_qty numeric NOT NULL DEFAULT 0,
  released_qty numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reserved',
  idempotency_key text NOT NULL,
  reserved_by uuid REFERENCES public.profiles(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_material_reservations_status_check CHECK (status IN (
    'reserved','partially_consumed','consumed','released','cancelled'
  )),
  CONSTRAINT production_material_reservations_quantities_check CHECK (
    requested_qty > 0 AND reserved_qty > 0 AND consumed_qty >= 0 AND released_qty >= 0
    AND consumed_qty + released_qty <= reserved_qty
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS production_material_reservations_key_uidx
  ON public.production_material_reservations (
    company_id, idempotency_key, component_id, lot_id, stock_balance_id
  );
CREATE INDEX IF NOT EXISTS production_material_reservations_order_idx
  ON public.production_material_reservations (company_id, production_order_id, status, reserved_at);
CREATE INDEX IF NOT EXISTS production_material_reservations_lot_idx
  ON public.production_material_reservations (company_id, lot_id, status);
ALTER TABLE public.production_material_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_material_reservations_select ON public.production_material_reservations;
CREATE POLICY production_material_reservations_select ON public.production_material_reservations
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.production_material_reservations FROM PUBLIC, anon;
GRANT SELECT ON public.production_material_reservations TO authenticated;
GRANT ALL ON public.production_material_reservations TO service_role;

CREATE TABLE IF NOT EXISTS public.mrp_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  idempotency_key text NOT NULL,
  purchase_order_id uuid NOT NULL UNIQUE REFERENCES public.purchase_orders(id),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrp_purchase_requests_key_check CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS mrp_purchase_requests_company_key_uidx
  ON public.mrp_purchase_requests (company_id, idempotency_key);
ALTER TABLE public.mrp_purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mrp_purchase_requests_select ON public.mrp_purchase_requests;
CREATE POLICY mrp_purchase_requests_select ON public.mrp_purchase_requests
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.mrp_purchase_requests FROM PUBLIC, anon;
GRANT SELECT ON public.mrp_purchase_requests TO authenticated;
GRANT ALL ON public.mrp_purchase_requests TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers internos de autorização e leitura da estrutura congelada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pcp_authorized_order(p_production_order_id uuid)
RETURNS public.production_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_user_branch_id uuid;
  v_order public.production_orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order
    FROM public.production_orders
   WHERE id = p_production_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de produção não encontrada' USING ERRCODE = 'P0002';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL OR v_order.company_id <> v_company_id THEN
    RAISE EXCEPTION 'OP não pertence à empresa do usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission(v_user_id, v_order.company_id, 'production.orders', 'write')
    OR public.has_permission(v_user_id, v_order.company_id, 'production.pcp', 'write')
    OR public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão de escrita no PCP/produção' USING ERRCODE = '42501';
  END IF;
  IF v_order.branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.branches b
       WHERE b.id = v_order.branch_id AND b.company_id = v_order.company_id
    ) THEN
      RAISE EXCEPTION 'Filial da OP não pertence à empresa da ordem' USING ERRCODE = '42501';
    END IF;
    v_user_branch_id := public.get_user_branch_id(v_user_id);
    IF v_user_branch_id IS NOT NULL AND v_user_branch_id <> v_order.branch_id
       AND NOT public.is_matriz_viewer(v_user_id) THEN
      RAISE EXCEPTION 'OP pertence a outra filial e o usuário não possui visão de matriz'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_authorized_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_authorized_order(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pcp_order_canal(p_order public.production_orders)
RETURNS public.canal_operacional
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canal public.canal_operacional := 'ATACADO_INDUSTRIA'::public.canal_operacional;
BEGIN
  IF p_order.branch_id IS NOT NULL THEN
    SELECT COALESCE(canal_padrao, v_canal) INTO v_canal
      FROM public.branches
     WHERE id = p_order.branch_id AND company_id = p_order.company_id;
  END IF;
  RETURN COALESCE(v_canal, 'ATACADO_INDUSTRIA'::public.canal_operacional);
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_order_canal(public.production_orders) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_order_canal(public.production_orders) TO service_role;

CREATE OR REPLACE FUNCTION public.pcp_order_bom_lines(p_production_order_id uuid)
RETURNS TABLE (
  component_id uuid,
  quantity numeric,
  waste_percentage numeric,
  component_code text,
  component_name text,
  component_unit text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_production_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_order.technical_snapshot IS NOT NULL
     AND jsonb_typeof(v_order.technical_snapshot -> 'bom') = 'array'
     AND jsonb_array_length(v_order.technical_snapshot -> 'bom') > 0 THEN
    RETURN QUERY
    SELECT (line ->> 'component_id')::uuid,
           (line ->> 'quantity')::numeric,
           COALESCE((line ->> 'waste_percentage')::numeric, 0),
           line ->> 'component_code',
           line ->> 'component_name',
           line ->> 'component_unit'
      FROM jsonb_array_elements(v_order.technical_snapshot -> 'bom') line
     WHERE NULLIF(line ->> 'component_id', '') IS NOT NULL;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT bom.component_id, bom.quantity, COALESCE(bom.waste_percentage, 0),
         component.code, component.name, component.unit
    FROM public.production_bom bom
    JOIN public.products component
      ON component.id = bom.component_id AND component.company_id = bom.company_id
   WHERE bom.company_id = v_order.company_id AND bom.product_id = v_order.product_id
   ORDER BY component.code, bom.id;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_order_bom_lines(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_order_bom_lines(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pcp_assert_actor_for_company(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR public.get_user_company_id(v_user_id) <> p_company_id THEN
    RAISE EXCEPTION 'Empresa não pertence ao usuário autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_permission(v_user_id, p_company_id, 'production.orders', 'write')
    OR public.has_permission(v_user_id, p_company_id, 'production.pcp', 'write')
    OR public.has_role(v_user_id, 'admin'::public.app_role)
    OR public.has_role(v_user_id, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Usuário sem permissão de escrita no PCP/produção' USING ERRCODE = '42501';
  END IF;
  RETURN v_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_assert_actor_for_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_assert_actor_for_company(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Perfil de tecelagem
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pcp_apply_weaving_profile(
  p_order public.production_orders,
  p_profile jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_warp_product_id uuid := NULLIF(p_profile ->> 'warp_product_id', '')::uuid;
  v_weft_product_id uuid := NULLIF(p_profile ->> 'weft_product_id', '')::uuid;
  v_warp_lot_id uuid := NULLIF(p_profile ->> 'warp_lot_id', '')::uuid;
  v_weft_lot_id uuid := NULLIF(p_profile ->> 'weft_lot_id', '')::uuid;
  v_resource_id uuid := NULLIF(p_profile ->> 'loom_resource_id', '')::uuid;
  v_machine_id uuid := NULLIF(p_profile ->> 'machine_id', '')::uuid;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Perfil de tecelagem deve ser um objeto JSON' USING ERRCODE = '22023';
  END IF;
  IF v_warp_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = v_warp_product_id AND company_id = p_order.company_id
  ) THEN RAISE EXCEPTION 'Fio de urdume não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF v_weft_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = v_weft_product_id AND company_id = p_order.company_id
  ) THEN RAISE EXCEPTION 'Fio de trama não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF v_warp_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stock_lots WHERE id = v_warp_lot_id AND company_id = p_order.company_id
      AND (v_warp_product_id IS NULL OR product_id = v_warp_product_id)
  ) THEN RAISE EXCEPTION 'Lote de urdume incompatível com o produto/empresa' USING ERRCODE = '42501'; END IF;
  IF v_weft_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stock_lots WHERE id = v_weft_lot_id AND company_id = p_order.company_id
      AND (v_weft_product_id IS NULL OR product_id = v_weft_product_id)
  ) THEN RAISE EXCEPTION 'Lote de trama incompatível com o produto/empresa' USING ERRCODE = '42501'; END IF;
  IF v_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = v_resource_id AND company_id = p_order.company_id AND is_active
  ) THEN RAISE EXCEPTION 'Recurso/tear não pertence à empresa ou está inativo' USING ERRCODE = '42501'; END IF;
  IF v_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = v_machine_id AND company_id = p_order.company_id AND active
  ) THEN RAISE EXCEPTION 'Máquina/tear não pertence à empresa ou está inativa' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.weaving_order_profiles (
    company_id, branch_id, production_order_id, loom_resource_id, machine_id,
    work_center, warp_product_id, weft_product_id, warp_lot_id, weft_lot_id,
    beam_code, reed_code, picks_per_cm, warp_thread_count, planned_width_cm,
    planned_length_m, setup_minutes, notes, created_by
  ) VALUES (
    p_order.company_id, p_order.branch_id, p_order.id, v_resource_id, v_machine_id,
    NULLIF(btrim(p_profile ->> 'work_center'), ''), v_warp_product_id, v_weft_product_id,
    v_warp_lot_id, v_weft_lot_id, NULLIF(btrim(p_profile ->> 'beam_code'), ''),
    NULLIF(btrim(p_profile ->> 'reed_code'), ''),
    NULLIF(p_profile ->> 'picks_per_cm', '')::numeric,
    NULLIF(p_profile ->> 'warp_thread_count', '')::integer,
    NULLIF(p_profile ->> 'planned_width_cm', '')::numeric,
    NULLIF(p_profile ->> 'planned_length_m', '')::numeric,
    NULLIF(p_profile ->> 'setup_minutes', '')::numeric,
    NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
  )
  ON CONFLICT (production_order_id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id, loom_resource_id = EXCLUDED.loom_resource_id,
    machine_id = EXCLUDED.machine_id, work_center = EXCLUDED.work_center,
    warp_product_id = EXCLUDED.warp_product_id, weft_product_id = EXCLUDED.weft_product_id,
    warp_lot_id = EXCLUDED.warp_lot_id, weft_lot_id = EXCLUDED.weft_lot_id,
    beam_code = EXCLUDED.beam_code, reed_code = EXCLUDED.reed_code,
    picks_per_cm = EXCLUDED.picks_per_cm, warp_thread_count = EXCLUDED.warp_thread_count,
    planned_width_cm = EXCLUDED.planned_width_cm, planned_length_m = EXCLUDED.planned_length_m,
    setup_minutes = EXCLUDED.setup_minutes, notes = EXCLUDED.notes, updated_at = now()
  RETURNING id INTO v_profile_id;
  RETURN v_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_weaving_order_profile(
  p_production_order_id uuid,
  p_profile jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_profile_id uuid;
BEGIN
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Perfil de tecelagem não pode ser alterado em OP concluída/cancelada' USING ERRCODE = '55000';
  END IF;
  v_profile_id := public.pcp_apply_weaving_profile(v_order, COALESCE(p_profile, '{}'::jsonb));
  RETURN jsonb_build_object('profile_id', v_profile_id, 'production_order_id', v_order.id, 'status', 'saved');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_weaving_order_profile(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_weaving_order_profile(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_weaving_event(
  p_production_order_id uuid,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity_m numeric DEFAULT NULL,
  p_downtime_minutes numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_operator_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN ('setup','start','pause','resume','stop','yarn_break','warp_break','weft_break','beam_change','quality_hold','quality_release','inspection','note') THEN
    RAISE EXCEPTION 'Tipo de evento de tecelagem inválido' USING ERRCODE = '22023';
  END IF;
  IF p_production_order_step_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_order_steps WHERE id = p_production_order_step_id
      AND production_order_id = v_order.id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Etapa não pertence à OP' USING ERRCODE = '42501'; END IF;
  IF p_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Máquina não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF p_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id
  ) THEN RAISE EXCEPTION 'Recurso não pertence à empresa' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.weaving_production_events (
    company_id, branch_id, production_order_id, production_order_step_id,
    machine_id, resource_id, event_type, quantity_m, downtime_minutes, reason,
    operator_name, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, p_production_order_step_id,
    p_machine_id, p_resource_id, p_event_type, p_quantity_m, p_downtime_minutes,
    NULLIF(btrim(p_reason), ''), NULLIF(btrim(p_operator_name), ''), auth.uid()
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('event_id', v_event_id, 'production_order_id', v_order.id, 'event_type', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Criação de OP de tecelagem com snapshot, etapas e duplicidade controlada
-- ---------------------------------------------------------------------------
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
    p_due_date, NULLIF(btrim(p_work_center), ''), 'Tecelagem', p_sales_order_id,
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

-- ---------------------------------------------------------------------------
-- Reserva e liberação de materiais por OP/lote
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_production_materials(
  p_production_order_id uuid,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_canal public.canal_operacional := public.pcp_order_canal(v_order);
  v_elem record;
  v_alloc record;
  v_lot public.stock_lots%ROWTYPE;
  v_balance record;
  v_remaining numeric;
  v_take numeric;
  v_reserved_total numeric := 0;
  v_existing_count integer;
BEGIN
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres' USING ERRCODE = '22023';
  END IF;
  IF v_order.status NOT IN ('planned','waiting_material','in_progress','paused','finishing','quality_check') THEN
    RAISE EXCEPTION 'OP não aceita reserva de materiais no status %', v_order.status USING ERRCODE = '55000';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma alocação componente/lote/quantidade' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_existing_count FROM public.production_material_reservations
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF v_existing_count > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.production_material_reservations
       WHERE company_id = v_order.company_id AND idempotency_key = v_key AND production_order_id = v_order.id
    ) THEN RAISE EXCEPTION 'idempotency_key já foi utilizada para outra OP' USING ERRCODE = '23505'; END IF;
    SELECT COALESCE(sum(reserved_qty), 0) INTO v_reserved_total FROM public.production_material_reservations
     WHERE company_id = v_order.company_id AND idempotency_key = v_key AND production_order_id = v_order.id;
    RETURN jsonb_build_object('production_order_id', v_order.id, 'reserved_quantity', v_reserved_total,
      'reservation_rows', v_existing_count, 'idempotent_replay', true);
  END IF;

  FOR v_elem IN SELECT elem FROM jsonb_array_elements(p_allocations) elem LOOP
    IF jsonb_typeof(v_elem.elem) <> 'object'
       OR NULLIF(v_elem.elem ->> 'component_id', '') IS NULL
       OR NULLIF(v_elem.elem ->> 'lot_id', '') IS NULL
       OR NULLIF(v_elem.elem ->> 'quantity', '') IS NULL
       OR (v_elem.elem ->> 'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Cada reserva exige component_id, lot_id e quantity positiva' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOR v_alloc IN
    SELECT (elem ->> 'component_id')::uuid AS component_id,
           (elem ->> 'lot_id')::uuid AS lot_id,
           sum((elem ->> 'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_allocations) elem
     GROUP BY 1, 2 ORDER BY 2
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pcp_order_bom_lines(v_order.id) line WHERE line.component_id = v_alloc.component_id
    ) THEN RAISE EXCEPTION 'Componente fora da estrutura congelada/BOM da OP: %', v_alloc.component_id USING ERRCODE = '23514'; END IF;

    SELECT * INTO v_lot FROM public.stock_lots WHERE id = v_alloc.lot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado: %', v_alloc.lot_id USING ERRCODE = 'P0002'; END IF;
    IF v_lot.company_id <> v_order.company_id OR v_lot.product_id <> v_alloc.component_id THEN
      RAISE EXCEPTION 'Lote % não pertence ao componente/empresa', v_lot.lot_number USING ERRCODE = '42501';
    END IF;
    IF lower(COALESCE(v_lot.status, '')) <> 'available'
       OR lower(COALESCE(v_lot.quality_status, '')) NOT IN ('approved','released','aprovado','aprovada','liberado','liberada') THEN
      RAISE EXCEPTION 'Lote % não está disponível/liberado para reserva', v_lot.lot_number USING ERRCODE = '23514';
    END IF;
    IF v_lot.remaining_qty < v_alloc.quantity THEN
      RAISE EXCEPTION 'Lote % sem saldo restante suficiente para reserva', v_lot.lot_number USING ERRCODE = '23514';
    END IF;

    v_remaining := v_alloc.quantity;
    FOR v_balance IN
      SELECT * FROM public.stock_balances
       WHERE company_id = v_order.company_id AND product_id = v_alloc.component_id
         AND lot_id = v_alloc.lot_id AND branch_id IS NOT DISTINCT FROM v_order.branch_id
         AND canal_operacional = v_canal
       ORDER BY created_at, id FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, GREATEST(v_balance.quantity - v_balance.reserved_qty, 0));
      IF v_take <= 0 THEN CONTINUE; END IF;
      UPDATE public.stock_balances SET reserved_qty = reserved_qty + v_take, updated_at = now()
       WHERE id = v_balance.id;
      INSERT INTO public.production_material_reservations (
        company_id, branch_id, production_order_id, component_id, lot_id,
        stock_balance_id, requested_qty, reserved_qty, status, idempotency_key, reserved_by
      ) VALUES (
        v_order.company_id, v_order.branch_id, v_order.id, v_alloc.component_id,
        v_alloc.lot_id, v_balance.id, v_take, v_take, 'reserved', v_key, auth.uid()
      );
      v_remaining := v_remaining - v_take;
      v_reserved_total := v_reserved_total + v_take;
    END LOOP;
    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente no lote % para reservar %', v_lot.lot_number, v_alloc.quantity
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN jsonb_build_object('production_order_id', v_order.id, 'reserved_quantity', v_reserved_total,
    'idempotent_replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_production_materials(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_production_materials(uuid, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_production_material_reservation(
  p_reservation_id uuid,
  p_quantity numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.production_material_reservations%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_available numeric;
  v_release numeric;
BEGIN
  SELECT * INTO v_reservation FROM public.production_material_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva de material não encontrada' USING ERRCODE = 'P0002'; END IF;
  v_order := public.pcp_authorized_order(v_reservation.production_order_id);
  SELECT * INTO v_reservation FROM public.production_material_reservations WHERE id = p_reservation_id FOR UPDATE;
  v_available := v_reservation.reserved_qty - v_reservation.consumed_qty - v_reservation.released_qty;
  v_release := COALESCE(p_quantity, v_available);
  IF v_release <= 0 OR v_release > v_available THEN
    RAISE EXCEPTION 'Quantidade de liberação deve estar entre 0 e %', v_available USING ERRCODE = '22023';
  END IF;
  IF v_reservation.stock_balance_id IS NOT NULL THEN
    UPDATE public.stock_balances
       SET reserved_qty = GREATEST(0, reserved_qty - v_release), updated_at = now()
     WHERE id = v_reservation.stock_balance_id AND company_id = v_order.company_id;
  END IF;
  UPDATE public.production_material_reservations
     SET released_qty = released_qty + v_release,
         status = CASE WHEN consumed_qty + released_qty + v_release >= reserved_qty
                       THEN CASE WHEN consumed_qty > 0 THEN 'consumed' ELSE 'released' END
                       ELSE status END,
         closed_at = CASE WHEN consumed_qty + released_qty + v_release >= reserved_qty THEN now() ELSE closed_at END,
         updated_at = now()
   WHERE id = v_reservation.id;
  RETURN jsonb_build_object('reservation_id', v_reservation.id, 'released_quantity', v_release,
    'reason', NULLIF(btrim(p_reason), ''), 'status', 'released');
END;
$$;
REVOKE ALL ON FUNCTION public.release_production_material_reservation(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_production_material_reservation(uuid, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Programação finita por recurso/máquina/centro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_production_order(
  p_production_order_id uuid,
  p_planned_start timestamptz,
  p_planned_end timestamptz,
  p_idempotency_key text,
  p_resource_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_work_center text DEFAULT NULL,
  p_sector text DEFAULT NULL,
  p_shift text DEFAULT 'diurno'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_resource public.production_resources%ROWTYPE;
  v_machine public.production_machines%ROWTYPE;
  v_work_center text := NULLIF(btrim(p_work_center), '');
  v_resource_key text;
  v_existing public.production_schedule%ROWTYPE;
  v_schedule_id uuid;
  v_window_minutes numeric;
  v_capacity record;
BEGIN
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_planned_start IS NULL OR p_planned_end IS NULL OR p_planned_end <= p_planned_start THEN
    RAISE EXCEPTION 'Janela planejada inválida' USING ERRCODE = '22023';
  END IF;
  IF v_order.status NOT IN ('planned','in_progress','paused','waiting_material') THEN
    RAISE EXCEPTION 'OP não pode ser programada no status %', v_order.status USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_existing FROM public.production_schedule
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.production_order_id <> v_order.id THEN
      RAISE EXCEPTION 'idempotency_key já foi utilizada para outra OP' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('schedule_id', v_existing.id, 'production_order_id', v_order.id,
      'status', v_existing.status, 'idempotent_replay', true);
  END IF;

  IF p_resource_id IS NOT NULL THEN
    SELECT * INTO v_resource FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id;
    IF NOT FOUND OR NOT v_resource.is_active OR lower(v_resource.status) IN ('maintenance','inactive','down') THEN
      RAISE EXCEPTION 'Recurso inexistente, inativo ou em manutenção' USING ERRCODE = '23514';
    END IF;
    v_work_center := COALESCE(v_work_center, v_resource.name);
  END IF;
  IF p_machine_id IS NOT NULL THEN
    SELECT * INTO v_machine FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id;
    IF NOT FOUND OR NOT v_machine.active OR lower(v_machine.status) IN ('maintenance','inactive','down') THEN
      RAISE EXCEPTION 'Máquina inexistente, inativa ou em manutenção' USING ERRCODE = '23514';
    END IF;
    v_work_center := COALESCE(v_work_center, v_machine.name);
  END IF;
  IF v_work_center IS NULL AND NULLIF(btrim(p_sector), '') IS NULL THEN
    RAISE EXCEPTION 'Informe recurso, máquina, centro de trabalho ou setor+turno para programação finita' USING ERRCODE = '22023';
  END IF;

  v_resource_key := CASE
    WHEN p_machine_id IS NOT NULL THEN 'machine:' || p_machine_id::text
    WHEN p_resource_id IS NOT NULL THEN 'resource:' || p_resource_id::text
    WHEN v_work_center IS NOT NULL THEN 'work-center:' || lower(btrim(v_work_center))
    ELSE 'sector-shift:' || lower(btrim(p_sector)) || ':' || lower(COALESCE(p_shift, 'diurno'))
  END;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_order.company_id::text || ':' || v_resource_key, 0));

  IF EXISTS (
    SELECT 1 FROM public.production_schedule
     WHERE company_id = v_order.company_id AND production_order_id = v_order.id
       AND status IN ('scheduled','in_progress')
  ) THEN RAISE EXCEPTION 'OP já possui janela ativa; cancele ou encerre antes de reprogramar' USING ERRCODE = '23505'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_schedule s
     WHERE s.company_id = v_order.company_id
       AND s.status IN ('scheduled','in_progress')
       AND s.planned_start < p_planned_end AND p_planned_start < s.planned_end
       AND (
         (p_machine_id IS NOT NULL AND s.machine_id = p_machine_id)
         OR (p_resource_id IS NOT NULL AND s.resource_id = p_resource_id)
         OR (v_work_center IS NOT NULL AND lower(COALESCE(s.work_center, '')) = lower(v_work_center))
         OR (p_machine_id IS NULL AND p_resource_id IS NULL AND v_work_center IS NULL
             AND lower(COALESCE(s.sector, '')) = lower(p_sector)
             AND lower(COALESCE(s.shift, 'diurno')) = lower(COALESCE(p_shift, 'diurno')))
       )
  ) THEN RAISE EXCEPTION 'Conflito de capacidade: recurso já alocado nesta janela' USING ERRCODE = '23505'; END IF;

  v_window_minutes := EXTRACT(EPOCH FROM (p_planned_end - p_planned_start)) / 60;
  IF COALESCE(v_order.estimated_time_minutes, 0) > 0 AND v_window_minutes < v_order.estimated_time_minutes THEN
    RAISE EXCEPTION 'Janela de % min é menor que o tempo estimado da OP (% min)', round(v_window_minutes), v_order.estimated_time_minutes
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_capacity FROM public.production_capacity
   WHERE company_id = v_order.company_id AND is_active
     AND ((v_machine.name IS NOT NULL AND machine = v_machine.name)
       OR (NULLIF(btrim(p_sector), '') IS NOT NULL AND sector = p_sector AND shift = COALESCE(p_shift, 'diurno')))
   ORDER BY id LIMIT 1;
  IF FOUND AND v_capacity.max_hours_per_day > 0 AND v_window_minutes > v_capacity.max_hours_per_day * 60 THEN
    RAISE EXCEPTION 'Janela excede o máximo configurado de % h/dia para o recurso/setor', v_capacity.max_hours_per_day
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.production_schedule (
    company_id, production_order_id, planned_start, planned_end, sector,
    work_center, shift, resource_id, machine_id, status, idempotency_key
  ) VALUES (
    v_order.company_id, v_order.id, p_planned_start, p_planned_end,
    NULLIF(btrim(p_sector), ''), v_work_center, COALESCE(NULLIF(btrim(p_shift), ''), 'diurno'),
    p_resource_id, p_machine_id, 'scheduled', v_key
  ) RETURNING id INTO v_schedule_id;

  RETURN jsonb_build_object('schedule_id', v_schedule_id, 'production_order_id', v_order.id,
    'resource_key', v_resource_key, 'status', 'scheduled', 'idempotent_replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_production_order(uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_production_order(uuid, timestamptz, timestamptz, text, uuid, uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_production_schedule(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_schedule public.production_schedule%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM public.production_schedule WHERE id = p_schedule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programação não encontrada' USING ERRCODE = 'P0002'; END IF;
  v_order := public.pcp_authorized_order(v_schedule.production_order_id);
  SELECT * INTO v_schedule FROM public.production_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF v_schedule.status <> 'scheduled' OR v_schedule.actual_start IS NOT NULL THEN
    RAISE EXCEPTION 'Somente janela agendada e não iniciada pode ser cancelada' USING ERRCODE = '55000';
  END IF;
  UPDATE public.production_schedule SET status = 'cancelled', updated_at = now() WHERE id = v_schedule.id;
  RETURN jsonb_build_object('schedule_id', v_schedule.id, 'production_order_id', v_order.id, 'status', 'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_production_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_production_schedule(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Apontamento sequencial de etapa (parcial ou final)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_production_step_progress(
  p_production_order_step_id uuid,
  p_action text,
  p_produced_quantity numeric DEFAULT 0,
  p_rejected_quantity numeric DEFAULT 0,
  p_operator_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_work_center text DEFAULT NULL,
  p_shift text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_step public.production_order_steps%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
  v_target numeric;
  v_new_produced numeric;
  v_new_rejected numeric;
  v_new_pending numeric;
  v_next_step public.production_order_steps%ROWTYPE;
  v_completed_step record;
BEGIN
  SELECT * INTO v_step FROM public.production_order_steps WHERE id = p_production_order_step_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa da OP não encontrada' USING ERRCODE = 'P0002'; END IF;
  v_order := public.pcp_authorized_order(v_step.production_order_id);
  SELECT * INTO v_step FROM public.production_order_steps WHERE id = p_production_order_step_id FOR UPDATE;

  IF p_action NOT IN ('start','progress','pause','complete') THEN
    RAISE EXCEPTION 'Ação de etapa inválida' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_produced_quantity, 0) < 0 OR COALESCE(p_rejected_quantity, 0) < 0
     OR p_produced_quantity = 'NaN'::numeric OR p_rejected_quantity = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Quantidades do apontamento devem ser não negativas' USING ERRCODE = '22023';
  END IF;
  IF v_order.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'OP concluída/cancelada não aceita apontamento' USING ERRCODE = '55000';
  END IF;
  IF p_action IN ('progress','complete') AND EXISTS (
    SELECT 1 FROM public.production_order_steps previous
     WHERE previous.production_order_id = v_order.id AND previous.company_id = v_order.company_id
       AND previous.sequence < v_step.sequence AND previous.status <> 'completed'
  ) THEN RAISE EXCEPTION 'Etapa anterior obrigatória ainda não foi concluída' USING ERRCODE = '23514'; END IF;
  IF p_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = p_resource_id AND company_id = v_order.company_id AND is_active
  ) THEN RAISE EXCEPTION 'Recurso não pertence à empresa ou está inativo' USING ERRCODE = '42501'; END IF;
  IF p_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = p_machine_id AND company_id = v_order.company_id AND active
  ) THEN RAISE EXCEPTION 'Máquina não pertence à empresa ou está inativa' USING ERRCODE = '42501'; END IF;

  v_target := COALESCE(v_step.quantity_produced, 0) + COALESCE(v_step.quantity_rejected, 0) + COALESCE(v_step.quantity_pending, 0);
  v_new_produced := COALESCE(v_step.quantity_produced, 0) + COALESCE(p_produced_quantity, 0);
  v_new_rejected := COALESCE(v_step.quantity_rejected, 0) + COALESCE(p_rejected_quantity, 0);
  IF v_new_produced + v_new_rejected > v_target THEN
    RAISE EXCEPTION 'Apontamento excede a quantidade alvo da etapa (%): produzido+rejeitado=%', v_target, v_new_produced + v_new_rejected
      USING ERRCODE = '23514';
  END IF;
  v_new_pending := GREATEST(v_target - v_new_produced - v_new_rejected, 0);
  IF p_action = 'complete' AND v_new_pending > 0 THEN
    RAISE EXCEPTION 'Etapa ainda possui % pendente; use apontamento parcial ou informe o restante', v_new_pending
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.production_order_steps
     SET status = CASE
           WHEN p_action = 'pause' THEN 'paused'
           WHEN v_new_pending = 0 AND p_action IN ('progress','complete') THEN 'completed'
           ELSE 'in_progress' END,
         quantity_produced = v_new_produced,
         quantity_rejected = v_new_rejected,
         quantity_pending = v_new_pending,
         started_at = CASE WHEN p_action IN ('start','progress','complete') THEN COALESCE(started_at, now()) ELSE started_at END,
         completed_at = CASE WHEN v_new_pending = 0 AND p_action IN ('progress','complete') THEN now() ELSE completed_at END,
         realized_time_minutes = CASE
           WHEN v_new_pending = 0 AND p_action IN ('progress','complete') AND started_at IS NOT NULL
           THEN GREATEST(realized_time_minutes, ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60)::numeric)
           ELSE realized_time_minutes END,
         responsible = COALESCE(NULLIF(btrim(p_operator_name), ''), responsible),
         operator_name = COALESCE(NULLIF(btrim(p_operator_name), ''), operator_name),
         resource_id = COALESCE(p_resource_id, resource_id),
         machine_id = COALESCE(p_machine_id, machine_id),
         work_center = COALESCE(NULLIF(btrim(p_work_center), ''), work_center),
         shift = COALESCE(NULLIF(btrim(p_shift), ''), shift),
         notes = COALESCE(NULLIF(btrim(p_notes), ''), notes),
         updated_at = now()
   WHERE id = v_step.id
   RETURNING * INTO v_step;

  IF v_step.status = 'completed' THEN
    SELECT * INTO v_next_step FROM public.production_order_steps
     WHERE production_order_id = v_order.id AND company_id = v_order.company_id AND sequence > v_step.sequence
     ORDER BY sequence, id LIMIT 1;
    IF FOUND AND v_next_step.status <> 'completed' THEN
      UPDATE public.production_order_steps
         SET quantity_pending = GREATEST(v_step.quantity_produced - quantity_produced - quantity_rejected, 0), updated_at = now()
       WHERE id = v_next_step.id;
    END IF;

    SELECT os.quantity_produced, os.sequence INTO v_completed_step
      FROM public.production_order_steps os
     WHERE os.production_order_id = v_order.id AND os.company_id = v_order.company_id AND os.status = 'completed'
     ORDER BY os.sequence DESC LIMIT 1;
    UPDATE public.production_orders
       SET produced_quantity = COALESCE(v_completed_step.quantity_produced, produced_quantity),
           rejected_quantity = (
             SELECT COALESCE(sum(rejected.quantity_rejected), 0) FROM public.production_order_steps rejected
              WHERE rejected.production_order_id = v_order.id AND rejected.company_id = v_order.company_id
                AND rejected.sequence <= COALESCE(v_completed_step.sequence, v_step.sequence)
           ),
           status = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM public.production_order_steps remaining
                WHERE remaining.production_order_id = v_order.id AND remaining.company_id = v_order.company_id AND remaining.status <> 'completed'
             ) AND status IN ('planned','in_progress','paused') THEN 'finishing'
             WHEN status = 'planned' THEN 'in_progress' ELSE status END,
           start_date = COALESCE(start_date, now()), updated_at = now()
     WHERE id = v_order.id;
  ELSIF p_action = 'start' AND v_order.status = 'planned' THEN
    UPDATE public.production_orders SET status = 'in_progress', start_date = COALESCE(start_date, now()), updated_at = now() WHERE id = v_order.id;
  END IF;

  SELECT * INTO v_step FROM public.production_order_steps WHERE id = v_step.id;
  RETURN jsonb_build_object('production_order_step_id', v_step.id, 'production_order_id', v_order.id,
    'status', v_step.status, 'quantity_produced', v_step.quantity_produced,
    'quantity_rejected', v_step.quantity_rejected, 'quantity_pending', v_step.quantity_pending);
END;
$$;
REVOKE ALL ON FUNCTION public.record_production_step_progress(uuid, text, numeric, numeric, text, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_production_step_progress(uuid, text, numeric, numeric, text, text, uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decisão formal de qualidade da OP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_production_quality_inspection(
  p_inspection_id uuid,
  p_status text,
  p_corrective_action text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inspection public.quality_inspections%ROWTYPE;
  v_order public.production_orders%ROWTYPE;
BEGIN
  IF lower(COALESCE(p_status, '')) NOT IN ('open','approved','rejected','quarantine') THEN
    RAISE EXCEPTION 'Decisão de qualidade inválida' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_inspection FROM public.quality_inspections WHERE id = p_inspection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspeção de qualidade não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_inspection.production_order_id IS NULL THEN
    RAISE EXCEPTION 'Inspeção sem OP vinculada não pode liberar produção' USING ERRCODE = '23514';
  END IF;
  v_order := public.pcp_authorized_order(v_inspection.production_order_id);
  SELECT * INTO v_inspection FROM public.quality_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF v_inspection.company_id <> v_order.company_id THEN
    RAISE EXCEPTION 'Inspeção não pertence à empresa da OP' USING ERRCODE = '42501';
  END IF;
  IF lower(p_status) = 'approved' AND COALESCE(v_inspection.approved_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Aprovação exige quantidade aprovada maior que zero' USING ERRCODE = '23514';
  END IF;
  IF lower(p_status) IN ('rejected','quarantine')
     AND NULLIF(btrim(COALESCE(p_corrective_action, v_inspection.corrective_action, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(p_notes, v_inspection.notes, '')), '') IS NULL
     AND NULLIF(btrim(COALESCE(v_inspection.defect_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Rejeição/quarentena exige motivo ou ação corretiva registrada' USING ERRCODE = '23514';
  END IF;

  UPDATE public.quality_inspections
     SET status = lower(p_status),
         corrective_action = COALESCE(NULLIF(btrim(p_corrective_action), ''), corrective_action),
         notes = COALESCE(NULLIF(btrim(p_notes), ''), notes),
         updated_at = now()
   WHERE id = v_inspection.id AND company_id = v_order.company_id;
  RETURN jsonb_build_object('inspection_id', v_inspection.id, 'production_order_id', v_order.id, 'status', lower(p_status));
END;
$$;
REVOKE ALL ON FUNCTION public.decide_production_quality_inspection(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_production_quality_inspection(uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Compra de MRP: um pedido rascunho atômico e idempotente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_mrp_purchase_order(
  p_items jsonb,
  p_idempotency_key text,
  p_supplier_id uuid DEFAULT NULL,
  p_supplier_name text DEFAULT NULL,
  p_expected_delivery date DEFAULT NULL,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_supplier public.suppliers%ROWTYPE;
  v_supplier_name text;
  v_existing public.mrp_purchase_requests%ROWTYPE;
  v_order public.purchase_orders%ROWTYPE;
  v_purchase_order_id uuid;
  v_number text;
  v_item record;
  v_product public.products%ROWTYPE;
  v_unit_price numeric;
  v_subtotal numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501'; END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  PERFORM public.pcp_assert_actor_for_company(v_company_id);
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item de compra' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing FROM public.mrp_purchase_requests
   WHERE company_id = v_company_id AND idempotency_key = v_key;
  IF FOUND THEN
    SELECT * INTO v_order FROM public.purchase_orders WHERE id = v_existing.purchase_order_id;
    RETURN jsonb_build_object('purchase_order_id', v_order.id, 'number', v_order.number,
      'status', v_order.status, 'idempotent_replay', true);
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT * INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id AND company_id = v_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fornecedor não pertence à empresa' USING ERRCODE = '42501'; END IF;
    v_supplier_name := v_supplier.name;
  ELSE
    v_supplier_name := NULLIF(btrim(p_supplier_name), '');
  END IF;
  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Informe o fornecedor do pedido de compra' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) elem LOOP
    IF NULLIF(v_item.elem ->> 'component_id', '') IS NULL
       OR NULLIF(v_item.elem ->> 'quantity', '') IS NULL
       OR (v_item.elem ->> 'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Cada item de compra exige component_id e quantity positiva' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_product FROM public.products
     WHERE id = (v_item.elem ->> 'component_id')::uuid AND company_id = v_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Componente de compra não pertence à empresa' USING ERRCODE = '42501'; END IF;
    v_unit_price := COALESCE(NULLIF(v_item.elem ->> 'unit_price', '')::numeric, v_product.cost_price, 0);
    IF v_unit_price < 0 THEN RAISE EXCEPTION 'Preço unitário não pode ser negativo' USING ERRCODE = '22023'; END IF;
    v_subtotal := v_subtotal + ((v_item.elem ->> 'quantity')::numeric * v_unit_price);
  END LOOP;

  v_number := 'PC-MRP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substr(md5(v_key), 1, 8));
  INSERT INTO public.purchase_orders (
    company_id, number, supplier_id, supplier_name, date, expected_delivery,
    priority, status, subtotal, discount, shipping, taxes, total, notes
  ) VALUES (
    v_company_id, v_number, p_supplier_id, v_supplier_name, CURRENT_DATE,
    p_expected_delivery, COALESCE(p_priority, 'medium'), 'draft', v_subtotal, 0, 0, 0,
    v_subtotal, 'Gerado pelo MRP líquido do PCP; requer aprovação no módulo de compras.'
  ) RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.mrp_purchase_requests(company_id, idempotency_key, purchase_order_id, requested_by)
  VALUES (v_company_id, v_key, v_purchase_order_id, v_user_id);

  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) elem LOOP
    SELECT * INTO v_product FROM public.products
     WHERE id = (v_item.elem ->> 'component_id')::uuid AND company_id = v_company_id;
    v_unit_price := COALESCE(NULLIF(v_item.elem ->> 'unit_price', '')::numeric, v_product.cost_price, 0);
    INSERT INTO public.purchase_order_items (
      company_id, purchase_order_id, product_id, product_code, product_name,
      quantity, received_quantity, unit, unit_price, discount, total
    ) VALUES (
      v_company_id, v_purchase_order_id, v_product.id, v_product.code, v_product.name,
      (v_item.elem ->> 'quantity')::numeric, 0, v_product.unit, v_unit_price, 0,
      (v_item.elem ->> 'quantity')::numeric * v_unit_price
    );
  END LOOP;

  RETURN jsonb_build_object('purchase_order_id', v_purchase_order_id, 'number', v_number,
    'status', 'draft', 'idempotent_replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.generate_mrp_purchase_order(jsonb, text, uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_mrp_purchase_order(jsonb, text, uuid, text, date, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Conclusão: mesma transação da migration anterior, agora honrando snapshot,
-- qualidade formal e reservas da própria OP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_production_order(
  p_production_order_id uuid,
  p_idempotency_key text,
  p_produced_quantity numeric,
  p_rejected_quantity numeric DEFAULT 0,
  p_input_allocations jsonb DEFAULT '[]'::jsonb,
  p_output_lot_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_order public.production_orders%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_canal public.canal_operacional := 'ATACADO_INDUSTRIA'::public.canal_operacional;
  v_existing public.production_completion_requests%ROWTYPE;
  v_existing_key public.production_completion_requests%ROWTYPE;
  v_output_lot public.stock_lots%ROWTYPE;
  v_total_processed numeric;
  v_step_count integer := 0;
  v_step_completed integer := 0;
  v_quality_count integer := 0;
  v_quality_approved numeric := 0;
  v_quality_rejected numeric := 0;
  v_quality_blocked boolean := false;
  v_bom_count integer := 0;
  v_bom record;
  v_alloc record;
  v_elem record;
  v_allocated numeric;
  v_lot public.stock_lots%ROWTYPE;
  v_component public.products%ROWTYPE;
  v_available numeric;
  v_own_reserved numeric;
  v_reservation public.production_material_reservations%ROWTYPE;
  v_remaining_from_reservation numeric;
  v_take_reserved numeric;
  v_balance_id uuid;
  v_completion_id uuid;
  v_output_lot_id uuid;
  v_output_lot_number text;
  v_total_input_cost numeric := 0;
  v_output_unit_cost numeric := 0;
  v_movement_id uuid;
  v_expected_total numeric;
  v_expected_share numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório para concluir uma OP'
      USING ERRCODE = '42501';
  END IF;
  IF p_production_order_id IS NULL THEN
    RAISE EXCEPTION 'production_order_id é obrigatório' USING ERRCODE = '22004';
  END IF;
  IF length(v_key) < 8 OR length(v_key) > 120 THEN
    RAISE EXCEPTION 'idempotency_key deve ter entre 8 e 120 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0
     OR p_produced_quantity = 'NaN'::numeric
     OR p_produced_quantity = 'Infinity'::numeric
     OR p_produced_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'produced_quantity deve ser positiva e finita'
      USING ERRCODE = '22023';
  END IF;
  IF p_rejected_quantity IS NULL OR p_rejected_quantity < 0
     OR p_rejected_quantity = 'NaN'::numeric
     OR p_rejected_quantity = 'Infinity'::numeric
     OR p_rejected_quantity = '-Infinity'::numeric THEN
    RAISE EXCEPTION 'rejected_quantity deve ser não negativa e finita'
      USING ERRCODE = '22023';
  END IF;
  IF p_input_allocations IS NULL OR jsonb_typeof(p_input_allocations) <> 'array'
     OR jsonb_array_length(p_input_allocations) = 0 THEN
    RAISE EXCEPTION 'input_allocations deve informar ao menos um lote de entrada'
      USING ERRCODE = '22023';
  END IF;

  FOR v_elem IN
    SELECT elem
      FROM jsonb_array_elements(p_input_allocations) AS elem
  LOOP
    IF jsonb_typeof(v_elem.elem) <> 'object'
       OR NULLIF(btrim(v_elem.elem ->> 'component_id'), '') IS NULL
       OR NULLIF(btrim(v_elem.elem ->> 'lot_id'), '') IS NULL
       OR NULLIF(btrim(v_elem.elem ->> 'quantity'), '') IS NULL THEN
      RAISE EXCEPTION 'Cada alocação exige component_id, lot_id e quantity'
        USING ERRCODE = '22023';
    END IF;
    IF (v_elem.elem ->> 'quantity')::numeric <= 0
       OR (v_elem.elem ->> 'quantity')::numeric = 'NaN'::numeric
       OR (v_elem.elem ->> 'quantity')::numeric = 'Infinity'::numeric THEN
      RAISE EXCEPTION 'quantity de cada alocação deve ser positiva e finita'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Trava a OP e valida empresa/filial/permissão no mesmo helper de todas as
  -- RPCs executáveis do PCP. Reservas de outras OPs nunca entram no cálculo.
  v_order := public.pcp_authorized_order(p_production_order_id);
  v_company_id := v_order.company_id;
  v_canal := public.pcp_order_canal(v_order);

  SELECT * INTO v_existing
    FROM public.production_completion_requests
   WHERE production_order_id = v_order.id
     AND company_id = v_order.company_id;
  IF FOUND THEN
    IF v_order.status <> 'completed' THEN
      RAISE EXCEPTION 'Solicitação de conclusão existe, mas a OP não está concluída; intervenção auditada é necessária'
        USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_output_lot FROM public.stock_lots WHERE id = v_existing.output_lot_id;
    RETURN jsonb_build_object(
      'completion_id', v_existing.id,
      'production_order_id', v_existing.production_order_id,
      'output_lot_id', v_existing.output_lot_id,
      'output_lot_number', v_output_lot.lot_number,
      'produced_quantity', v_existing.produced_quantity,
      'rejected_quantity', v_existing.rejected_quantity,
      'status', v_order.status,
      'idempotent_replay', true
    );
  END IF;

  SELECT * INTO v_existing_key
    FROM public.production_completion_requests
   WHERE company_id = v_order.company_id AND idempotency_key = v_key;
  IF FOUND AND v_existing_key.production_order_id <> v_order.id THEN
    RAISE EXCEPTION 'idempotency_key já foi utilizada para outra OP'
      USING ERRCODE = '23505';
  END IF;

  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'OP já consta concluída sem solicitação transacional; reabertura/conclusão exige intervenção auditada'
      USING ERRCODE = '55000';
  END IF;
  IF v_order.status NOT IN ('in_progress', 'finishing', 'quality_check') THEN
    RAISE EXCEPTION 'OP precisa estar em produção, acabamento ou controle de qualidade para conclusão; status atual: %', v_order.status
      USING ERRCODE = '55000';
  END IF;
  IF v_order.product_id IS NULL THEN
    RAISE EXCEPTION 'OP sem produto vinculado não pode gerar lote de saída'
      USING ERRCODE = '23514';
  END IF;
  IF v_order.quantity IS NULL OR v_order.quantity <= 0 OR v_order.quantity = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Quantidade planejada da OP é inválida' USING ERRCODE = '23514';
  END IF;

  v_total_processed := p_produced_quantity + p_rejected_quantity;
  IF v_total_processed < v_order.quantity THEN
    RAISE EXCEPTION 'Quantidade processada (%) é parcial frente ao planejado (%); conclusão final não permitida', v_total_processed, v_order.quantity
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = v_order.product_id AND company_id = v_order.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(v_product.unit, '')), '') IS NOT NULL
     AND NULLIF(btrim(COALESCE(v_order.unit, '')), '') IS NOT NULL
     AND lower(btrim(v_product.unit)) <> lower(btrim(v_order.unit)) THEN
    RAISE EXCEPTION 'Unidade da OP (%) difere da unidade do produto (%); conversão configurada é obrigatória', v_order.unit, v_product.unit
      USING ERRCODE = '23514';
  END IF;

  IF v_order.route_id IS NULL THEN
    RAISE EXCEPTION 'OP sem roteiro congelado/vinculado não pode ser concluída por esta transação'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id
   FOR UPDATE;
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE status = 'completed'
             AND quantity_pending <= 0
         )::integer
    INTO v_step_count, v_step_completed
    FROM public.production_order_steps
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_step_count = 0 OR v_step_completed <> v_step_count THEN
    RAISE EXCEPTION 'OP possui operação obrigatória pendente ou quantidade de operação insuficiente (% de % concluídas)', v_step_completed, v_step_count
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
    FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id
   FOR UPDATE;
  SELECT count(*) FILTER (WHERE lower(status) = 'approved')::integer,
         COALESCE(sum(approved_quantity) FILTER (WHERE lower(status) = 'approved'), 0),
         COALESCE(sum(rejected_quantity), 0),
         COALESCE(bool_or(lower(status) IN (
           'blocked', 'rejected', 'quarantine', 'bloqueada', 'bloqueado',
           'rejeitada', 'rejeitado', 'quarentena'
         )), false)
    INTO v_quality_count, v_quality_approved, v_quality_rejected, v_quality_blocked
    FROM public.quality_inspections
   WHERE production_order_id = v_order.id AND company_id = v_order.company_id;
  IF v_quality_count = 0 THEN
    RAISE EXCEPTION 'OP sem inspeção de qualidade formalmente aprovada/liberada não pode ser concluída'
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_blocked THEN
    RAISE EXCEPTION 'OP possui inspeção de qualidade bloqueada/rejeitada/em quarentena'
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_approved < p_produced_quantity THEN
    RAISE EXCEPTION 'Quantidade aprovada na qualidade (%) é menor que a quantidade produzida (%)', v_quality_approved, p_produced_quantity
      USING ERRCODE = '23514';
  END IF;
  IF v_quality_rejected > p_rejected_quantity THEN
    RAISE EXCEPTION 'Quantidade rejeitada na qualidade (%) excede a rejeição declarada na conclusão (%)', v_quality_rejected, p_rejected_quantity
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_bom_count
    FROM public.pcp_order_bom_lines(v_order.id);
  IF v_bom_count = 0 THEN
    RAISE EXCEPTION 'Produto da OP não possui ficha de materiais (BOM) congelada/atual para comprovar consumo'
      USING ERRCODE = '23514';
  END IF;

  FOR v_bom IN
    SELECT * FROM public.pcp_order_bom_lines(v_order.id)
     ORDER BY component_code
  LOOP
    SELECT COALESCE(sum((elem ->> 'quantity')::numeric), 0) INTO v_allocated
      FROM jsonb_array_elements(p_input_allocations) elem
     WHERE (elem ->> 'component_id')::uuid = v_bom.component_id;
    IF v_allocated <= 0 THEN
      RAISE EXCEPTION 'Componente da ficha sem lote alocado: % (%)', v_bom.component_name, v_bom.component_code
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Trava e valida todos os lotes antes de qualquer escrita. A ordem por lote
  -- reduz deadlock entre OPs diferentes que disputam o mesmo insumo.
  FOR v_alloc IN
    SELECT (elem ->> 'component_id')::uuid AS component_id,
           (elem ->> 'lot_id')::uuid AS lot_id,
           sum((elem ->> 'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_input_allocations) elem
     GROUP BY 1, 2
     ORDER BY 2
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pcp_order_bom_lines(v_order.id)
       WHERE component_id = v_alloc.component_id
    ) THEN
      RAISE EXCEPTION 'Lote alocado para componente fora da ficha da OP: %', v_alloc.component_id
        USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_component
      FROM public.products
     WHERE id = v_alloc.component_id AND company_id = v_order.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Componente alocado não pertence à empresa da OP'
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_lot
      FROM public.stock_lots
     WHERE id = v_alloc.lot_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote de entrada não encontrado: %', v_alloc.lot_id
        USING ERRCODE = 'P0002';
    END IF;
    IF v_lot.company_id <> v_order.company_id OR v_lot.product_id <> v_alloc.component_id THEN
      RAISE EXCEPTION 'Lote % não pertence ao componente/empresa da alocação', v_lot.lot_number
        USING ERRCODE = '42501';
    END IF;
    IF lower(COALESCE(v_lot.status, '')) <> 'available' THEN
      RAISE EXCEPTION 'Lote % não está disponível (status: %)', v_lot.lot_number, v_lot.status
        USING ERRCODE = '23514';
    END IF;
    IF lower(COALESCE(v_lot.quality_status, '')) NOT IN (
      'approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada'
    ) THEN
      RAISE EXCEPTION 'Lote % não está liberado pela qualidade (quality_status: %)', v_lot.lot_number, v_lot.quality_status
        USING ERRCODE = '23514';
    END IF;
    IF v_lot.remaining_qty < v_alloc.quantity THEN
      RAISE EXCEPTION 'Lote % possui saldo restante insuficiente (%, requerido %)', v_lot.lot_number, v_lot.remaining_qty, v_alloc.quantity
        USING ERRCODE = '23514';
    END IF;

    FOR v_balance_id IN
      SELECT id
        FROM public.stock_balances
       WHERE company_id = v_order.company_id
         AND product_id = v_alloc.component_id
         AND lot_id = v_alloc.lot_id
         AND branch_id IS NOT DISTINCT FROM v_order.branch_id
         AND canal_operacional = v_canal
       ORDER BY id
       FOR UPDATE
    LOOP
      NULL;
    END LOOP;

    SELECT COALESCE(sum(quantity - reserved_qty), 0) INTO v_available
      FROM public.stock_balances
     WHERE company_id = v_order.company_id
       AND product_id = v_alloc.component_id
       AND lot_id = v_alloc.lot_id
       AND branch_id IS NOT DISTINCT FROM v_order.branch_id
       AND canal_operacional = v_canal;
    SELECT COALESCE(sum(reserved_qty - consumed_qty - released_qty), 0) INTO v_own_reserved
      FROM public.production_material_reservations
     WHERE company_id = v_order.company_id
       AND production_order_id = v_order.id
       AND component_id = v_alloc.component_id
       AND lot_id = v_alloc.lot_id
       AND status IN ('reserved', 'partially_consumed');
    v_available := v_available + COALESCE(v_own_reserved, 0);
    IF v_available < v_alloc.quantity THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente para o lote % (%, requerido %; reserva de outra OP/bloqueio não pode ser consumido)', v_lot.lot_number, v_available, v_alloc.quantity
        USING ERRCODE = '23514';
    END IF;

    v_total_input_cost := v_total_input_cost + (v_alloc.quantity * COALESCE(v_lot.unit_cost, 0));
  END LOOP;

  v_output_unit_cost := CASE WHEN p_produced_quantity > 0
                             THEN v_total_input_cost / p_produced_quantity
                             ELSE 0 END;
  v_output_lot_number := COALESCE(
    NULLIF(btrim(p_output_lot_number), ''),
    'PROD-' || v_order.order_number || '-' || upper(substr(md5(v_key), 1, 8))
  );
  IF EXISTS (
    SELECT 1 FROM public.stock_lots
     WHERE company_id = v_order.company_id AND lot_number = v_output_lot_number
  ) THEN
    RAISE EXCEPTION 'Já existe lote com o número % nesta empresa', v_output_lot_number
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.stock_lots (
    company_id, product_id, product_code, product_name, lot_number,
    quantity, remaining_qty, initial_quantity, consumed_qty, received_qty,
    unit_cost, origin, origin_type, origin_reference, status, quality_status,
    notes
  ) VALUES (
    v_order.company_id, v_order.product_id, v_order.product_code, v_order.product_name,
    v_output_lot_number, p_produced_quantity, p_produced_quantity,
    p_produced_quantity, 0, p_produced_quantity, v_output_unit_cost,
    'Produção OP ' || v_order.order_number, 'PRODUCAO', v_order.order_number,
    'available', 'approved',
    'Lote gerado por complete_production_order; custo unitário considera somente materiais dos lotes consumidos.'
  ) RETURNING id INTO v_output_lot_id;

  INSERT INTO public.production_completion_requests (
    company_id, branch_id, production_order_id, idempotency_key, requested_by,
    produced_quantity, rejected_quantity, output_lot_id, output_unit_cost, status
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, v_key, v_user_id,
    p_produced_quantity, p_rejected_quantity, v_output_lot_id, v_output_unit_cost,
    'completed'
  ) RETURNING id INTO v_completion_id;

  FOR v_alloc IN
    SELECT (elem ->> 'component_id')::uuid AS component_id,
           (elem ->> 'lot_id')::uuid AS lot_id,
           sum((elem ->> 'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(p_input_allocations) elem
     GROUP BY 1, 2
     ORDER BY 2
  LOOP
    SELECT * INTO v_lot FROM public.stock_lots WHERE id = v_alloc.lot_id;
    SELECT * INTO v_component
      FROM public.products
     WHERE id = v_alloc.component_id AND company_id = v_order.company_id;
    SELECT * INTO v_bom
      FROM public.pcp_order_bom_lines(v_order.id)
     WHERE component_id = v_alloc.component_id
     LIMIT 1;

    SELECT COALESCE(sum((elem ->> 'quantity')::numeric), 0) INTO v_allocated
      FROM jsonb_array_elements(p_input_allocations) elem
     WHERE (elem ->> 'component_id')::uuid = v_alloc.component_id;
    v_expected_total := v_bom.quantity * v_total_processed
                        * (1 + COALESCE(v_bom.waste_percentage, 0) / 100);
    v_expected_share := CASE WHEN v_allocated > 0
                             THEN v_expected_total * v_alloc.quantity / v_allocated
                             ELSE v_expected_total END;

    UPDATE public.stock_lots
       SET remaining_qty = remaining_qty - v_alloc.quantity,
           consumed_qty = COALESCE(consumed_qty, 0) + v_alloc.quantity,
           status = CASE WHEN remaining_qty - v_alloc.quantity <= 0 THEN 'consumed' ELSE status END,
           updated_at = now()
     WHERE id = v_alloc.lot_id AND company_id = v_order.company_id;

    v_remaining_from_reservation := v_alloc.quantity;
    FOR v_reservation IN
      SELECT * FROM public.production_material_reservations
       WHERE company_id = v_order.company_id
         AND production_order_id = v_order.id
         AND component_id = v_alloc.component_id
         AND lot_id = v_alloc.lot_id
         AND status IN ('reserved', 'partially_consumed')
       ORDER BY reserved_at, id
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_from_reservation <= 0;
      v_take_reserved := LEAST(
        v_remaining_from_reservation,
        v_reservation.reserved_qty - v_reservation.consumed_qty - v_reservation.released_qty
      );
      IF v_take_reserved <= 0 THEN CONTINUE; END IF;
      IF v_reservation.stock_balance_id IS NOT NULL THEN
        UPDATE public.stock_balances
           SET reserved_qty = GREATEST(0, reserved_qty - v_take_reserved), updated_at = now()
         WHERE id = v_reservation.stock_balance_id AND company_id = v_order.company_id;
      END IF;
      UPDATE public.production_material_reservations
         SET consumed_qty = consumed_qty + v_take_reserved,
             status = CASE WHEN consumed_qty + v_take_reserved + released_qty >= reserved_qty THEN 'consumed' ELSE 'partially_consumed' END,
             closed_at = CASE WHEN consumed_qty + v_take_reserved + released_qty >= reserved_qty THEN now() ELSE closed_at END,
             updated_at = now()
       WHERE id = v_reservation.id;
      v_remaining_from_reservation := v_remaining_from_reservation - v_take_reserved;
    END LOOP;

    INSERT INTO public.stock_movements (
      company_id, branch_id, canal_operacional, product_id, product_code,
      product_name, type, direction, quantity, unit_cost, total_cost,
      document_number, operator, source, origin, destination, reference,
      notes, lot_id, batch
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_canal, v_component.id,
      v_component.code, v_component.name, 'production_consumption', 'out',
      v_alloc.quantity, COALESCE(v_lot.unit_cost, 0),
      v_alloc.quantity * COALESCE(v_lot.unit_cost, 0),
      'PROD-' || v_order.order_number, v_user_id::text, 'production_completion',
      'production_completion', 'OP ' || v_order.order_number,
      'production_order_id=' || v_order.id::text,
      'Consumo por lote na conclusão transacional; completion_id=' || v_completion_id::text,
      v_alloc.lot_id, v_lot.lot_number
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.material_consumptions (
      company_id, production_order_id, order_number, component_code,
      component_name, expected_quantity, consumed_quantity, unit, batch,
      location, consumed_by, lot_id, completion_id, stock_movement_id
    ) VALUES (
      v_order.company_id, v_order.id, v_order.order_number, v_component.code,
      v_component.name, v_expected_share, v_alloc.quantity, v_component.unit,
      v_lot.lot_number, v_lot.location, v_user_id::text, v_alloc.lot_id,
      v_completion_id, v_movement_id
    );

    INSERT INTO public.production_lot_genealogy (
      company_id, branch_id, production_order_id, completion_id, input_lot_id,
      output_lot_id, input_quantity, output_quantity, input_unit, output_unit,
      conversion_reference, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_completion_id,
      v_alloc.lot_id, v_output_lot_id, v_alloc.quantity, p_produced_quantity,
      v_component.unit, COALESCE(NULLIF(v_order.unit, ''), v_product.unit),
      CASE
        WHEN lower(COALESCE(v_component.unit, '')) = lower(COALESCE(NULLIF(v_order.unit, ''), v_product.unit))
          THEN 'Mesma unidade do produto de saída; consumo registrado na unidade do componente.'
        ELSE 'Referência configurada na ficha: ' || v_bom.quantity::text || ' '
             || COALESCE(v_component.unit, 'sem unidade') || ' por unidade-base da ficha, perda planejada '
             || COALESCE(v_bom.waste_percentage, 0)::text || '%. Nenhuma conversão universal foi presumida.'
      END,
      v_user_id
    );
  END LOOP;

  INSERT INTO public.stock_movements (
    company_id, branch_id, canal_operacional, product_id, product_code,
    product_name, type, direction, quantity, unit_cost, total_cost,
    document_number, operator, source, origin, destination, reference,
    notes, lot_id, batch
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_canal, v_order.product_id,
    v_order.product_code, v_order.product_name, 'production', 'in',
    p_produced_quantity, v_output_unit_cost, v_total_input_cost,
    'PROD-' || v_order.order_number, v_user_id::text, 'production_completion',
    'OP ' || v_order.order_number, 'production_completion',
    'production_order_id=' || v_order.id::text,
    'Entrada do lote produzido na conclusão transacional; completion_id=' || v_completion_id::text,
    v_output_lot_id, v_output_lot_number
  );

  FOR v_reservation IN
    SELECT * FROM public.production_material_reservations
     WHERE company_id = v_order.company_id
       AND production_order_id = v_order.id
       AND status IN ('reserved', 'partially_consumed')
     ORDER BY reserved_at, id
     FOR UPDATE
  LOOP
    v_take_reserved := v_reservation.reserved_qty - v_reservation.consumed_qty - v_reservation.released_qty;
    IF v_take_reserved <= 0 THEN CONTINUE; END IF;
    IF v_reservation.stock_balance_id IS NOT NULL THEN
      UPDATE public.stock_balances
         SET reserved_qty = GREATEST(0, reserved_qty - v_take_reserved), updated_at = now()
       WHERE id = v_reservation.stock_balance_id AND company_id = v_order.company_id;
    END IF;
    UPDATE public.production_material_reservations
       SET released_qty = released_qty + v_take_reserved,
           status = CASE WHEN consumed_qty > 0 THEN 'consumed' ELSE 'released' END,
           closed_at = now(), updated_at = now()
     WHERE id = v_reservation.id;
  END LOOP;

  UPDATE public.production_orders
     SET status = 'completed',
         produced_quantity = p_produced_quantity,
         rejected_quantity = p_rejected_quantity,
         completed_date = now(),
         updated_at = now()
   WHERE id = v_order.id AND company_id = v_order.company_id;

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

REVOKE ALL ON FUNCTION public.complete_production_order(uuid, text, numeric, numeric, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_order(uuid, text, numeric, numeric, jsonb, text)
  TO authenticated, service_role;
