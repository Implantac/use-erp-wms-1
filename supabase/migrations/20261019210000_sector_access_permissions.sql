-- ============================================================================
-- Permissão por gerente/operador de setor (Fase 1c do plano de produção).
--
-- Problema: hoje qualquer usuário da empresa aponta eventos e altera perfis
-- de QUALQUER setor (fiação aponta em tinturaria). O gerente de PCP de cada
-- setor precisa de posse real do seu setor.
--
-- Desenho (incremental e reversível):
--  1. `user_sector_access`: concessões (viewer < operator < manager) por
--     empresa/usuário/setor. Escrita SOMENTE pela RPC admin
--     `set_user_sector_access`; leitura: o próprio usuário ou admin.
--  2. `assert_sector_access(setor, nível)`: admin da empresa passa sempre.
--     Enquanto a empresa NÃO tem nenhuma concessão cadastrada, vale o modo
--     legado (todos operam — não quebra instalações existentes). Assim que o
--     admin cadastra a primeira concessão, a empresa entra em modo restrito
--     e o acesso passa a ser por concessão.
--  3. As RPCs de escrita do PCP setorial ganham guarda via wrapper: a
--     implementação atual é renomeada para `*_impl` (execute revogado) e a
--     assinatura pública passa a validar o setor antes de delegar.
--     - record_sector_event        -> operator no setor informado
--     - record_weaving_event       -> operator em tecelagem
--     - upsert_sector_order_profile-> manager no setor informado
--     - upsert_weaving_order_profile-> manager em tecelagem
--
-- Rollback manual: apagar os wrappers, renomear `*_impl` de volta ao nome
-- público, restaurar os GRANTs originais e dropar a tabela/funções novas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Correção colateral do ensaio A/B: `categories` é catálogo GLOBAL por
-- desenho (o seed de catálogo por processo grava sem company_id e os
-- produtos de todas as empresas referenciam as mesmas categorias), mas a
-- migration 20260603153200 a deixou tenant-only — linhas globais ficaram
-- invisíveis para qualquer empresa. Regra correta: toda empresa LÊ o
-- catálogo global + as próprias categorias; só ESCREVE nas próprias.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "categories_tenant_all" ON public.categories;
DROP POLICY IF EXISTS "categories_read" ON public.categories;
DROP POLICY IF EXISTS "categories_write" ON public.categories;
CREATE POLICY "categories_read" ON public.categories
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "categories_write" ON public.categories
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_sector_access (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sector text NOT NULL CHECK (sector IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria')),
  access_level text NOT NULL CHECK (access_level IN ('viewer', 'operator', 'manager')),
  granted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, sector)
);

ALTER TABLE public.user_sector_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sector_access_select ON public.user_sector_access;
CREATE POLICY user_sector_access_select ON public.user_sector_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id IN (
      SELECT ur.company_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.user_sector_access FROM authenticated, anon;
GRANT SELECT ON public.user_sector_access TO authenticated;

-- Núcleo booleano da regra (verdade única usada pelo assert e pela UI).
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
  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria') THEN RETURN false; END IF;

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
  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria') THEN
    RAISE EXCEPTION 'Setor inválido: %', COALESCE(p_sector, '(nulo)') USING ERRCODE = '22023';
  END IF;
  IF NOT public.sector_access_allowed(p_sector, p_min_level) THEN
    RAISE EXCEPTION 'Sem permissão no setor % (requer %)', p_sector, p_min_level USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_sector_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_sector_access(text, text) TO authenticated, service_role;

-- Contexto para a interface (quais centrais abrir).
CREATE OR REPLACE FUNCTION public.my_sector_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.get_user_company_id(auth.uid());
  v_access jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RETURN jsonb_build_object('is_admin', false, 'enforced', false, 'access', '{}'::jsonb);
  END IF;
  SELECT COALESCE(jsonb_object_agg(usa.sector, usa.access_level), '{}'::jsonb)
    INTO v_access
  FROM public.user_sector_access usa
  WHERE usa.company_id = v_company AND usa.user_id = auth.uid();
  RETURN jsonb_build_object(
    'is_admin', EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin' AND ur.company_id = v_company
    ),
    'enforced', EXISTS (SELECT 1 FROM public.user_sector_access x WHERE x.company_id = v_company),
    'access', v_access
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_sector_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sector_access() TO authenticated, service_role;

-- Concessão/revogação (somente admin, somente na própria empresa).
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

  IF p_sector NOT IN ('fiacao', 'tecelagem', 'malharia', 'tinturaria') THEN
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
-- Wrappers com guarda de setor sobre as RPCs de escrita do PCP setorial.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text)
  RENAME TO record_sector_event_impl;
REVOKE ALL ON FUNCTION public.record_sector_event_impl(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

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
  p_operator_name text DEFAULT NULL,
  p_deviation_category text DEFAULT NULL,
  p_cause_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_sector_access(p_sector, 'operator');
  RETURN public.record_sector_event_impl(
    p_production_order_id, p_sector, p_event_type, p_production_order_step_id,
    p_machine_id, p_resource_id, p_quantity, p_downtime_minutes, p_reason,
    p_operator_name, p_deviation_category, p_cause_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sector_event(uuid, text, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) TO authenticated, service_role;

ALTER FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text)
  RENAME TO record_weaving_event_impl;
REVOKE ALL ON FUNCTION public.record_weaving_event_impl(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_weaving_event(
  p_production_order_id uuid,
  p_event_type text,
  p_production_order_step_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_quantity_m numeric DEFAULT NULL,
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
BEGIN
  PERFORM public.assert_sector_access('tecelagem', 'operator');
  RETURN public.record_weaving_event_impl(
    p_production_order_id, p_event_type, p_production_order_step_id,
    p_machine_id, p_resource_id, p_quantity_m, p_downtime_minutes, p_reason,
    p_operator_name, p_deviation_category, p_cause_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_weaving_event(uuid, text, uuid, uuid, uuid, numeric, numeric, text, text, text, text) TO authenticated, service_role;

ALTER FUNCTION public.upsert_sector_order_profile(uuid, text, jsonb)
  RENAME TO upsert_sector_order_profile_impl;
REVOKE ALL ON FUNCTION public.upsert_sector_order_profile_impl(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;

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
BEGIN
  PERFORM public.assert_sector_access(p_sector, 'manager');
  RETURN public.upsert_sector_order_profile_impl(p_production_order_id, p_sector, p_profile);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_sector_order_profile(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_sector_order_profile(uuid, text, jsonb) TO authenticated, service_role;

ALTER FUNCTION public.upsert_weaving_order_profile(uuid, jsonb)
  RENAME TO upsert_weaving_order_profile_impl;
REVOKE ALL ON FUNCTION public.upsert_weaving_order_profile_impl(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_weaving_order_profile(
  p_production_order_id uuid,
  p_profile jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_sector_access('tecelagem', 'manager');
  RETURN public.upsert_weaving_order_profile_impl(p_production_order_id, p_profile);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_weaving_order_profile(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_weaving_order_profile(uuid, jsonb) TO authenticated, service_role;
