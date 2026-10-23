-- ============================================================================
-- USE ERP (local) — ajustes finais pós-migrations. NÃO é migration do projeto.
-- Roda a cada instalação/atualização (idempotente), depois de todas as
-- migrations. Só faz duas coisas, ambas necessárias para o sistema FUNCIONAR
-- num banco construído apenas a partir do histórico:
--
-- 1) GRANT EXECUTE das RPCs que o FRONTEND chama (lista extraída de
--    `supabase.rpc('...')` em src/) para o papel `authenticated`.
--    Por quê: a migration 20260803182747 ("Massive Revoke") revogou EXECUTE
--    de TODAS as funções fora de uma whitelist — incluindo bootstrap_tenant
--    (cadastro da empresa) e dezenas de RPCs de WMS/financeiro/produção que
--    as telas chamam. Num banco só-de-migrations, 46 das 78 RPCs do frontend
--    retornam "permission denied". Estas funções são SECURITY DEFINER e
--    validam a empresa do chamador por dentro (auth.uid()/get_user_company_id),
--    que é o desenho que o próprio histórico usava antes do revoke
--    (ex.: 20260625151654 concede bootstrap_tenant a authenticated).
--    Funções que NÃO estão na lista (ex.: apply_pcp_preview, só service_role)
--    continuam restritas.
--
-- 2) Plano 'starter': bootstrap_tenant procura slug='starter' para abrir o
--    trial de 14 dias; o catálogo era semeado fora das migrations na nuvem
--    (localmente só existiam 'business' e o 'enterprise' do patch). Sem ele,
--    a empresa nasce sem assinatura.
-- ============================================================================

DO $$
DECLARE
  r record;
  frontend_rpcs text[] := ARRAY[
    'aps_schedule_multi','assign_notification','audit_stock_integrity',
    'bank_apply_suggestion','bank_reconcile_auto','bank_reject_suggestion',
    'batch_pay_payables','bootstrap_tenant','calculate_nfe_item_taxes',
    'check_atp','check_credit','check_quota','close_accounting_period',
    'compensate_accounts','compensate_check','detect_financial_alerts',
    'dre_managerial','dre_managerial_entries','finalize_receiving_conference',
    'fn_my_pending_approvals','fn_route_compute_eta','fn_tenant_health',
    'fn_workflow_decide','generate_recurring_entries','get_account_statement',
    'get_branch_daily_demand','get_cashflow_scenarios',
    'get_client_commercial_profile','get_current_plan',
    'get_current_usage_summary','get_dre','get_dre_dynamic','get_dre_summary',
    'get_operator_productivity','get_plugin_rating_summary','get_plugin_reviews',
    'get_user_company_id','get_user_role','get_wms_kpis','has_permission',
    'has_role','increment_nps_bank_usage','is_system_admin',
    'process_charges_ruler','purchase_approval_decide',
    'purchase_approvals_metrics','purchase_approvals_sla_scan',
    'purchase_submit_for_approval','recompute_default_scores',
    'record_forecast_snapshot','reinf_reopen_period','reopen_accounting_period',
    'reopen_fiscal_day','reverse_settlement','settle_account',
    'sre_actions_notify_due','sre_postmortem_action_set_status',
    'sre_postmortem_action_upsert','sre_postmortem_actions_inbox',
    'sre_slo_burn_scan','sre_slo_incident_timeline','sre_slo_status',
    'suggest_category','transfer_between_accounts','use_advance',
    'wms_assemble_kit','wms_dispose_return_item','wms_generate_3pl_invoice',
    'wms_move_stock','wms_pick_order_stock','wms_release_order_reservation',
    'wms_reserve_order_stock','wms_ship_order','wms_update_shipment_stage',
    'wms_wave_plan_v2',
    -- PCP têxtil/tecelagem (migrations 20261019100000/20261019110000). As
    -- migrations já concedem EXECUTE a authenticated; repetir aqui mantém a
    -- lista fiel às RPCs que o frontend chama e protege contra revokes futuros.
    'complete_production_order','create_textile_production_order',
    'reserve_production_materials','release_production_material_reservation',
    'schedule_production_order','cancel_production_schedule',
    'record_production_step_progress','upsert_weaving_order_profile',
    'record_weaving_event','decide_production_quality_inspection',
    'generate_mrp_purchase_order'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (frontend_rpcs)
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'local-final: nao foi possivel conceder %: %', r.proname, SQLERRM;
    END;
  END LOOP;
END $$;

INSERT INTO public.plans (name, slug, description, price_monthly, price_annual, trial_days,
                          max_users, max_orders_month, storage_mb, allowed_modules, is_active, sort_order,
                          max_companies, max_branches, nfe_per_month, ai_calls_per_month)
VALUES (
  'Starter',
  'starter',
  'Plano inicial (trial de 14 dias do cadastro)',
  0, 0, 14,
  5, 1000, 5120,
  ARRAY['comercial','estoque','financeiro','fiscal','wms','producao'],
  true, 1,
  1, 1, 100, 200
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.plan_modules (plan_id, module_key, enabled)
SELECT p.id, unnest(p.allowed_modules), true
FROM public.plans p
WHERE p.slug = 'starter'
ON CONFLICT (plan_id, module_key) DO UPDATE SET enabled = true;

-- ----------------------------------------------------------------------------
-- 3) bootstrap_tenant com a coluna certa de CEP da filial.
--    A versão da migration 20261008210000 insere em branches.address_zip_code,
--    mas public.branches só tem address_zip (criação 20260624222422 e schema
--    final da nuvem) — o INSERT da filial Matriz quebra com 42703 em qualquer
--    banco montado do histórico. Recriamos a função IDÊNTICA, trocando apenas
--    essa coluna no INSERT de branches. Aproveitamos o mesmo INSERT para
--    gravar tipo/canal operacional da Matriz conforme o segmento (industria,
--    CD ou filial), pois o padrão "loja" bloquearia Produção/WMS no guard de
--    contexto. O restante (validações, plano trial, papel admin) é o texto
--    da migration, sem alteração.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
  _company_name text,
  _cnpj text,
  _segment text,
  _address_street text,
  _address_number text,
  _address_neighborhood text,
  _address_city text,
  _address_state text,
  _address_zip text,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _existing uuid;
  _company_id uuid;
  _branch_id uuid;
  _plan_id uuid;
  _sub_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT company_id INTO _existing FROM public.profiles WHERE id = _user_id;
  IF _existing IS NOT NULL THEN
    RAISE EXCEPTION 'user_already_in_tenant';
  END IF;

  IF coalesce(trim(_company_name), '') = '' OR coalesce(trim(_segment), '') = '' OR
     length(regexp_replace(coalesce(_cnpj, ''), '[^0-9]', '', 'g')) <> 14 OR
     coalesce(trim(_address_street), '') = '' OR coalesce(trim(_address_number), '') = '' OR
     coalesce(trim(_address_neighborhood), '') = '' OR coalesce(trim(_address_city), '') = '' OR
     coalesce(trim(_address_state), '') !~ '^[A-Z]{2}$' OR
     coalesce(trim(_address_zip), '') !~ '^[0-9]{5}-?[0-9]{3}$' THEN
    RAISE EXCEPTION 'missing_or_invalid_required_company_fields';
  END IF;

  INSERT INTO public.companies (
    name, trade_name, cnpj, segment, status,
    address_street, address_number, address_neighborhood,
    address_city, address_state, address_zip_code,
    is_headquarters, phone, email
  ) VALUES (
    _company_name, _company_name, _cnpj, _segment, 'active',
    trim(_address_street), trim(_address_number),
    trim(_address_neighborhood),
    trim(_address_city), trim(_address_state),
    trim(_address_zip),
    true, _phone, _email
  )
  RETURNING id INTO _company_id;

  -- [local] address_zip (era address_zip_code, coluna inexistente em branches)
  -- Tambem gravamos o tipo/canal operacional da Matriz conforme o segmento:
  -- sem isso a filial nasce como loja (padrao do schema) e o guard de
  -- contexto bloqueia /producao e /wms para industrias recem-cadastradas.
  INSERT INTO public.branches (
    company_id, name, code, is_headquarters, is_active,
    address_street, address_number, address_neighborhood,
    address_city, address_state, address_zip,
    tipo, canal_padrao
  ) VALUES (
    _company_id, 'Matriz', 'MATRIZ', true, true,
    trim(_address_street), trim(_address_number),
    trim(_address_neighborhood),
    trim(_address_city), trim(_address_state),
    trim(_address_zip),
    CASE
      WHEN _segment IN (
        'textile', 'fio', 'tecelagem', 'dyeing', 'laundry',
        'animal_feed', 'food_factory', 'chemicals', 'apparel', 'confeccao',
        'industry', 'industria', 'pharma'
      ) THEN 'industria'::public.branch_tipo
      WHEN _segment IN ('distribution', 'distribuicao', 'wholesaler')
        THEN 'cd'::public.branch_tipo
      ELSE 'filial'::public.branch_tipo
    END,
    CASE
      WHEN _segment IN ('retail', 'varejo', 'retail_chain', 'franchise')
        THEN 'VAREJO_PDV'::public.canal_operacional
      ELSE 'ATACADO_INDUSTRIA'::public.canal_operacional
    END
  )
  RETURNING id INTO _branch_id;

  -- [local] sinaliza as guardas de profile (secao 4) de que esta atualizacao
  -- vem do onboarding, nao de um UPDATE direto do usuario.
  PERFORM set_config('app.allow_tenant_link', 'on', true);

  UPDATE public.profiles
    SET company_id = _company_id,
        branch_id = _branch_id,
        default_branch_id = _branch_id,
        updated_at = now()
  WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_user_id, 'admin', _company_id)
  ON CONFLICT DO NOTHING;

  SELECT id INTO _plan_id FROM public.plans WHERE slug = 'starter' AND is_active = true LIMIT 1;
  IF _plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      company_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end, trial_end
    ) VALUES (
      _company_id, _plan_id, 'trialing', 'monthly',
      now(), now() + interval '14 days', now() + interval '14 days'
    )
    RETURNING id INTO _sub_id;
  END IF;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'branch_id', _branch_id,
    'subscription_id', _sub_id,
    'trial_ends_at', now() + interval '14 days'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_tenant(text, text, text, text, text, text, text, text, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) Guardas de perfil: permitir a PRIMEIRA vinculacao de tenant.
--    prevent_profile_tenant_hijack (20260709170821) e
--    prevent_profile_tenant_self_change (20260721160518) bloqueiam qualquer
--    mudanca de company_id/branch_id de quem nao e admin/service_role.
--    So que bootstrap_tenant atualiza o profile ANTES de inserir o papel
--    admin — ou seja, o cadastro da primeira empresa sempre esbarra nas
--    guardas em um banco montado do historico.
--    Mantemos as guardas e adicionamos UMA excecao precisa: o
--    bootstrap_tenant (e so ele) liga o sinalizador transacional
--    app.allow_tenant_link antes de atualizar o profile. Um UPDATE direto
--    do usuario pela API nao consegue ligar esse sinalizador (ele nao tem
--    acesso SQL), entao trocar de tenant — ou se vincular a uma empresa
--    alheia — continua bloqueado para nao-admins, como no historico.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_hijack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- [local] onboarding (bootstrap_tenant) sinaliza nesta transacao.
  IF current_setting('app.allow_tenant_link', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'not_allowed: company_id can only be changed by an admin';
  END IF;
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'not_allowed: branch_id can only be changed by an admin';
  END IF;
  IF NEW.default_branch_id IS DISTINCT FROM OLD.default_branch_id THEN
    RAISE EXCEPTION 'not_allowed: default_branch_id can only be changed by an admin';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- [local] onboarding (bootstrap_tenant), como acima.
  IF current_setting('app.allow_tenant_link', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Not allowed to change company_id on your own profile';
  END IF;

  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Not allowed to change branch_id on your own profile';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_company_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    -- [local] alem do service_role (historico), o onboarding sinalizado
    -- (bootstrap_tenant) tambem pode vincular a primeira empresa.
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' <> 'service_role'
       AND current_setting('app.allow_tenant_link', true) <> 'on' THEN
      RAISE EXCEPTION 'company_id cannot be modified by end users'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) profiles.branch_id deve referenciar branches, nao companies.
--    A coluna nasceu em 20260520013528 referenciando companies (na epoca,
--    filial era modelada como empresa). Em 20260624222422 nasceu a tabela
--    branches de verdade (e default_branch_id ja referencia branches), mas a
--    FK antiga nunca foi corrigida — entao gravar o id da filial Matriz em
--    profiles.branch_id quebra com 23503. Repontamos a FK para branches.
--    Instalacao nova nao tem profiles com branch_id; se um dia houver valor
--    que nao seja filial, ele e anulado antes (e o vinculo correto pode ser
--    refeito em Administracao > Usuarios).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_branch_id_fkey'
      AND confrelid = 'public.companies'::regclass
  ) THEN
    UPDATE public.profiles
    SET branch_id = NULL
    WHERE branch_id IS NOT NULL
      AND branch_id NOT IN (SELECT id FROM public.branches);

    ALTER TABLE public.profiles DROP CONSTRAINT profiles_branch_id_fkey;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES public.branches (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6) fn_user_roles_guard: mesma excecao sinalizada do onboarding.
--    A guarda (20260709143139) impede o usuario de inserir o proprio papel
--    admin — que e exatamente o ultimo passo do bootstrap_tenant (admin da
--    empresa que ele acabou de criar). Com o sinalizador da transacao do
--    bootstrap, permitimos; fora dele, a guarda segue identica.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_user_roles_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_system_admin boolean;
BEGIN
  -- Service role / no auth context bypass (edge functions & migrations)
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- [local] onboarding sinalizado (bootstrap_tenant criando a propria empresa)
  IF current_setting('app.allow_tenant_link', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_system_admin := public.has_role(v_caller, 'system_admin'::app_role);

  -- Block any attempt to touch own row unless system_admin
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.user_id = v_caller AND NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Users cannot assign or modify their own roles';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.user_id = v_caller AND NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Users cannot delete their own role rows';
  END IF;

  -- Block non-system_admin from ever creating/modifying admin/system_admin rows
  IF TG_OP IN ('INSERT','UPDATE')
     AND NEW.role IN ('admin'::app_role, 'system_admin'::app_role)
     AND NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Only system_admin can grant admin or system_admin roles';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.role IN ('admin'::app_role, 'system_admin'::app_role)
     AND NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Only system_admin can modify admin or system_admin roles';
  END IF;
  IF TG_OP = 'DELETE'
     AND OLD.role IN ('admin'::app_role, 'system_admin'::app_role)
     AND NOT v_is_system_admin THEN
    RAISE EXCEPTION 'Only system_admin can delete admin or system_admin roles';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
