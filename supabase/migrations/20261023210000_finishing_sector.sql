-- ============================================================================
-- Beneficiamento/Acabamento como QUINTO setor de PCP têxtil
-- (achado P1-1 da revisão docs/REVISAO-PCP-TEXTIL.md)
--
-- Até aqui, "Tinturaria e Acabamento" caía na tinturaria. Na cadeia real
-- são operações distintas: perfil próprio (rama/acabamento), eventos
-- próprios sobre o mesmo motor de execução, indicadores e acesso.
--
-- Escrita apenas via RPC com guarda de setor (mesmo padrão dos demais):
-- esta migration amplia as listas de setor/eventos das implementações
-- (`upsert_sector_order_profile_impl`, `record_sector_event_impl`) e das
-- guardas de acesso; os wrappers públicos permanecem intactos.
--
-- Rollback manual:
--   DROP TABLE IF EXISTS public.beneficiamento_order_profiles;
--   (restaurar CHECKs de sector_production_events e os corpos das funções
--    substituídas a partir de 20261023200000/20261019190000/20261019210000)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfil técnico do beneficiamento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beneficiamento_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES public.production_machines(id),
  work_center text,
  process_type text,
  target_width_cm numeric,
  target_grammage_g_m2 numeric,
  target_shrinkage_pct numeric,
  temperature_c numeric,
  speed_m_min numeric,
  planned_output_m numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beneficiamento_order_profiles_nonnegative CHECK (
    (target_width_cm IS NULL OR target_width_cm >= 0)
    AND (target_grammage_g_m2 IS NULL OR target_grammage_g_m2 >= 0)
    AND (target_shrinkage_pct IS NULL OR target_shrinkage_pct >= 0)
    AND (temperature_c IS NULL OR temperature_c >= 0)
    AND (speed_m_min IS NULL OR speed_m_min >= 0)
    AND (planned_output_m IS NULL OR planned_output_m >= 0)
  )
);
CREATE INDEX IF NOT EXISTS beneficiamento_order_profiles_company_idx
  ON public.beneficiamento_order_profiles (company_id, production_order_id);
ALTER TABLE public.beneficiamento_order_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beneficiamento_order_profiles_select ON public.beneficiamento_order_profiles;
CREATE POLICY beneficiamento_order_profiles_select ON public.beneficiamento_order_profiles
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.beneficiamento_order_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.beneficiamento_order_profiles TO authenticated;
GRANT ALL ON public.beneficiamento_order_profiles TO service_role;

-- ---------------------------------------------------------------------------
-- Eventos: beneficiamento entra na tabela setorial com vocabulário próprio
-- ---------------------------------------------------------------------------
ALTER TABLE public.sector_production_events
  DROP CONSTRAINT IF EXISTS sector_production_events_sector_check;
ALTER TABLE public.sector_production_events
  ADD CONSTRAINT sector_production_events_sector_check
  CHECK (sector IN ('fiacao', 'malharia', 'tinturaria', 'beneficiamento'));

ALTER TABLE public.sector_production_events
  DROP CONSTRAINT IF EXISTS sector_production_events_type_check;
ALTER TABLE public.sector_production_events
  ADD CONSTRAINT sector_production_events_type_check CHECK (event_type IN (
    'setup', 'start', 'pause', 'resume', 'stop',
    'doffing', 'fiber_break',
    'yarn_break', 'roll_change',
    'bath_start', 'wash', 'unload', 'color_hold', 'color_release', 're_dye',
    'rama_start', 'width_check', 'shrinkage_check',
    'quality_hold', 'quality_release', 'inspection', 'note'
  ));

-- ---------------------------------------------------------------------------
-- Acesso por setor: beneficiamento nas guardas e nas concessões
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_sector_access
  DROP CONSTRAINT IF EXISTS user_sector_access_sector_check;
ALTER TABLE public.user_sector_access
  ADD CONSTRAINT user_sector_access_sector_check
  CHECK (sector IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria', 'beneficiamento'));

CREATE OR REPLACE FUNCTION public.sector_access_allowed(p_sector text, p_min_level text DEFAULT 'viewer')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_rank int := CASE p_min_level WHEN 'viewer' THEN 1 WHEN 'operator' THEN 2 WHEN 'manager' THEN 3 ELSE 1 END;
  v_have int;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN RETURN false; END IF;
  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria', 'beneficiamento') THEN RETURN false; END IF;

  -- Admin da própria empresa: acesso total a todos os setores.
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin' AND ur.company_id = v_company
  ) THEN RETURN true; END IF;

  -- Modo legado: sem nenhuma concessão na empresa, ninguém é bloqueado.
  IF NOT EXISTS (SELECT 1 FROM public.user_sector_access usa WHERE usa.company_id = v_company) THEN
    RETURN true;
  END IF;

  SELECT CASE usa.access_level WHEN 'viewer' THEN 1 WHEN 'operator' THEN 2 WHEN 'manager' THEN 3 ELSE 0 END
    INTO v_have
  FROM public.user_sector_access usa
  WHERE usa.company_id = v_company AND usa.user_id = auth.uid() AND usa.sector = p_sector;

  RETURN COALESCE(v_have, 0) >= v_rank;
END;
$$;
REVOKE ALL ON FUNCTION public.sector_access_allowed(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sector_access_allowed(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_sector_access(p_sector text, p_min_level text DEFAULT 'viewer')
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501';
  END IF;
  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria', 'beneficiamento') THEN
    RAISE EXCEPTION 'Setor inválido: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF NOT public.sector_access_allowed(p_sector, p_min_level) THEN
    RAISE EXCEPTION 'Sem permissão no setor % (requer %)', p_sector, p_min_level USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_sector_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_sector_access(text, text) TO authenticated, service_role;

-- set_user_sector_access valida a lista de setores: recria com beneficiamento.
-- set_user_sector_access valida a lista de setores: mesmo corpo de
-- 20261019210000, apenas com 'beneficiamento' na lista.
CREATE OR REPLACE FUNCTION public.set_user_sector_access(p_user_id uuid, p_sector text, p_level text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_target_company uuid;
BEGIN
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin' AND ur.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Apenas administradores da empresa concedem acesso a setores' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;
  IF v_target_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Usuário não pertence à sua empresa' USING ERRCODE = '42501';
  END IF;

  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria', 'beneficiamento') THEN
    RAISE EXCEPTION 'Setor inválido: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF p_level IS NOT NULL AND p_level NOT IN ('viewer', 'operator', 'manager') THEN
    RAISE EXCEPTION 'Nível inválido: %', p_level USING ERRCODE = '22023';
  END IF;

  IF p_level IS NULL THEN
    DELETE FROM public.user_sector_access
    WHERE company_id = v_company AND user_id = p_user_id AND sector = p_sector;
    RETURN jsonb_build_object('user_id', p_user_id, 'sector', p_sector, 'access_level', NULL, 'revoked', true);
  END IF;

  INSERT INTO public.user_sector_access (company_id, user_id, sector, access_level, granted_by)
  VALUES (v_company, p_user_id, p_sector, p_level, auth.uid())
  ON CONFLICT (company_id, user_id, sector)
  DO UPDATE SET access_level = EXCLUDED.access_level, granted_by = EXCLUDED.granted_by, updated_at = now();

  RETURN jsonb_build_object('user_id', p_user_id, 'sector', p_sector, 'access_level', p_level, 'revoked', false);
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_sector_access(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_sector_access(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Perfil: beneficiamento na implementação do upsert (wrapper intacto)
-- (corpo = 20261023200000 + ramo do beneficiamento)
-- ---------------------------------------------------------------------------
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
  ELSIF p_sector = 'tinturaria' THEN
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

-- ---------------------------------------------------------------------------
-- Eventos: beneficiamento na implementação (wrapper intacto)
-- (corpo = 20261019190000 + vocabulário/taxonomia do beneficiamento)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sector_event_impl(
  p_production_order_id uuid,
  p_sector text,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_downtime_minutes numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_deviation_category text DEFAULT NULL,
  p_cause_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_event_id uuid;
  v_allowed text[];
  v_categories text[];
BEGIN
  v_allowed := CASE p_sector
    WHEN 'fiacao' THEN ARRAY['setup','start','pause','resume','stop','doffing','fiber_break','quality_hold','quality_release','inspection','note']
    WHEN 'malharia' THEN ARRAY['setup','start','pause','resume','stop','yarn_break','roll_change','quality_hold','quality_release','inspection','note']
    WHEN 'tinturaria' THEN ARRAY['setup','start','pause','resume','stop','bath_start','wash','unload','color_hold','color_release','re_dye','quality_hold','quality_release','inspection','note']
    WHEN 'beneficiamento' THEN ARRAY['setup','start','pause','resume','stop','rama_start','width_check','shrinkage_check','roll_change','quality_hold','quality_release','inspection','note']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Setor sem eventos próprios nesta função: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Tipo de evento inválido para o setor %: %', p_sector, COALESCE(p_event_type, '(nulo)') USING ERRCODE = '22023';
  END IF;
  v_categories := CASE p_sector
    WHEN 'tinturaria' THEN ARRAY['cor','substrato','maquina','receita','produto_quimico','utilidade','tempo','qualidade','manutencao','laboratorio','planejamento']
    WHEN 'beneficiamento' THEN ARRAY['largura','gramatura','encolhimento','aparencia','maquina','qualidade','material','programacao']
    ELSE ARRAY['material','maquina','qualidade','mao_de_obra','metodo','energia_utilidades','programacao']
  END;
  IF p_deviation_category IS NOT NULL AND NOT (p_deviation_category = ANY (v_categories)) THEN
    RAISE EXCEPTION 'Categoria de desvio inválida para o setor %: %', p_sector, p_deviation_category USING ERRCODE = '22023';
  END IF;
  IF p_cause_status IS NOT NULL AND p_cause_status NOT IN ('confirmada', 'em_investigacao') THEN
    RAISE EXCEPTION 'Situação da causa inválida: %', p_cause_status USING ERRCODE = '22023';
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

  INSERT INTO public.sector_production_events (
    company_id, branch_id, production_order_id, production_order_step_id,
    machine_id, resource_id, sector, event_type, quantity, downtime_minutes,
    reason, operator_name, deviation_category, cause_status, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, p_production_order_step_id,
    p_machine_id, p_resource_id, p_sector, p_event_type, p_quantity, p_downtime_minutes,
    NULLIF(btrim(p_reason), ''), NULLIF(btrim(p_operator_name), ''),
    p_deviation_category, p_cause_status, auth.uid()
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('event_id', v_event_id, 'production_order_id', v_order.id, 'sector', p_sector, 'event_type', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_sector_event_impl(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sector_event_impl(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) TO service_role;
