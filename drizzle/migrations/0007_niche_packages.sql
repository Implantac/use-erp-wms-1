CREATE TABLE IF NOT EXISTS public.niche_packages (
  segment text PRIMARY KEY, label text NOT NULL, modules text[] NOT NULL DEFAULT '{}',
  suggested_families text[] NOT NULL DEFAULT '{}', description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.niche_packages FROM PUBLIC, anon;
GRANT SELECT ON public.niche_packages TO authenticated;
GRANT ALL ON public.niche_packages TO service_role;
ALTER TABLE public.niche_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS niche_packages_select ON public.niche_packages;
CREATE POLICY niche_packages_select ON public.niche_packages FOR SELECT TO authenticated USING (true);

INSERT INTO public.niche_packages (segment, label, modules, suggested_families, description) VALUES
  ('textile', 'Têxtil (fios, malha e tecidos)',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid'],
   ARRAY['spinning','weaving','knitting','dyeing','finishing'], 'Centrais PCP por setor, perfis e eventos próprios, lotes e genealogia.'),
  ('apparel', 'Confecção',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid'],
   ARRAY['apparel'], 'Base industrial; pack profundo de confecção entra na Fase 4 do plano.'),
  ('food_factory', 'Alimentícia',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid'],
   ARRAY['food'], 'Base industrial; pack de alimentos (lote/validade) entra na Fase 4.'),
  ('animal_feed', 'Ração animal',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid','agro'],
   ARRAY['animal_feed'], 'Base industrial + agro; pack de ração entra na Fase 4.'),
  ('chemicals', 'Produtos químicos',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid'],
   ARRAY['chemicals'], 'Base industrial; pack químico (FISPQ/segurança) entra na Fase 4.'),
  ('pharma', 'Farmacêutico',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','producao','production','quality_control','wms','rfid'],
   ARRAY['chemicals'], 'Base industrial; sem pack profundo no lançamento.'),
  ('distribution', 'Distribuição',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success','wms','tms'],
   ARRAY[]::text[], 'Base ERP + WMS/TMS, sem produção.'),
  ('general', 'Geral (ERP)',
   ARRAY['admin','core','comercial','commercial','compras','estoque','inventory','financeiro','financial','fiscal','contabilidade','credito','crm','relacionamento','relationship','relatorios','executivo','governanca','nps','use_success'],
   ARRAY[]::text[], 'Somente a base ERP, sem pacotes verticais.')
ON CONFLICT (segment) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.company_niche_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  old_segment text, new_segment text NOT NULL,
  process_families text[] NOT NULL DEFAULT '{}', modules_applied integer NOT NULL DEFAULT 0,
  changed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_niche_history_company_idx ON public.company_niche_history (company_id, created_at DESC);
REVOKE ALL ON public.company_niche_history FROM PUBLIC, anon;
GRANT SELECT ON public.company_niche_history TO authenticated;
GRANT ALL ON public.company_niche_history TO service_role;
ALTER TABLE public.company_niche_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_niche_history_select ON public.company_niche_history;
CREATE POLICY company_niche_history_select ON public.company_niche_history
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_company_niche(p_company_id uuid, p_segment text, p_process_families text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pkg public.niche_packages%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.plans%ROWTYPE;
  v_plan_id uuid;
  v_is_shared boolean;
  v_old_segment text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_pkg FROM public.niche_packages WHERE segment = p_segment AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nicho não cadastrado ou inativo: %', COALESCE(p_segment, '(nulo)') USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user AND company_id = p_company_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Apenas o administrador da empresa define o nicho' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions
   WHERE company_id = p_company_id AND status IN ('active', 'trialing', 'trial') ORDER BY created_at DESC LIMIT 1;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'Empresa sem assinatura ativa para aplicar o pacote do nicho' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = v_sub.plan_id;
  v_is_shared := EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.plan_id = v_plan.id AND s.company_id <> p_company_id AND s.status IN ('active', 'trialing', 'trial'));
  IF v_is_shared OR v_plan.slug NOT LIKE 'niche-%' THEN
    INSERT INTO public.plans (name, slug, description, price_monthly, price_annual, trial_days, max_users, max_companies, max_branches, max_orders_month, nfe_per_month, ai_calls_per_month, storage_mb, allowed_modules, is_active, sort_order)
    VALUES ('Nicho ' || v_pkg.label || ' — ' || v_company.name, 'niche-' || p_company_id::text, 'Plano dedicado gerado do pacote do nicho ' || v_pkg.segment,
      v_plan.price_monthly, v_plan.price_annual, v_plan.trial_days, v_plan.max_users, v_plan.max_companies, v_plan.max_branches,
      v_plan.max_orders_month, v_plan.nfe_per_month, v_plan.ai_calls_per_month, v_plan.storage_mb, v_pkg.modules, true, v_plan.sort_order)
    ON CONFLICT (slug) DO UPDATE SET allowed_modules = EXCLUDED.allowed_modules
    RETURNING id INTO v_plan_id;
    UPDATE public.subscriptions SET plan_id = v_plan_id WHERE id = v_sub.id;
  ELSE
    v_plan_id := v_plan.id;
    UPDATE public.plans SET allowed_modules = v_pkg.modules WHERE id = v_plan_id;
  END IF;
  DELETE FROM public.plan_modules WHERE plan_id = v_plan_id;
  INSERT INTO public.plan_modules (plan_id, module_key, enabled) SELECT v_plan_id, module_key, true FROM unnest(v_pkg.modules) AS module_key;
  v_old_segment := v_company.segment;
  UPDATE public.companies SET segment = p_segment,
    settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{industrial}',
      COALESCE(settings -> 'industrial', '{}'::jsonb) || jsonb_build_object('families', to_jsonb(COALESCE(p_process_families, '{}'::text[]))), true),
    updated_at = now()
  WHERE id = p_company_id;
  INSERT INTO public.company_niche_history (company_id, old_segment, new_segment, process_families, modules_applied, changed_by)
  VALUES (p_company_id, v_old_segment, p_segment, COALESCE(p_process_families, '{}'::text[]), coalesce(array_length(v_pkg.modules, 1), 0), v_user);
  RETURN jsonb_build_object('company_id', p_company_id, 'segment', p_segment, 'previous_segment', v_old_segment, 'plan_id', v_plan_id, 'modules_enabled', coalesce(array_length(v_pkg.modules, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION public.set_company_niche(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_niche(uuid, text, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_niche(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_segment text; v_families jsonb; v_modules text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = p_company_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa fora do alcance do usuário' USING ERRCODE = '42501';
  END IF;
  SELECT segment, COALESCE(settings -> 'industrial' -> 'families', '[]'::jsonb) INTO v_segment, v_families FROM public.companies WHERE id = p_company_id;
  SELECT COALESCE(array_agg(pm.module_key ORDER BY pm.module_key), '{}') INTO v_modules
    FROM public.subscriptions s JOIN public.plan_modules pm ON pm.plan_id = s.plan_id AND pm.enabled
   WHERE s.company_id = p_company_id AND s.status IN ('active', 'trialing', 'trial');
  RETURN jsonb_build_object('company_id', p_company_id, 'segment', v_segment, 'families', COALESCE(v_families, '[]'::jsonb), 'modules', COALESCE(v_modules, '{}'::text[]));
END;
$$;
REVOKE ALL ON FUNCTION public.get_company_niche(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_niche(uuid) TO authenticated, service_role;