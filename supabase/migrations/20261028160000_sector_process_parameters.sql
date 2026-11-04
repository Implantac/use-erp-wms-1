-- ============================================================================
-- Parâmetros próprios de fiação e tinturaria (T82/P1)
--
-- Os perfis setoriais tinham apenas título/torção (fiação) e cor/banho/Lab
-- (tinturaria). Esta migration adiciona os campos estruturados de processo
-- de cada setor — mistura e parâmetros do filatório; pré-tratamento e
-- parâmetros do banho — sempre informados pela empresa, nunca presumidos.
-- ============================================================================

ALTER TABLE public.spinning_order_profiles
  ADD COLUMN IF NOT EXISTS blend_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roving_title text,
  ADD COLUMN IF NOT EXISTS draft_ratio numeric,
  ADD COLUMN IF NOT EXISTS spindle_speed_rpm numeric,
  ADD COLUMN IF NOT EXISTS delivery_speed_m_min numeric,
  ADD COLUMN IF NOT EXISTS traveler_code text;

ALTER TABLE public.spinning_order_profiles
  DROP CONSTRAINT IF EXISTS spinning_order_profiles_process_nonnegative;
ALTER TABLE public.spinning_order_profiles
  ADD CONSTRAINT spinning_order_profiles_process_nonnegative CHECK (
    jsonb_typeof(blend_components) = 'array'
    AND (draft_ratio IS NULL OR draft_ratio >= 0)
    AND (spindle_speed_rpm IS NULL OR spindle_speed_rpm >= 0)
    AND (delivery_speed_m_min IS NULL OR delivery_speed_m_min >= 0)
  );

ALTER TABLE public.dyeing_order_profiles
  ADD COLUMN IF NOT EXISTS pretreatment_applicable boolean,
  ADD COLUMN IF NOT EXISTS pretreatment_type text,
  ADD COLUMN IF NOT EXISTS pretreatment_recipe_code text,
  ADD COLUMN IF NOT EXISTS pretreatment_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS pretreatment_time_min numeric,
  ADD COLUMN IF NOT EXISTS dye_recipe_code text,
  ADD COLUMN IF NOT EXISTS dyeing_temperature_c numeric,
  ADD COLUMN IF NOT EXISTS dyeing_time_min numeric,
  ADD COLUMN IF NOT EXISTS ph_target numeric;

ALTER TABLE public.dyeing_order_profiles
  DROP CONSTRAINT IF EXISTS dyeing_order_profiles_process_ranges;
ALTER TABLE public.dyeing_order_profiles
  ADD CONSTRAINT dyeing_order_profiles_process_ranges CHECK (
    (pretreatment_temperature_c IS NULL OR pretreatment_temperature_c >= 0)
    AND (pretreatment_time_min IS NULL OR pretreatment_time_min >= 0)
    AND (dyeing_temperature_c IS NULL OR dyeing_temperature_c >= 0)
    AND (dyeing_time_min IS NULL OR dyeing_time_min >= 0)
    AND (ph_target IS NULL OR (ph_target >= 0 AND ph_target <= 14))
  );

-- Recria a implementação do perfil setorial (base: 20261023210000) com os
-- novos campos de fiação/tinturaria. O wrapper público de permissão por
-- setor continua o mesmo.
CREATE OR REPLACE FUNCTION public.upsert_sector_order_profile_impl(
  p_production_order_id uuid,
  p_sector text,
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
  v_machine_id uuid := NULLIF(p_profile ->> 'machine_id', '')::uuid;
  v_blend jsonb := COALESCE(p_profile -> 'blend_components', '[]'::jsonb);
  v_blend_item jsonb;
  v_blend_total numeric := 0;
  v_pretreatment_applicable boolean := CASE
    WHEN NULLIF(p_profile ->> 'pretreatment_applicable', '') IS NULL THEN NULL
    ELSE (p_profile ->> 'pretreatment_applicable')::boolean
  END;
BEGIN
  IF p_sector NOT IN ('fiacao', 'malharia', 'tinturaria', 'beneficiamento') THEN
    RAISE EXCEPTION 'Setor sem perfil próprio nesta função: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Perfil do setor não pode ser alterado em OP concluída/cancelada' USING ERRCODE = '55000';
  END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Perfil do setor deve ser um objeto JSON' USING ERRCODE = '22023';
  END IF;
  IF v_machine_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_machines WHERE id = v_machine_id AND company_id = v_order.company_id AND active
  ) THEN RAISE EXCEPTION 'Máquina não pertence à empresa ou está inativa' USING ERRCODE = '42501'; END IF;

  IF p_sector = 'fiacao' THEN
    IF jsonb_typeof(v_blend) <> 'array' THEN
      RAISE EXCEPTION 'A mistura da fiação deve ser uma lista de componentes' USING ERRCODE = '22023';
    END IF;
    FOR v_blend_item IN SELECT value FROM jsonb_array_elements(v_blend)
    LOOP
      IF NULLIF(btrim(COALESCE(v_blend_item ->> 'name', '')), '') IS NULL THEN
        RAISE EXCEPTION 'Todo componente da mistura precisa de nome' USING ERRCODE = '22023';
      END IF;
      IF NULLIF(v_blend_item ->> 'pct', '') IS NOT NULL THEN
        IF (v_blend_item ->> 'pct')::numeric < 0 OR (v_blend_item ->> 'pct')::numeric > 100 THEN
          RAISE EXCEPTION 'Percentual da mistura deve ficar entre 0 e 100' USING ERRCODE = '22023';
        END IF;
        v_blend_total := v_blend_total + (v_blend_item ->> 'pct')::numeric;
      END IF;
    END LOOP;
    IF v_blend_total > 100.0005 THEN
      RAISE EXCEPTION 'A soma dos percentuais da mistura não pode passar de 100' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.spinning_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      target_title, twist_per_m, planned_output_kg, notes, created_by,
      blend_components, roving_title, draft_ratio, spindle_speed_rpm,
      delivery_speed_m_min, traveler_code
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'target_title'), ''),
      NULLIF(p_profile ->> 'twist_per_m', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid(),
      v_blend,
      NULLIF(btrim(p_profile ->> 'roving_title'), ''),
      NULLIF(p_profile ->> 'draft_ratio', '')::numeric,
      NULLIF(p_profile ->> 'spindle_speed_rpm', '')::numeric,
      NULLIF(p_profile ->> 'delivery_speed_m_min', '')::numeric,
      NULLIF(btrim(p_profile ->> 'traveler_code'), '')
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, target_title = EXCLUDED.target_title,
      twist_per_m = EXCLUDED.twist_per_m, planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes,
      blend_components = EXCLUDED.blend_components,
      roving_title = EXCLUDED.roving_title, draft_ratio = EXCLUDED.draft_ratio,
      spindle_speed_rpm = EXCLUDED.spindle_speed_rpm,
      delivery_speed_m_min = EXCLUDED.delivery_speed_m_min,
      traveler_code = EXCLUDED.traveler_code, updated_at = now()
    RETURNING id INTO v_profile_id;
  ELSIF p_sector = 'malharia' THEN
    INSERT INTO public.knitting_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      gauge, diameter_cm, target_grammage_g_m2, target_width_cm,
      planned_output_kg, notes, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'gauge'), ''),
      NULLIF(p_profile ->> 'diameter_cm', '')::numeric,
      NULLIF(p_profile ->> 'target_grammage_g_m2', '')::numeric,
      NULLIF(p_profile ->> 'target_width_cm', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, gauge = EXCLUDED.gauge,
      diameter_cm = EXCLUDED.diameter_cm,
      target_grammage_g_m2 = EXCLUDED.target_grammage_g_m2,
      target_width_cm = EXCLUDED.target_width_cm,
      planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_profile_id;
  ELSIF p_sector = 'tinturaria' THEN
    IF v_pretreatment_applicable IS TRUE
       AND NULLIF(btrim(COALESCE(p_profile ->> 'pretreatment_type', '')), '') IS NULL
       AND NULLIF(btrim(COALESCE(p_profile ->> 'pretreatment_recipe_code', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Pré-tratamento aplicável exige o tipo ou a receita da empresa' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dyeing_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      color_name, color_code, bath_ratio, batch_code, lab_l, lab_a, lab_b,
      measured_lab_l, measured_lab_a, measured_lab_b,
      planned_output_kg, notes, created_by,
      pretreatment_applicable, pretreatment_type, pretreatment_recipe_code,
      pretreatment_temperature_c, pretreatment_time_min, dye_recipe_code,
      dyeing_temperature_c, dyeing_time_min, ph_target
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'color_name'), ''),
      NULLIF(btrim(p_profile ->> 'color_code'), ''),
      NULLIF(p_profile ->> 'bath_ratio', '')::numeric,
      NULLIF(btrim(p_profile ->> 'batch_code'), ''),
      NULLIF(p_profile ->> 'lab_l', '')::numeric,
      NULLIF(p_profile ->> 'lab_a', '')::numeric,
      NULLIF(p_profile ->> 'lab_b', '')::numeric,
      NULLIF(p_profile ->> 'measured_lab_l', '')::numeric,
      NULLIF(p_profile ->> 'measured_lab_a', '')::numeric,
      NULLIF(p_profile ->> 'measured_lab_b', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid(),
      v_pretreatment_applicable,
      CASE WHEN v_pretreatment_applicable IS FALSE THEN NULL ELSE NULLIF(btrim(p_profile ->> 'pretreatment_type'), '') END,
      CASE WHEN v_pretreatment_applicable IS FALSE THEN NULL ELSE NULLIF(btrim(p_profile ->> 'pretreatment_recipe_code'), '') END,
      CASE WHEN v_pretreatment_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'pretreatment_temperature_c', '')::numeric END,
      CASE WHEN v_pretreatment_applicable IS FALSE THEN NULL ELSE NULLIF(p_profile ->> 'pretreatment_time_min', '')::numeric END,
      NULLIF(btrim(p_profile ->> 'dye_recipe_code'), ''),
      NULLIF(p_profile ->> 'dyeing_temperature_c', '')::numeric,
      NULLIF(p_profile ->> 'dyeing_time_min', '')::numeric,
      NULLIF(p_profile ->> 'ph_target', '')::numeric
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, color_name = EXCLUDED.color_name,
      color_code = EXCLUDED.color_code, bath_ratio = EXCLUDED.bath_ratio,
      batch_code = EXCLUDED.batch_code, lab_l = EXCLUDED.lab_l,
      lab_a = EXCLUDED.lab_a, lab_b = EXCLUDED.lab_b,
      measured_lab_l = EXCLUDED.measured_lab_l,
      measured_lab_a = EXCLUDED.measured_lab_a,
      measured_lab_b = EXCLUDED.measured_lab_b,
      planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes,
      pretreatment_applicable = EXCLUDED.pretreatment_applicable,
      pretreatment_type = EXCLUDED.pretreatment_type,
      pretreatment_recipe_code = EXCLUDED.pretreatment_recipe_code,
      pretreatment_temperature_c = EXCLUDED.pretreatment_temperature_c,
      pretreatment_time_min = EXCLUDED.pretreatment_time_min,
      dye_recipe_code = EXCLUDED.dye_recipe_code,
      dyeing_temperature_c = EXCLUDED.dyeing_temperature_c,
      dyeing_time_min = EXCLUDED.dyeing_time_min,
      ph_target = EXCLUDED.ph_target, updated_at = now()
    RETURNING id INTO v_profile_id;
  ELSE
    INSERT INTO public.beneficiamento_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      process_type, target_width_cm, target_grammage_g_m2, target_shrinkage_pct,
      temperature_c, speed_m_min, planned_output_m, notes, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'process_type'), ''),
      NULLIF(p_profile ->> 'target_width_cm', '')::numeric,
      NULLIF(p_profile ->> 'target_grammage_g_m2', '')::numeric,
      NULLIF(p_profile ->> 'target_shrinkage_pct', '')::numeric,
      NULLIF(p_profile ->> 'temperature_c', '')::numeric,
      NULLIF(p_profile ->> 'speed_m_min', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_m', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, process_type = EXCLUDED.process_type,
      target_width_cm = EXCLUDED.target_width_cm,
      target_grammage_g_m2 = EXCLUDED.target_grammage_g_m2,
      target_shrinkage_pct = EXCLUDED.target_shrinkage_pct,
      temperature_c = EXCLUDED.temperature_c, speed_m_min = EXCLUDED.speed_m_min,
      planned_output_m = EXCLUDED.planned_output_m,
      notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'production_order_id', v_order.id, 'sector', p_sector, 'status', 'saved');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_sector_order_profile_impl(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sector_order_profile_impl(uuid, text, jsonb) TO service_role;

COMMENT ON COLUMN public.spinning_order_profiles.blend_components IS
  'Mistura configurada pela empresa: lista de componentes e percentuais informados.';
COMMENT ON COLUMN public.dyeing_order_profiles.pretreatment_type IS
  'Pré-tratamento configurado pela empresa, quando aplicável; nunca presumido.';
