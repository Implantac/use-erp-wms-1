-- ============================================================================
-- Receita de tingimento versionada (T85/P1, do manual PCP têxtil §8.4)
--
-- Mesmo padrão da receita de engomagem: a empresa cadastra suas receitas de
-- tingimento com versões (rascunho -> aprovada -> substituída), corantes e
-- auxiliares identificados e parâmetros apenas quando informados. A OP de
-- tinturaria referencia a versão aprovada e copia banho, temperatura, tempo
-- e pH dela. Nenhuma dosagem é presumida nem autorizada pelo sistema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.textile_dye_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipe_code text NOT NULL,
  name text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textile_dye_recipes_code_check CHECK (length(btrim(recipe_code)) BETWEEN 1 AND 80),
  CONSTRAINT textile_dye_recipes_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT textile_dye_recipes_version_check CHECK (version > 0),
  CONSTRAINT textile_dye_recipes_status_check
    CHECK (status IN ('draft', 'approved', 'superseded', 'inactive')),
  CONSTRAINT textile_dye_recipes_ingredients_check CHECK (jsonb_typeof(ingredients) = 'array'),
  CONSTRAINT textile_dye_recipes_parameters_check CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT textile_dye_recipes_company_code_version_unique UNIQUE (company_id, recipe_code, version)
);

CREATE INDEX IF NOT EXISTS idx_textile_dye_recipes_approved
  ON public.textile_dye_recipes (company_id, recipe_code, status, version DESC);

ALTER TABLE public.textile_dye_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS textile_dye_recipes_select ON public.textile_dye_recipes;
CREATE POLICY textile_dye_recipes_select ON public.textile_dye_recipes
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.textile_dye_recipes FROM PUBLIC, anon;
GRANT SELECT ON public.textile_dye_recipes TO authenticated;
GRANT ALL ON public.textile_dye_recipes TO service_role;

CREATE OR REPLACE FUNCTION public.create_dye_recipe_draft(
  p_recipe_code text,
  p_name text,
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
  v_recipe public.textile_dye_recipes%ROWTYPE;
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
    RAISE EXCEPTION 'Código e nome da receita de tingimento são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Corantes/auxiliares da receita devem ser uma lista' USING ERRCODE = '22023';
  END IF;
  IF p_parameters IS NULL OR jsonb_typeof(p_parameters) <> 'object' THEN
    RAISE EXCEPTION 'Parâmetros da receita devem ser um objeto' USING ERRCODE = '22023';
  END IF;
  FOR v_ingredient IN SELECT value FROM jsonb_array_elements(p_ingredients)
  LOOP
    IF NULLIF(btrim(COALESCE(v_ingredient ->> 'name', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Todo corante/auxiliar da receita precisa de nome' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(v_ingredient ->> 'quantity', '') IS NOT NULL
       AND (v_ingredient ->> 'quantity')::numeric < 0 THEN
      RAISE EXCEPTION 'Quantidade de corante/auxiliar não pode ser negativa' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NULLIF(p_parameters ->> 'ph_target', '') IS NOT NULL
     AND ((p_parameters ->> 'ph_target')::numeric < 0
          OR (p_parameters ->> 'ph_target')::numeric > 14) THEN
    RAISE EXCEPTION 'pH alvo da receita deve ficar entre 0 e 14' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':dye-recipe:' || v_code, 0));
  SELECT COALESCE(max(version), 0) + 1 INTO v_version
    FROM public.textile_dye_recipes
   WHERE company_id = v_company_id AND recipe_code = v_code;

  INSERT INTO public.textile_dye_recipes (
    company_id, recipe_code, name, version, status, ingredients, parameters, notes, created_by
  ) VALUES (
    v_company_id, v_code, v_name, v_version, 'draft',
    p_ingredients, p_parameters, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user_id
  ) RETURNING * INTO v_recipe;
  RETURN to_jsonb(v_recipe);
END;
$$;

REVOKE ALL ON FUNCTION public.create_dye_recipe_draft(text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dye_recipe_draft(text, text, jsonb, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_dye_recipe_version(p_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_recipe public.textile_dye_recipes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_recipe
    FROM public.textile_dye_recipes
   WHERE id = p_recipe_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receita de tingimento não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_recipe.status = 'approved' THEN
    RETURN to_jsonb(v_recipe);
  END IF;
  IF v_recipe.status <> 'draft' THEN
    RAISE EXCEPTION 'Somente uma versão em rascunho pode ser aprovada' USING ERRCODE = '55000';
  END IF;

  UPDATE public.textile_dye_recipes
     SET status = 'superseded', updated_at = now()
   WHERE company_id = v_company_id AND recipe_code = v_recipe.recipe_code AND status = 'approved';
  UPDATE public.textile_dye_recipes
     SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now()
   WHERE id = v_recipe.id
   RETURNING * INTO v_recipe;
  RETURN to_jsonb(v_recipe);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_dye_recipe_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_dye_recipe_version(uuid) TO authenticated, service_role;

ALTER TABLE public.dyeing_order_profiles
  ADD COLUMN IF NOT EXISTS dye_recipe_version_id uuid
    REFERENCES public.textile_dye_recipes(id);

-- Liga (ou desliga) a versão aprovada da receita no perfil da OP, copiando
-- os parâmetros dela. Receita em rascunho nunca entra na OP.
CREATE OR REPLACE FUNCTION public.set_dyeing_recipe_version(
  p_production_order_id uuid,
  p_recipe_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_profile public.dyeing_order_profiles%ROWTYPE;
  v_recipe public.textile_dye_recipes%ROWTYPE;
BEGIN
  PERFORM public.assert_sector_access('tinturaria', 'manager');

  IF p_recipe_id IS NULL THEN
    UPDATE public.dyeing_order_profiles
       SET dye_recipe_version_id = NULL, updated_at = now()
     WHERE production_order_id = v_order.id
     RETURNING * INTO v_profile;
  ELSE
    SELECT * INTO v_recipe
      FROM public.textile_dye_recipes
     WHERE id = p_recipe_id AND company_id = v_order.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receita de tingimento não pertence à empresa' USING ERRCODE = '42501';
    END IF;
    IF v_recipe.status <> 'approved' THEN
      RAISE EXCEPTION 'A OP só pode usar uma versão aprovada da receita de tingimento'
        USING ERRCODE = '55000';
    END IF;
    UPDATE public.dyeing_order_profiles
       SET dye_recipe_version_id = v_recipe.id,
           dye_recipe_code = v_recipe.recipe_code || ' v' || v_recipe.version::text,
           bath_ratio = NULLIF(v_recipe.parameters ->> 'bath_ratio', '')::numeric,
           dyeing_temperature_c = NULLIF(v_recipe.parameters ->> 'dyeing_temperature_c', '')::numeric,
           dyeing_time_min = NULLIF(v_recipe.parameters ->> 'dyeing_time_min', '')::numeric,
           ph_target = NULLIF(v_recipe.parameters ->> 'ph_target', '')::numeric,
           updated_at = now()
     WHERE production_order_id = v_order.id
     RETURNING * INTO v_profile;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salve o perfil de tinturaria antes de vincular a receita'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN to_jsonb(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.set_dyeing_recipe_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_dyeing_recipe_version(uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.textile_dye_recipes IS
  'Receitas de tingimento da empresa, versionadas (rascunho/aprovada/substituída); dosagens nunca presumidas.';
COMMENT ON COLUMN public.dyeing_order_profiles.dye_recipe_version_id IS
  'Versão aprovada da receita de tingimento usada nesta OP, quando informada.';
