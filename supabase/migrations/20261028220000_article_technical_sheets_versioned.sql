-- ============================================================================
-- Ficha técnica do artigo versionada (T88/P1, do manual PCP têxtil §5)
--
-- A construção do artigo (composição, ligamento, gramatura, largura,
-- densidades e tolerâncias) ganha cadastro próprio e versionado por produto:
-- rascunho -> aprovada -> substituída, no mesmo padrão das receitas. A OP
-- referencia a versão aprovada da ficha do seu artigo e guarda um snapshot
-- dela; aprovar uma versão nova nunca reescreve o que uma OP antiga usou.
-- Campo não informado fica nulo: nada é presumido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.textile_article_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  composition text,
  construction text,
  target_gsm numeric,
  gsm_tolerance_pct numeric,
  target_width_cm numeric,
  width_tolerance_cm numeric,
  warp_density_per_cm numeric,
  weft_density_per_cm numeric,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textile_article_sheets_version_check CHECK (version > 0),
  CONSTRAINT textile_article_sheets_status_check
    CHECK (status IN ('draft', 'approved', 'superseded', 'inactive')),
  CONSTRAINT textile_article_sheets_values_check CHECK (
    (target_gsm IS NULL OR target_gsm > 0)
    AND (gsm_tolerance_pct IS NULL OR gsm_tolerance_pct BETWEEN 0 AND 100)
    AND (target_width_cm IS NULL OR target_width_cm > 0)
    AND (width_tolerance_cm IS NULL OR width_tolerance_cm >= 0)
    AND (warp_density_per_cm IS NULL OR warp_density_per_cm > 0)
    AND (weft_density_per_cm IS NULL OR weft_density_per_cm > 0)
  ),
  CONSTRAINT textile_article_sheets_company_product_version_unique
    UNIQUE (company_id, product_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_textile_article_sheets_one_approved
  ON public.textile_article_sheets (company_id, product_id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_textile_article_sheets_product
  ON public.textile_article_sheets (company_id, product_id, version DESC);

ALTER TABLE public.textile_article_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS textile_article_sheets_select ON public.textile_article_sheets;
CREATE POLICY textile_article_sheets_select ON public.textile_article_sheets
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
REVOKE ALL ON public.textile_article_sheets FROM PUBLIC, anon;
GRANT SELECT ON public.textile_article_sheets TO authenticated;
GRANT ALL ON public.textile_article_sheets TO service_role;

CREATE OR REPLACE FUNCTION public.create_article_sheet_draft(
  p_product_id uuid,
  p_fields jsonb DEFAULT '{}'::jsonb,
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
  v_version integer;
  v_sheet public.textile_article_sheets%ROWTYPE;
  v_composition text := NULLIF(btrim(COALESCE(p_fields ->> 'composition', '')), '');
  v_construction text := NULLIF(btrim(COALESCE(p_fields ->> 'construction', '')), '');
  v_target_gsm numeric := NULLIF(p_fields ->> 'target_gsm', '')::numeric;
  v_gsm_tolerance numeric := NULLIF(p_fields ->> 'gsm_tolerance_pct', '')::numeric;
  v_target_width numeric := NULLIF(p_fields ->> 'target_width_cm', '')::numeric;
  v_width_tolerance numeric := NULLIF(p_fields ->> 'width_tolerance_cm', '')::numeric;
  v_warp_density numeric := NULLIF(p_fields ->> 'warp_density_per_cm', '')::numeric;
  v_weft_density numeric := NULLIF(p_fields ->> 'weft_density_per_cm', '')::numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;
  IF p_fields IS NULL OR jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'Campos da ficha do artigo devem ser um objeto' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Artigo não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_gsm_tolerance IS NOT NULL AND v_target_gsm IS NULL THEN
    RAISE EXCEPTION 'Tolerância de gramatura exige a gramatura alvo' USING ERRCODE = '22023';
  END IF;
  IF v_width_tolerance IS NOT NULL AND v_target_width IS NULL THEN
    RAISE EXCEPTION 'Tolerância de largura exige a largura alvo' USING ERRCODE = '22023';
  END IF;
  IF v_composition IS NULL AND v_construction IS NULL AND v_target_gsm IS NULL
     AND v_target_width IS NULL AND v_warp_density IS NULL AND v_weft_density IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um dado de construção da ficha (composição, construção, gramatura, largura ou densidades)'
      USING ERRCODE = '22023';
  END IF;
  IF (v_target_gsm IS NOT NULL AND v_target_gsm <= 0)
     OR (v_target_width IS NOT NULL AND v_target_width <= 0)
     OR (v_warp_density IS NOT NULL AND v_warp_density <= 0)
     OR (v_weft_density IS NOT NULL AND v_weft_density <= 0)
     OR (v_gsm_tolerance IS NOT NULL AND (v_gsm_tolerance < 0 OR v_gsm_tolerance > 100))
     OR (v_width_tolerance IS NOT NULL AND v_width_tolerance < 0) THEN
    RAISE EXCEPTION 'Valores da ficha do artigo devem ser positivos (tolerância de gramatura entre 0 e 100)'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':article-sheet:' || p_product_id::text, 0));
  SELECT COALESCE(max(version), 0) + 1 INTO v_version
    FROM public.textile_article_sheets
   WHERE company_id = v_company_id AND product_id = p_product_id;

  INSERT INTO public.textile_article_sheets (
    company_id, product_id, version, status, composition, construction,
    target_gsm, gsm_tolerance_pct, target_width_cm, width_tolerance_cm,
    warp_density_per_cm, weft_density_per_cm, notes, created_by
  ) VALUES (
    v_company_id, p_product_id, v_version, 'draft', v_composition, v_construction,
    v_target_gsm, v_gsm_tolerance, v_target_width, v_width_tolerance,
    v_warp_density, v_weft_density, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user_id
  ) RETURNING * INTO v_sheet;
  RETURN to_jsonb(v_sheet);
END;
$$;

REVOKE ALL ON FUNCTION public.create_article_sheet_draft(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_article_sheet_draft(uuid, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_article_sheet_version(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_sheet public.textile_article_sheets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa vinculada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sheet
    FROM public.textile_article_sheets
   WHERE id = p_sheet_id AND company_id = v_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha do artigo não pertence à empresa do usuário' USING ERRCODE = '42501';
  END IF;
  IF v_sheet.status = 'approved' THEN
    RETURN to_jsonb(v_sheet);
  END IF;
  IF v_sheet.status <> 'draft' THEN
    RAISE EXCEPTION 'Somente uma versão em rascunho pode ser aprovada' USING ERRCODE = '55000';
  END IF;

  UPDATE public.textile_article_sheets
     SET status = 'superseded', updated_at = now()
   WHERE company_id = v_company_id AND product_id = v_sheet.product_id AND status = 'approved';
  UPDATE public.textile_article_sheets
     SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now()
   WHERE id = v_sheet.id
   RETURNING * INTO v_sheet;
  RETURN to_jsonb(v_sheet);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_article_sheet_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_article_sheet_version(uuid) TO authenticated, service_role;

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS article_sheet_version_id uuid
    REFERENCES public.textile_article_sheets(id);
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS article_sheet_snapshot jsonb;

-- Vincula (ou desvincula) a versão aprovada da ficha do artigo da OP,
-- gravando um snapshot da construção/tolerâncias daquela versão.
CREATE OR REPLACE FUNCTION public.set_order_article_sheet(
  p_production_order_id uuid,
  p_sheet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.production_orders%ROWTYPE := public.pcp_authorized_order(p_production_order_id);
  v_sheet public.textile_article_sheets%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF p_sheet_id IS NULL THEN
    UPDATE public.production_orders
       SET article_sheet_version_id = NULL, article_sheet_snapshot = NULL, updated_at = now()
     WHERE id = v_order.id
     RETURNING * INTO v_order;
    RETURN to_jsonb(v_order);
  END IF;

  SELECT * INTO v_sheet
    FROM public.textile_article_sheets
   WHERE id = p_sheet_id AND company_id = v_order.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha do artigo não pertence à empresa' USING ERRCODE = '42501';
  END IF;
  IF v_sheet.status <> 'approved' THEN
    RAISE EXCEPTION 'A OP só pode usar uma versão aprovada da ficha do artigo'
      USING ERRCODE = '55000';
  END IF;
  IF v_sheet.product_id <> v_order.product_id THEN
    RAISE EXCEPTION 'A ficha aprovada é de outro artigo; a OP produz %', v_order.product_code
      USING ERRCODE = '22023';
  END IF;

  v_snapshot := jsonb_build_object(
    'sheet_id', v_sheet.id,
    'version', v_sheet.version,
    'composition', v_sheet.composition,
    'construction', v_sheet.construction,
    'target_gsm', v_sheet.target_gsm,
    'gsm_tolerance_pct', v_sheet.gsm_tolerance_pct,
    'target_width_cm', v_sheet.target_width_cm,
    'width_tolerance_cm', v_sheet.width_tolerance_cm,
    'warp_density_per_cm', v_sheet.warp_density_per_cm,
    'weft_density_per_cm', v_sheet.weft_density_per_cm,
    'approved_at', v_sheet.approved_at
  );

  UPDATE public.production_orders
     SET article_sheet_version_id = v_sheet.id,
         article_sheet_snapshot = v_snapshot,
         updated_at = now()
   WHERE id = v_order.id
   RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_article_sheet(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_article_sheet(uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.textile_article_sheets IS
  'Ficha técnica do artigo (construção/tolerâncias), versionada por produto; valores nunca presumidos.';
COMMENT ON COLUMN public.production_orders.article_sheet_snapshot IS
  'Snapshot da versão aprovada da ficha do artigo usada nesta OP, quando vinculada.';
