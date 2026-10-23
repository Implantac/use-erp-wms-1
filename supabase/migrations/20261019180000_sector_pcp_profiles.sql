-- ============================================================================
-- PCP por setor têxtil — perfis técnicos e eventos de fiação, malharia e
-- tinturaria (a tecelagem já tem weaving_order_profiles/weaving_production_events).
--
-- Cada tipo de produção tem recurso, unidade, perfil e eventos próprios,
-- sobre o mesmo motor de execução (snapshot, reserva por lote, capacidade
-- finita, apontamento sequencial, qualidade e genealogia). Nenhum parâmetro
-- de processo é presumido: título, torção, galga, relação de banho e metas
-- de cor são sempre configurados pela empresa na OP.
--
-- Escrita apenas via RPC (SECURITY DEFINER com as guardas de empresa das
-- demais funções pcp_*); leitura pela RLS da própria empresa.
--
-- Rollback manual (se necessário):
--   DROP FUNCTION IF EXISTS public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text);
--   DROP FUNCTION IF EXISTS public.upsert_sector_order_profile(uuid, text, jsonb);
--   DROP TABLE IF EXISTS public.sector_production_events;
--   DROP TABLE IF EXISTS public.dyeing_order_profiles;
--   DROP TABLE IF EXISTS public.knitting_order_profiles;
--   DROP TABLE IF EXISTS public.spinning_order_profiles;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perfis técnicos por setor
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spinning_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES public.production_machines(id),
  work_center text,
  target_title text,
  twist_per_m numeric,
  planned_output_kg numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spinning_order_profiles_nonnegative CHECK (
    (twist_per_m IS NULL OR twist_per_m >= 0)
    AND (planned_output_kg IS NULL OR planned_output_kg >= 0)
  )
);

CREATE TABLE IF NOT EXISTS public.knitting_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES public.production_machines(id),
  work_center text,
  gauge text,
  diameter_cm numeric,
  planned_output_kg numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knitting_order_profiles_nonnegative CHECK (
    (diameter_cm IS NULL OR diameter_cm >= 0)
    AND (planned_output_kg IS NULL OR planned_output_kg >= 0)
  )
);

CREATE TABLE IF NOT EXISTS public.dyeing_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL UNIQUE REFERENCES public.production_orders(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES public.production_machines(id),
  work_center text,
  color_name text,
  color_code text,
  bath_ratio numeric,
  batch_code text,
  lab_l numeric,
  lab_a numeric,
  lab_b numeric,
  planned_output_kg numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dyeing_order_profiles_nonnegative CHECK (
    (bath_ratio IS NULL OR bath_ratio >= 0)
    AND (planned_output_kg IS NULL OR planned_output_kg >= 0)
  ),
  CONSTRAINT dyeing_order_profiles_lab_range CHECK (
    (lab_l IS NULL OR (lab_l >= 0 AND lab_l <= 100))
    AND (lab_a IS NULL OR (lab_a >= -128 AND lab_a <= 127))
    AND (lab_b IS NULL OR (lab_b >= -128 AND lab_b <= 127))
  )
);

CREATE TABLE IF NOT EXISTS public.sector_production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  branch_id uuid REFERENCES public.branches(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  production_order_step_id uuid REFERENCES public.production_order_steps(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.production_machines(id),
  resource_id uuid REFERENCES public.production_resources(id),
  sector text NOT NULL,
  event_type text NOT NULL,
  quantity numeric,
  downtime_minutes numeric,
  reason text,
  operator_name text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sector_production_events_sector_check CHECK (sector IN ('fiacao', 'malharia', 'tinturaria')),
  CONSTRAINT sector_production_events_type_check CHECK (event_type IN (
    'setup', 'start', 'pause', 'resume', 'stop',
    'doffing', 'fiber_break',
    'yarn_break', 'roll_change',
    'bath_start', 'wash', 'unload', 'color_hold', 'color_release', 're_dye',
    'quality_hold', 'quality_release', 'inspection', 'note'
  )),
  CONSTRAINT sector_production_events_values_check CHECK (
    (quantity IS NULL OR quantity >= 0)
    AND (downtime_minutes IS NULL OR downtime_minutes >= 0)
  )
);

CREATE INDEX IF NOT EXISTS spinning_order_profiles_company_idx
  ON public.spinning_order_profiles (company_id, production_order_id);
CREATE INDEX IF NOT EXISTS knitting_order_profiles_company_idx
  ON public.knitting_order_profiles (company_id, production_order_id);
CREATE INDEX IF NOT EXISTS dyeing_order_profiles_company_idx
  ON public.dyeing_order_profiles (company_id, production_order_id);
CREATE INDEX IF NOT EXISTS sector_production_events_order_idx
  ON public.sector_production_events (company_id, production_order_id, occurred_at DESC);

-- RLS: leitura apenas da própria empresa (mesmo padrão dos perfis de tecelagem)
ALTER TABLE public.spinning_order_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spinning_order_profiles_select ON public.spinning_order_profiles;
CREATE POLICY spinning_order_profiles_select ON public.spinning_order_profiles
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.spinning_order_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.spinning_order_profiles TO authenticated;
GRANT ALL ON public.spinning_order_profiles TO service_role;

ALTER TABLE public.knitting_order_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knitting_order_profiles_select ON public.knitting_order_profiles;
CREATE POLICY knitting_order_profiles_select ON public.knitting_order_profiles
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.knitting_order_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.knitting_order_profiles TO authenticated;
GRANT ALL ON public.knitting_order_profiles TO service_role;

ALTER TABLE public.dyeing_order_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dyeing_order_profiles_select ON public.dyeing_order_profiles;
CREATE POLICY dyeing_order_profiles_select ON public.dyeing_order_profiles
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.dyeing_order_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.dyeing_order_profiles TO authenticated;
GRANT ALL ON public.dyeing_order_profiles TO service_role;

ALTER TABLE public.sector_production_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sector_production_events_select ON public.sector_production_events;
CREATE POLICY sector_production_events_select ON public.sector_production_events
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.sector_production_events FROM PUBLIC, anon;
GRANT SELECT ON public.sector_production_events TO authenticated;
GRANT ALL ON public.sector_production_events TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: salvar o perfil técnico do setor da OP
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_sector_order_profile(
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
      gauge, diameter_cm, planned_output_kg, notes, created_by
    ) VALUES (
      v_order.company_id, v_order.branch_id, v_order.id, v_machine_id,
      NULLIF(btrim(p_profile ->> 'work_center'), ''),
      NULLIF(btrim(p_profile ->> 'gauge'), ''),
      NULLIF(p_profile ->> 'diameter_cm', '')::numeric,
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, gauge = EXCLUDED.gauge,
      diameter_cm = EXCLUDED.diameter_cm, planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_profile_id;
  ELSE
    INSERT INTO public.dyeing_order_profiles (
      company_id, branch_id, production_order_id, machine_id, work_center,
      color_name, color_code, bath_ratio, batch_code, lab_l, lab_a, lab_b,
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
      NULLIF(p_profile ->> 'planned_output_kg', '')::numeric,
      NULLIF(btrim(p_profile ->> 'notes'), ''), auth.uid()
    )
    ON CONFLICT (production_order_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id, machine_id = EXCLUDED.machine_id,
      work_center = EXCLUDED.work_center, color_name = EXCLUDED.color_name,
      color_code = EXCLUDED.color_code, bath_ratio = EXCLUDED.bath_ratio,
      batch_code = EXCLUDED.batch_code, lab_l = EXCLUDED.lab_l,
      lab_a = EXCLUDED.lab_a, lab_b = EXCLUDED.lab_b,
      planned_output_kg = EXCLUDED.planned_output_kg,
      notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_profile_id;
  END IF;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'production_order_id', v_order.id, 'sector', p_sector, 'status', 'saved');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_sector_order_profile(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_sector_order_profile(uuid, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: registrar evento operacional do setor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sector_event(
  p_production_order_id uuid,
  p_sector text,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
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
  v_allowed text[];
BEGIN
  v_allowed := CASE p_sector
    WHEN 'fiacao' THEN ARRAY['setup','start','pause','resume','stop','doffing','fiber_break','quality_hold','quality_release','inspection','note']
    WHEN 'malharia' THEN ARRAY['setup','start','pause','resume','stop','yarn_break','roll_change','quality_hold','quality_release','inspection','note']
    WHEN 'tinturaria' THEN ARRAY['setup','start','pause','resume','stop','bath_start','wash','unload','color_hold','color_release','re_dye','quality_hold','quality_release','inspection','note']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Setor sem eventos próprios nesta função: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Tipo de evento inválido para o setor %: %', p_sector, COALESCE(p_event_type, '(nulo)') USING ERRCODE = '22023';
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
    reason, operator_name, created_by
  ) VALUES (
    v_order.company_id, v_order.branch_id, v_order.id, p_production_order_step_id,
    p_machine_id, p_resource_id, p_sector, p_event_type, p_quantity, p_downtime_minutes,
    NULLIF(btrim(p_reason), ''), NULLIF(btrim(p_operator_name), ''), auth.uid()
  ) RETURNING id INTO v_event_id;
  RETURN jsonb_build_object('event_id', v_event_id, 'production_order_id', v_order.id, 'sector', p_sector, 'event_type', p_event_type);
END;
$$;
REVOKE ALL ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text) TO authenticated, service_role;
