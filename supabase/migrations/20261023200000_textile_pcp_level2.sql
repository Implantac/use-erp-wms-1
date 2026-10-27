-- ============================================================================
-- PCP têxtil nível 2 — profundidade de processo (revisão 2026-10-23)
--
-- Malharia: gramatura alvo (g/m²) e largura alvo (cm) no perfil da OP —
-- os números que o gerente de malharia confere, sempre configurados.
-- Tinturaria: L*a*b* MEDIDO da partida (o alvo já existia), para o ΔE
-- contra a meta ser calculado de medição real, nunca estimado.
--
-- A escrita continua exclusiva da RPC com guarda de setor: esta migration
-- substitui apenas a implementação (`upsert_sector_order_profile_impl`);
-- o wrapper com `assert_sector_access(...,'manager')` permanece intacto.
--
-- Rollback manual:
--   ALTER TABLE public.dyeing_order_profiles
--     DROP COLUMN IF EXISTS measured_lab_l, DROP COLUMN IF EXISTS measured_lab_a,
--     DROP COLUMN IF EXISTS measured_lab_b;
--   ALTER TABLE public.knitting_order_profiles
--     DROP COLUMN IF EXISTS target_grammage_g_m2, DROP COLUMN IF EXISTS target_width_cm;
--   (e restaurar o corpo de upsert_sector_order_profile_impl de 20261019180000)
-- ============================================================================

ALTER TABLE public.knitting_order_profiles
  ADD COLUMN IF NOT EXISTS target_grammage_g_m2 numeric,
  ADD COLUMN IF NOT EXISTS target_width_cm numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knitting_order_profiles_targets_nonnegative') THEN
    ALTER TABLE public.knitting_order_profiles
      ADD CONSTRAINT knitting_order_profiles_targets_nonnegative CHECK (
        (target_grammage_g_m2 IS NULL OR target_grammage_g_m2 >= 0)
        AND (target_width_cm IS NULL OR target_width_cm >= 0)
      );
  END IF;
END $$;

ALTER TABLE public.dyeing_order_profiles
  ADD COLUMN IF NOT EXISTS measured_lab_l numeric,
  ADD COLUMN IF NOT EXISTS measured_lab_a numeric,
  ADD COLUMN IF NOT EXISTS measured_lab_b numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dyeing_order_profiles_measured_lab_range') THEN
    ALTER TABLE public.dyeing_order_profiles
      ADD CONSTRAINT dyeing_order_profiles_measured_lab_range CHECK (
        (measured_lab_l IS NULL OR (measured_lab_l >= 0 AND measured_lab_l <= 100))
        AND (measured_lab_a IS NULL OR (measured_lab_a >= -128 AND measured_lab_a <= 127))
        AND (measured_lab_b IS NULL OR (measured_lab_b >= -128 AND measured_lab_b <= 127))
      );
  END IF;
END $$;

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
BEGIN
  IF p_sector NOT IN ('fiacao', 'malharia', 'tinturaria') THEN
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
    INSERT INTO public.spinning_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      target_title, twist_per_m, planned_output_kg, notes, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'target_title'), ''),
      NULLIF(p_profile ->> 'twist_per_m', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, target_title = EXCLUDED.target_title,
      twist_per_m = EXCLUDED.twist_per_m, planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes, updated_at = now()
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
  ELSE
    INSERT INTO public.dyeing_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      color_name, color_code, bath_ratio, batch_code, lab_l, lab_a, lab_b,
      measured_lab_l, measured_lab_a, measured_lab_b,
      planned_output_kg, notes, created_by
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
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
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
      notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'production_order_id', v_order.id, 'sector', p_sector, 'status', 'saved');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_sector_order_profile_impl(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sector_order_profile_impl(uuid, text, jsonb) TO service_role;
