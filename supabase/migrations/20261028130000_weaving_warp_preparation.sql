-- ============================================================================
-- Preparação do urdume e engomagem na OP de tecelagem (T81/P1)
--
-- A montagem do tear já guardava rolo de urdume, fios e parâmetros do artigo,
-- mas urdideira/engomagem não tinham campos próprios. Esta migration amplia
-- o perfil existente da OP (sem tabela paralela) com o estado da preparação
-- e os dados de engomagem informados pela empresa.
--
-- Nenhuma receita, concentração, temperatura ou velocidade é presumida. Se a
-- empresa marcar engomagem como aplicável, precisa identificar o produto de
-- goma ou o código/receita que ela aprovou.
-- ============================================================================

ALTER TABLE public.weaving_order_profiles
  ADD COLUMN IF NOT EXISTS warp_preparation_status text NOT NULL DEFAULT 'not_informed',
  ADD COLUMN IF NOT EXISTS warper_machine_id uuid REFERENCES public.production_machines(id),
  ADD COLUMN IF NOT EXISTS warper_resource_id uuid REFERENCES public.production_resources(id),
  ADD COLUMN IF NOT EXISTS sizing_applicable boolean,
  ADD COLUMN IF NOT EXISTS size_product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS size_lot_id uuid REFERENCES public.stock_lots(id),
  ADD COLUMN IF NOT EXISTS size_recipe_code text,
  ADD COLUMN IF NOT EXISTS size_concentration_pct numeric,
  ADD COLUMN IF NOT EXISTS sizing_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS sizing_speed_m_min numeric,
  ADD COLUMN IF NOT EXISTS drying_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS warp_moisture_pct numeric,
  ADD COLUMN IF NOT EXISTS warp_prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS warp_prepared_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS warp_preparation_notes text;

ALTER TABLE public.weaving_order_profiles
  DROP CONSTRAINT IF EXISTS weaving_order_profiles_warp_preparation_status_check;
ALTER TABLE public.weaving_order_profiles
  ADD CONSTRAINT weaving_order_profiles_warp_preparation_status_check
  CHECK (warp_preparation_status IN ('not_informed', 'warped', 'sized', 'ready', 'not_applicable'));

ALTER TABLE public.weaving_order_profiles
  DROP CONSTRAINT IF EXISTS weaving_order_profiles_warp_preparation_nonnegative;
ALTER TABLE public.weaving_order_profiles
  ADD CONSTRAINT weaving_order_profiles_warp_preparation_nonnegative CHECK (
    (size_concentration_pct IS NULL OR (size_concentration_pct >= 0 AND size_concentration_pct <= 100))
    AND (sizing_temperature_c IS NULL OR sizing_temperature_c >= 0)
    AND (sizing_speed_m_min IS NULL OR sizing_speed_m_min >= 0)
    AND (drying_temperature_c IS NULL OR drying_temperature_c >= 0)
    AND (warp_moisture_pct IS NULL OR (warp_moisture_pct >= 0 AND warp_moisture_pct <= 100))
  );

CREATE INDEX IF NOT EXISTS weaving_order_profiles_warper_idx
  ON public.weaving_order_profiles (company_id, warper_machine_id, warp_preparation_status);

-- Recria a função interna do perfil incluindo a preparação do urdume.
-- A RPC pública continua sendo upsert_weaving_order_profile (com o wrapper
-- de permissão por setor criado em 20261019210000).
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
  v_warper_machine_id uuid := NULLIF(p_profile ->> 'warper_machine_id', '')::uuid;
  v_warper_resource_id uuid := NULLIF(p_profile ->> 'warper_resource_id', '')::uuid;
  v_size_product_id uuid := NULLIF(p_profile ->> 'size_product_id', '')::uuid;
  v_size_lot_id uuid := NULLIF(p_profile ->> 'size_lot_id', '')::uuid;
  v_sizing_applicable boolean := CASE
    WHEN NULLIF(p_profile ->> 'sizing_applicable', '') IS NULL THEN NULL
    ELSE (p_profile ->> 'sizing_applicable')::boolean
  END;
  v_warp_status text := COALESCE(NULLIF(btrim(p_profile ->> 'warp_preparation_status'), ''), 'not_informed');
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

  IF v_warp_status NOT IN ('not_informed', 'warped', 'sized', 'ready', 'not_applicable') THEN
    RAISE EXCEPTION 'Estado da preparação do urdume inválido' USING ERRCODE = '22023';
  END IF;
  IF v_warper_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = v_warper_machine_id AND company_id = p_order.company_id AND active
  ) THEN RAISE EXCEPTION 'Urdideira não pertence à empresa ou está inativa' USING ERRCODE = '42501'; END IF;
  IF v_warper_resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources WHERE id = v_warper_resource_id AND company_id = p_order.company_id AND is_active
  ) THEN RAISE EXCEPTION 'Recurso da urdideira não pertence à empresa ou está inativo' USING ERRCODE = '42501'; END IF;
  IF v_size_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = v_size_product_id AND company_id = p_order.company_id
  ) THEN RAISE EXCEPTION 'Produto de goma não pertence à empresa' USING ERRCODE = '42501'; END IF;
  IF v_size_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stock_lots WHERE id = v_size_lot_id AND company_id = p_order.company_id
      AND (v_size_product_id IS NULL OR product_id = v_size_product_id)
  ) THEN RAISE EXCEPTION 'Lote de goma incompatível com o produto/empresa' USING ERRCODE = '42501'; END IF;

  IF v_sizing_applicable IS TRUE THEN
    IF v_size_product_id IS NULL AND NULLIF(btrim(COALESCE(p_profile ->> 'size_recipe_code', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Engomagem aplicável exige o produto de goma ou o código/receita aprovada pela empresa'
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_sizing_applicable IS FALSE THEN
    -- Sem engomagem, os campos de goma não fazem sentido nesta OP.
    v_size_product_id := NULL;
    v_size_lot_id := NULL;
  END IF;
  IF v_warp_status = 'sized' AND v_sizing_applicable IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Estado "engomado" exige marcar a engomagem como aplicável' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.weaving_order_profiles (
    company_id, branch_id, production_order_id, loom_resource_id, machine_id,
    work_center, warp_product_id, weft_product_id, warp_lot_id, weft_lot_id,
    beam_code, reed_code, picks_per_cm, warp_thread_count, planned_width_cm,
    planned_length_m, setup_minutes, notes, created_by,
    warp_preparation_status, warper_machine_id, warper_resource_id,
    sizing_applicable, size_product_id, size_lot_id, size_recipe_code,
    size_concentration_pct, sizing_temperature_c, sizing_speed_m_min,
    drying_temperature_c, warp_moisture_pct, warp_prepared_at, warp_prepared_by,
    warp_preparation_notes
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
    NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid(),
    v_warp_status, v_warper_machine_id, v_warper_resource_id,
    v_sizing_applicable, v_size_product_id, v_size_lot_id,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL ELSE NULLIF(btrim(p_profile ->> 'size_recipe_code'), '') END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'size_concentration_pct', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'sizing_temperature_c', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'sizing_speed_m_min', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'drying_temperature_c', '')::numeric END,
    NULLIF(p_profile ->> 'warp_moisture_pct', '')::numeric,
    CASE WHEN v_warp_status IN ('warped', 'sized', 'ready') THEN now() ELSE NULL END,
    CASE WHEN v_warp_status IN ('warped', 'sized', 'ready') THEN auth.uid() ELSE NULL END,
    NULLIF(btrim(p_profile ->> 'warp_preparation_notes'), '')
  )
  ON CONFLICT (production_order_id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id, loom_resource_id = EXCLUDED.loom_resource_id,
    machine_id = EXCLUDED.machine_id, work_center = EXCLUDED.work_center,
    warp_product_id = EXCLUDED.warp_product_id, weft_product_id = EXCLUDED.weft_product_id,
    warp_lot_id = EXCLUDED.warp_lot_id, weft_lot_id = EXCLUDED.weft_lot_id,
    beam_code = EXCLUDED.beam_code, reed_code = EXCLUDED.reed_code,
    picks_per_cm = EXCLUDED.picks_per_cm, warp_thread_count = EXCLUDED.warp_thread_count,
    planned_width_cm = EXCLUDED.planned_width_cm, planned_length_m = EXCLUDED.planned_length_m,
    setup_minutes = EXCLUDED.setup_minutes, notes = EXCLUDED.notes,
    warp_preparation_status = EXCLUDED.warp_preparation_status,
    warper_machine_id = EXCLUDED.warper_machine_id,
    warper_resource_id = EXCLUDED.warper_resource_id,
    sizing_applicable = EXCLUDED.sizing_applicable,
    size_product_id = EXCLUDED.size_product_id,
    size_lot_id = EXCLUDED.size_lot_id,
    size_recipe_code = EXCLUDED.size_recipe_code,
    size_concentration_pct = EXCLUDED.size_concentration_pct,
    sizing_temperature_c = EXCLUDED.sizing_temperature_c,
    sizing_speed_m_min = EXCLUDED.sizing_speed_m_min,
    drying_temperature_c = EXCLUDED.drying_temperature_c,
    warp_moisture_pct = EXCLUDED.warp_moisture_pct,
    warp_prepared_at = CASE
      WHEN EXCLUDED.warp_preparation_status IN ('warped', 'sized', 'ready')
        THEN COALESCE(public.weaving_order_profiles.warp_prepared_at, now())
      ELSE public.weaving_order_profiles.warp_prepared_at
    END,
    warp_prepared_by = CASE
      WHEN EXCLUDED.warp_preparation_status IN ('warped', 'sized', 'ready')
        THEN COALESCE(public.weaving_order_profiles.warp_prepared_by, auth.uid())
      ELSE public.weaving_order_profiles.warp_prepared_by
    END,
    warp_preparation_notes = EXCLUDED.warp_preparation_notes,
    updated_at = now()
  RETURNING id INTO v_profile_id;
  RETURN v_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) TO service_role;

COMMENT ON COLUMN public.weaving_order_profiles.warp_preparation_status IS
  'Estado informado da preparação do urdume: não informado, urdido, engomado, pronto ou não aplicável.';
COMMENT ON COLUMN public.weaving_order_profiles.size_recipe_code IS
  'Código/receita de engomagem aprovada pela empresa; nunca presumido pelo sistema.';
