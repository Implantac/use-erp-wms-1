-- ============================================================================
-- Receita de engomagem versionada (T82/P1)
--
-- A OP de tecelagem guardava apenas um código/texto livre de receita. Agora a
-- empresa cadastra suas receitas de engomagem com versões: rascunho nasce com
-- a próxima versão do código, aprovação substitui a versão aprovada anterior
-- e a OP referencia a versão aprovada — o perfil copia os parâmetros da
-- receita. Nenhum ingrediente, dosagem ou parâmetro é presumido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.textile_sizing_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipe_code text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  size_product_id uuid REFERENCES public.products(id),
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textile_sizing_recipes_code_check CHECK (length(btrim(recipe_code)) BETWEEN 1 AND 80),
  CONSTRAINT textile_sizing_recipes_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT textile_sizing_recipes_version_check CHECK (version > 0),
  CONSTRAINT textile_sizing_recipes_status_check
    CHECK (status IN ('draft', 'approved', 'superseded', 'inactive')),
  CONSTRAINT textile_sizing_recipes_ingredients_check CHECK (jsonb_typeof(ingredients) = 'array'),
  CONSTRAINT textile_sizing_recipes_parameters_check CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT textile_sizing_recipes_company_code_version_unique UNIQUE (company_id, recipe_code, version)
);

CREATE INDEX IF NOT EXISTS idx_textile_sizing_recipes_approved
  ON public.textile_sizing_recipes (company_id, recipe_code, status, version DESC);

ALTER TABLE public.textile_sizing_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS textile_sizing_recipes_select ON public.textile_sizing_recipes;
CREATE POLICY textile_sizing_recipes_select ON public.textile_sizing_recipes
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.textile_sizing_recipes FROM PUBLIC, anon;
GRANT SELECT ON public.textile_sizing_recipes TO authenticated;
GRANT ALL ON public.textile_sizing_recipes TO service_role;

CREATE OR REPLACE FUNCTION public.create_sizing_recipe_draft(
  p_recipe_code text,
  p_name text,
  p_size_product_id uuid DEFAULT NULL,
  p_ingredients jsonb DEFAULT '[]'::jsonb,
  p_parameters jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_code text := NULLIF(btrim(COALESCE(p_recipe_code, '')), '');
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_version integer;
  v_recipe public.textile_sizing_recipes%ROWTYPE;
  v_ingredient jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF v_code IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'Código e nome da receita de engomagem são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Ingredientes da receita devem ser uma lista' USING ERRCODE = '22023';
  END IF;
  IF p_parameters IS NULL OR jsonb_typeof(p_parameters) <> 'object' THEN
    RAISE EXCEPTION 'Parâmetros da receita devem ser um objeto' USING ERRCODE = '22023';
  END IF;
  FOR v_ingredient IN SELECT value FROM jsonb_array_elements(p_ingredients)
  LOOP
    IF NULLIF(btrim(COALESCE(v_ingredient ->> 'name', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Todo ingrediente da receita precisa de nome' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(v_ingredient ->> 'quantity', '') IS NOT NULL
       AND (v_ingredient ->> 'quantity')::numeric < 0 THEN
      RAISE EXCEPTION 'Quantidade de ingrediente não pode ser negativa' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NULLIF(p_parameters ->> 'concentration_pct', '') IS NOT NULL
     AND ((p_parameters ->> 'concentration_pct')::numeric < 0
          OR (p_parameters ->> 'concentration_pct')::numeric > 100) THEN
    RAISE EXCEPTION 'Concentração da receita deve ficar entre 0 e 100%%' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_parameters ->> 'warp_moisture_pct', '') IS NOT NULL
     AND ((p_parameters ->> 'warp_moisture_pct')::numeric < 0
          OR (p_parameters ->> 'warp_moisture_pct')::numeric > 100) THEN
    RAISE EXCEPTION 'Umidade do urdume da receita deve ficar entre 0 e 100%%' USING ERRCODE = '22023';
  END IF;
  IF p_size_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_size_product_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Produto de goma não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':sizing-recipe:' || v_code, 0));
  SELECT COALESCE(max(version), 0) + 1 INTO v_version
    FROM public.textile_sizing_recipes
   WHERE company_id = v_company_id AND recipe_code = v_code;

  INSERT INTO public.textile_sizing_recipes (
    company_id, recipe_code, name, version, status, size_product_id,
    ingredients, parameters, notes, created_by
  ) VALUES (
    v_company_id, v_code, v_name, v_version, 'draft', p_size_product_id,
    p_ingredients, p_parameters, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user_id
  ) RETURNING * INTO v_recipe;
  RETURN to_jsonb(v_recipe);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sizing_recipe_draft(text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sizing_recipe_draft(text, text, uuid, jsonb, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_sizing_recipe_version(p_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_recipe public.textile_sizing_recipes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_recipe
    FROM public.textile_sizing_recipes
   WHERE id = p_recipe_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receita de engomagem não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_recipe.status = 'approved' THEN
    RETURN to_jsonb(v_recipe);
  END IF;
  IF v_recipe.status <> 'draft' THEN
    RAISE EXCEPTION 'Somente uma versão em rascunho pode ser aprovada' USING ERRCODE = '55000';
  END IF;

  UPDATE public.textile_sizing_recipes
     SET status = 'superseded', updated_at = now()
   WHERE company_id = v_company_id AND recipe_code = v_recipe.recipe_code AND status = 'approved';
  UPDATE public.textile_sizing_recipes
     SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now()
   WHERE id = v_recipe.id
   RETURNING * INTO v_recipe;
  RETURN to_jsonb(v_recipe);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_sizing_recipe_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_sizing_recipe_version(uuid) TO authenticated, service_role;

ALTER TABLE public.weaving_order_profiles
  ADD COLUMN IF NOT EXISTS sizing_recipe_version_id uuid
    REFERENCES public.textile_sizing_recipes(id);

-- Recria a função interna do perfil (base: 20261028130000) ligando a OP à
-- versão aprovada da receita; os parâmetros efetivos são copiados da receita.
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
  v_recipe_id uuid := NULLIF(p_profile ->> 'sizing_recipe_version_id', '')::uuid;
  v_recipe public.textile_sizing_recipes%ROWTYPE;
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

  IF v_recipe_id IS NOT NULL THEN
    SELECT * INTO v_recipe
      FROM public.textile_sizing_recipes
     WHERE id = v_recipe_id AND company_id = p_order.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receita de engomagem não pertence à empresa' USING ERRCODE = '42501';
    END IF;
    IF v_recipe.status <> 'approved' THEN
      RAISE EXCEPTION 'A OP só pode usar uma versão aprovada da receita de engomagem' USING ERRCODE = '55000';
    END IF;
    IF v_sizing_applicable IS FALSE THEN
      RAISE EXCEPTION 'Receita de engomagem escolhida exige engomagem aplicável' USING ERRCODE = '22023';
    END IF;
    v_sizing_applicable := TRUE;
    v_size_product_id := COALESCE(v_recipe.size_product_id, v_size_product_id);
  END IF;

  IF v_sizing_applicable IS TRUE THEN
    IF v_recipe_id IS NULL AND v_size_product_id IS NULL
       AND NULLIF(btrim(COALESCE(p_profile ->> 'size_recipe_code', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Engomagem aplicável exige o produto de goma ou o código/receita aprovada pela empresa'
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_sizing_applicable IS FALSE THEN
    -- Sem engomagem, os campos de goma não fazem sentido nesta OP.
    v_size_product_id := NULL;
    v_size_lot_id := NULL;
    v_recipe_id := NULL;
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
    warp_preparation_notes, sizing_recipe_version_id
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
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL
         WHEN v_recipe_id IS NOT NULL THEN v_recipe.recipe_code || ' v' || v_recipe.version::text
         ELSE NULLIF(btrim(p_profile ->> 'size_recipe_code'), '') END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL
         WHEN v_recipe_id IS NOT NULL THEN NULLIF(v_recipe.parameters ->> 'concentration_pct', '')::numeric
         ELSE NULLIF(p_profile ->> 'size_concentration_pct', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL
         WHEN v_recipe_id IS NOT NULL THEN NULLIF(v_recipe.parameters ->> 'bath_temperature_c', '')::numeric
         ELSE NULLIF(p_profile ->> 'sizing_temperature_c', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL
         WHEN v_recipe_id IS NOT NULL THEN NULLIF(v_recipe.parameters ->> 'speed_m_min', '')::numeric
         ELSE NULLIF(p_profile ->> 'sizing_speed_m_min', '')::numeric END,
    CASE WHEN v_sizing_applicable IS FALSE THEN NULL
         WHEN v_recipe_id IS NOT NULL THEN NULLIF(v_recipe.parameters ->> 'drying_temperature_c', '')::numeric
         ELSE NULLIF(p_profile ->> 'drying_temperature_c', '')::numeric END,
    COALESCE(NULLIF(p_profile ->> 'warp_moisture_pct', '')::numeric,
             CASE WHEN v_recipe_id IS NOT NULL THEN NULLIF(v_recipe.parameters ->> 'warp_moisture_pct', '')::numeric END),
    CASE WHEN v_warp_status IN ('warped', 'sized', 'ready') THEN now() ELSE NULL END,
    CASE WHEN v_warp_status IN ('warped', 'sized', 'ready') THEN auth.uid() ELSE NULL END,
    NULLIF(btrim(p_profile ->> 'warp_preparation_notes'), ''),
    v_recipe_id
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
    sizing_recipe_version_id = EXCLUDED.sizing_recipe_version_id,
    updated_at = now()
  RETURNING id INTO v_profile_id;
  RETURN v_profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pcp_apply_weaving_profile(public.production_orders, jsonb) TO service_role;

COMMENT ON TABLE public.textile_sizing_recipes IS
  'Receitas de engomagem da empresa, versionadas (rascunho/aprovada/substituída); parâmetros nunca presumidos.';
COMMENT ON COLUMN public.weaving_order_profiles.sizing_recipe_version_id IS
  'Versão aprovada da receita de engomagem usada nesta OP, quando informada.';
