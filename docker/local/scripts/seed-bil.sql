-- ============================================================================
-- USE ERP (local) — cadastro da BIL Importação e Exportação LTDA
--
-- O que este script faz (de forma idempotente, pode rodar de novo):
--   1) Cria/atualiza o usuário administrador informado em admin_email,
--      com a senha informada em admin_password (via -v do psql, nunca
--      gravada neste arquivo) e e-mail já confirmado.
--   2) Cadastra a empresa matriz pelo CNPJ 30.965.938/0001-07, com os
--      dados públicos do cartão CNPJ, segmento têxtil integrado e os
--      ramos Tecelagem + Tinturaria registrados.
--   3) Cria/atualiza a filial Matriz como unidade INDUSTRIAL no canal
--      ATACADO_INDUSTRIA — sem isso o guard de contexto operacional
--      bloqueia as rotas /producao e /wms.
--   4) Vincula o administrador à empresa como papel admin, libera o
--      plano Enterprise com TODOS os módulos (incl. Produção/PCP/WMS),
--      assinatura ativa sem vencimento prático (2099) e todas as
--      permissões do catálogo para o papel admin.
--
-- Uso (a partir da raiz do projeto, com a stack local no ar):
--   docker compose -f docker-compose.local.yml --env-file .env.local \
--     exec -T db psql -U supabase_admin -d postgres \
--     -v ON_ERROR_STOP=1 \
--     -v admin_email='etcsuporte889@gmail.com' \
--     -v admin_password='<senha-inicial>' \
--     -f /tmp/seed-bil.sql
-- (Os scripts cadastrar-bil.ps1 / cadastrar-bil.sh fazem isso por você.)
--
-- Pré-requisito: migrations aplicadas (instalar-local.ps1/.sh ou o serviço
-- `migrate` do docker-compose.local.yml), que já inclui o 99-local-final.sql.
-- ============================================================================

\set ON_ERROR_STOP on

-- Os scripts cadastrar-bil.ps1/.sh passam a senha pela variavel de
-- ambiente BIL_ADMIN_PASSWORD (sem expo-la como argumento do psql).
-- Quem chamar o psql diretamente pode usar -v admin_password='...'.
\if :{?admin_password}
\else
  \getenv admin_password BIL_ADMIN_PASSWORD
\endif

-- psql nao interpola :'variavel' dentro de blocos $$; passamos os valores
-- por GUC de sessao e o bloco le com current_setting().
SELECT set_config('app.admin_email', :'admin_email', false);
SELECT set_config('app.admin_password', :'admin_password', false);

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Sinalizadores aceitos pelas guardas locais (ver 99-local-final.sql):
-- este cadastro é administrativo (SQL local), não um UPDATE pela API.
SELECT set_config('app.allow_tenant_link', 'on', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

DO $$
DECLARE
  v_admin_email text := lower(trim(current_setting('app.admin_email', true)));
  v_admin_password text := current_setting('app.admin_password', true);
  v_admin_name text := 'Administrador BIL';
  v_crypto_schema text;
  v_password_hash text;
  v_user_id uuid;
  v_company_id uuid;
  v_branch_id uuid;
  v_plan_id uuid;

  v_company_name text := 'Bil Importação e Exportação LTDA';
  v_trade_name text := 'BIL IMPORTACAO E EXPORTACAO';
  v_cnpj text := '30.965.938/0001-07';
  v_company_email text := 'fiscal@biltextil.com.br';
  v_company_phone text := '(11) 4174-3000';
  v_street text := 'Rodovia Antonio Heil';
  v_number text := '14955';
  v_complement text := 'Galpão 02';
  v_neighborhood text := 'Brilhante I';
  v_city text := 'Itajai';
  v_state text := 'SC';
  v_zip text := '88318-251';

  v_modules text[] := ARRAY[
    'admin', 'agro', 'comercial', 'commercial', 'compras', 'contabilidade',
    'construction', 'construcao', 'core', 'credito', 'crm', 'cerebro_nativo',
    'educacao', 'estoque', 'executivo', 'fiscal', 'financeiro', 'financial',
    'governanca', 'health', 'inventory', 'marketplace', 'nps', 'producao',
    'production', 'quality_control', 'relatorios', 'relacionamento',
    'relationship', 'rfid', 'saude', 'tms', 'use_success', 'wms'
  ];
BEGIN
  IF v_admin_email = '' OR v_admin_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'admin_email invalido: %', v_admin_email;
  END IF;
  IF length(coalesce(v_admin_password, '')) < 6 THEN
    RAISE EXCEPTION 'admin_password deve ter ao menos 6 caracteres';
  END IF;

  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.companies') IS NULL
     OR to_regclass('public.branches') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.plans') IS NULL THEN
    RAISE EXCEPTION 'Banco local incompleto: rode as migrations (servico migrate) antes deste cadastro.';
  END IF;

  SELECT n.nspname INTO v_crypto_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'crypt'
    AND pg_get_function_identity_arguments(p.oid) = 'text, text'
  ORDER BY CASE n.nspname WHEN 'extensions' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Extensao pgcrypto nao encontrada (funcao crypt ausente).';
  END IF;

  EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 10))', v_crypto_schema, v_crypto_schema)
    USING v_admin_password
    INTO v_password_hash;

  -- ------------------------------------------------------------------
  -- 1) Usuário administrador (Auth)
  -- ------------------------------------------------------------------
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_admin_email
  ORDER BY created_at
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone, phone_change,
      phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_admin_email,
      v_password_hash,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', v_admin_name),
      false,
      false,
      now(),
      now(),
      '', '', '', '', '', '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET email = v_admin_email,
        encrypted_password = v_password_hash,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
          || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('name', v_admin_name),
        is_super_admin = false,
        is_sso_user = false,
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        phone = COALESCE(phone, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        deleted_at = NULL,
        banned_until = NULL,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Identidade de e-mail/senha (necessária para o login no GoTrue).
  DELETE FROM auth.identities WHERE user_id = v_user_id AND provider = 'email';
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_admin_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  -- O trigger on_auth_user_created normalmente cria o profile; garantimos.
  INSERT INTO public.profiles (id, name, email)
  VALUES (v_user_id, v_admin_name, v_admin_email)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      email = EXCLUDED.email,
      updated_at = now();

  -- ------------------------------------------------------------------
  -- 2) Empresa (matriz) — reutiliza se o CNPJ já estiver cadastrado
  -- ------------------------------------------------------------------
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
  ORDER BY created_at
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (
      name, trade_name, cnpj, segment, sub_segment, status,
      address_street, address_number, address_complement,
      address_neighborhood, address_city, address_state, address_zip_code,
      is_headquarters, phone, email
    ) VALUES (
      v_company_name, v_trade_name, v_cnpj, 'textile',
      'Tecelagem e tinturaria', 'active',
      v_street, v_number, v_complement,
      v_neighborhood, v_city, v_state, v_zip,
      true, v_company_phone, v_company_email
    )
    RETURNING id INTO v_company_id;
  END IF;

  UPDATE public.companies
  SET name = v_company_name,
      trade_name = v_trade_name,
      cnpj = v_cnpj,
      segment = 'textile',
      sub_segment = 'Tecelagem e tinturaria',
      operation_types = '["tecelagem", "dyeing"]'::jsonb,
      tax_regime = 'real'::public.tax_regime,
      tier = 'enterprise'::public.enterprise_tier,
      type = 'company'::public.org_type,
      status = 'active',
      is_headquarters = true,
      require_2fa = false,
      address_street = v_street,
      address_number = v_number,
      address_complement = v_complement,
      address_neighborhood = v_neighborhood,
      address_city = v_city,
      address_state = v_state,
      address_zip_code = v_zip,
      phone = v_company_phone,
      email = v_company_email,
      settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
        'business_model', 'industrial',
        'tax_regime', 'real',
        'use_multi_branch', true,
        'modules', jsonb_build_object(
          'commercial', true,
          'logistics', true,
          'production', true,
          'financial', true,
          'fiscal', true,
          'governance', true,
          'audit', true
        ),
        'industrial', jsonb_build_object(
          'profile', 'weaving_dyeing',
          'families', jsonb_build_array('weaving', 'dyeing'),
          'stages', jsonb_build_object(
            'weaving', 'internal',
            'dyeing', 'internal'
          )
        ),
        'production_access', 'full',
        'activity_segments', jsonb_build_array('tecelagem', 'dyeing')
      ),
      updated_at = now()
  WHERE id = v_company_id;

  -- ------------------------------------------------------------------
  -- 3) Filial Matriz industrial (Produção/WMS exigem INDUSTRY +
  --    ATACADO_INDUSTRIA + unidade selecionada)
  -- ------------------------------------------------------------------
  SELECT id INTO v_branch_id
  FROM public.branches
  WHERE company_id = v_company_id AND is_headquarters = true
  ORDER BY created_at
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (
      company_id, name, code, cnpj, tax_regime,
      is_headquarters, is_active,
      address_street, address_number, address_complement,
      address_neighborhood, address_city, address_state, address_zip,
      phone, email, tipo, canal_padrao
    ) VALUES (
      v_company_id, 'Matriz', 'MATRIZ', v_cnpj, 'real',
      true, true,
      v_street, v_number, v_complement,
      v_neighborhood, v_city, v_state, v_zip,
      v_company_phone, v_company_email,
      'industria'::public.branch_tipo,
      'ATACADO_INDUSTRIA'::public.canal_operacional
    )
    RETURNING id INTO v_branch_id;
  ELSE
    UPDATE public.branches
    SET name = 'Matriz',
        cnpj = v_cnpj,
        tax_regime = 'real',
        is_active = true,
        address_street = v_street,
        address_number = v_number,
        address_complement = v_complement,
        address_neighborhood = v_neighborhood,
        address_city = v_city,
        address_state = v_state,
        address_zip = v_zip,
        phone = v_company_phone,
        email = v_company_email,
        tipo = 'industria'::public.branch_tipo,
        canal_padrao = 'ATACADO_INDUSTRIA'::public.canal_operacional,
        updated_at = now()
    WHERE id = v_branch_id;
  END IF;

  -- ------------------------------------------------------------------
  -- 4) Vínculo do administrador + papel admin da empresa
  -- ------------------------------------------------------------------
  UPDATE public.profiles
  SET company_id = v_company_id,
      branch_id = v_branch_id,
      default_branch_id = v_branch_id,
      name = v_admin_name,
      email = v_admin_email,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (v_user_id, 'admin'::public.app_role, v_company_id)
  ON CONFLICT (user_id, role, company_id) DO UPDATE
  SET updated_at = now();

  -- ------------------------------------------------------------------
  -- 5) Plano Enterprise completo + assinatura ativa da BIL
  -- ------------------------------------------------------------------
  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE slug = 'enterprise'
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.plans (
      name, slug, description, price_monthly, price_annual, trial_days,
      max_users, max_orders_month, storage_mb, allowed_modules, is_active,
      sort_order, max_companies, max_branches, nfe_per_month, ai_calls_per_month
    ) VALUES (
      'Enterprise',
      'enterprise',
      'Plano completo: todos os módulos, incluindo Produção/PCP e WMS',
      0, 0, 0,
      9999, 999999, 102400, v_modules, true,
      4, 99, 999, 999999, 999999
    )
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE public.plans
    SET name = 'Enterprise',
        description = 'Plano completo: todos os módulos, incluindo Produção/PCP e WMS',
        allowed_modules = v_modules,
        is_active = true,
        max_users = 9999,
        max_orders_month = 999999,
        storage_mb = GREATEST(storage_mb, 102400),
        max_companies = GREATEST(max_companies, 99),
        max_branches = GREATEST(max_branches, 999),
        nfe_per_month = GREATEST(nfe_per_month, 999999),
        ai_calls_per_month = GREATEST(ai_calls_per_month, 999999),
        updated_at = now()
    WHERE id = v_plan_id;
  END IF;

  INSERT INTO public.plan_modules (plan_id, module_key, enabled)
  SELECT v_plan_id, module_key, true
  FROM unnest(v_modules) AS module_key
  ON CONFLICT (plan_id, module_key) DO UPDATE SET enabled = true;

  -- Features: herda todas as já catalogadas em qualquer plano e garante
  -- as de Produção/Têxtil da BIL.
  INSERT INTO public.plan_features (plan_id, feature_key, feature_label, enabled, limit_value)
  SELECT v_plan_id, catalog.feature_key, catalog.feature_label, true, NULL
  FROM (
    SELECT feature_key, max(feature_label) AS feature_label
    FROM public.plan_features
    WHERE plan_id <> v_plan_id
    GROUP BY feature_key
    UNION ALL
    SELECT feature_key, feature_label
    FROM (VALUES
      ('producao', 'Produção / PCP'),
      ('production', 'Produção / PCP'),
      ('pcp', 'PCP'),
      ('mrp', 'MRP'),
      ('aps', 'APS'),
      ('quality_control', 'Controle de Qualidade'),
      ('textile', 'Têxtil'),
      ('tecelagem', 'Tecelagem'),
      ('weaving', 'Tecelagem'),
      ('tinturaria', 'Tinturaria'),
      ('dyeing', 'Tinturaria')
    ) AS wanted(feature_key, feature_label)
  ) AS catalog
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_features existing
    WHERE existing.plan_id = v_plan_id
      AND existing.feature_key = catalog.feature_key
  );

  UPDATE public.plan_features
  SET enabled = true,
      limit_value = NULL
  WHERE plan_id = v_plan_id;

  INSERT INTO public.subscriptions (
    company_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, trial_end,
    cancelled_at, cancel_at_period_end
  ) VALUES (
    v_company_id, v_plan_id, 'active', 'annual',
    now(), '2099-12-31 23:59:59+00', NULL,
    NULL, false
  )
  ON CONFLICT (company_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id,
      status = 'active',
      billing_cycle = 'annual',
      current_period_start = now(),
      current_period_end = '2099-12-31 23:59:59+00',
      trial_end = NULL,
      cancelled_at = NULL,
      cancel_at_period_end = false,
      updated_at = now();

  -- ------------------------------------------------------------------
  -- 6) Permissões: catálogo de Produção + admin com tudo + overrides
  --    explícitos do administrador nesta empresa
  -- ------------------------------------------------------------------
  INSERT INTO public.permissions (resource, action, module_key, description) VALUES
    ('production.orders', 'read', 'producao', 'Visualizar ordens de produção'),
    ('production.orders', 'write', 'producao', 'Criar/editar ordens de produção'),
    ('production.orders', 'delete', 'producao', 'Excluir ordens de produção'),
    ('production.orders', 'approve', 'producao', 'Aprovar ordens de produção'),
    ('production.pcp', 'read', 'producao', 'Visualizar PCP'),
    ('production.pcp', 'write', 'producao', 'Operar PCP'),
    ('production.mrp', 'read', 'producao', 'Visualizar MRP'),
    ('production.mrp', 'write', 'producao', 'Operar MRP'),
    ('production.aps', 'read', 'producao', 'Visualizar APS'),
    ('production.aps', 'write', 'producao', 'Operar APS'),
    ('production.quality', 'read', 'producao', 'Visualizar qualidade'),
    ('production.quality', 'write', 'producao', 'Operar qualidade'),
    ('production.machines', 'read', 'producao', 'Visualizar máquinas e recursos'),
    ('production.machines', 'write', 'producao', 'Operar máquinas e recursos'),
    ('production.routes', 'read', 'producao', 'Visualizar roteiros de produção'),
    ('production.routes', 'write', 'producao', 'Operar roteiros de produção'),
    ('production.costs', 'read', 'producao', 'Visualizar custos de produção'),
    ('production.costs', 'write', 'producao', 'Operar custos de produção'),
    ('production.traceability', 'read', 'producao', 'Visualizar rastreabilidade'),
    ('production.traceability', 'write', 'producao', 'Operar rastreabilidade')
  ON CONFLICT (resource, action) DO UPDATE
  SET module_key = EXCLUDED.module_key,
      description = EXCLUDED.description;

  INSERT INTO public.role_permissions (role, permission_id)
  SELECT 'admin'::public.app_role, id
  FROM public.permissions
  ON CONFLICT (role, permission_id) DO NOTHING;

  INSERT INTO public.user_permission_overrides (
    user_id, company_id, permission_id, granted, created_by
  )
  SELECT v_user_id, v_company_id, id, true, v_user_id
  FROM public.permissions
  ON CONFLICT (user_id, company_id, permission_id) DO UPDATE
  SET granted = true;

  -- ------------------------------------------------------------------
  -- 7) Autoverificação (qualquer falha desfaz o cadastro inteiro)
  -- ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  IF NOT public.has_module_access('producao') THEN
    RAISE EXCEPTION 'Verificacao falhou: modulo producao nao liberado para a BIL';
  END IF;
  IF NOT public.has_module_access('production') THEN
    RAISE EXCEPTION 'Verificacao falhou: modulo production nao liberado para a BIL';
  END IF;
  IF NOT public.has_module_access('wms') THEN
    RAISE EXCEPTION 'Verificacao falhou: modulo wms nao liberado para a BIL';
  END IF;
  IF NOT public.has_permission(v_user_id, v_company_id, 'production.orders', 'read') THEN
    RAISE EXCEPTION 'Verificacao falhou: sem permissao de leitura em production.orders';
  END IF;
  IF NOT public.has_permission(v_user_id, v_company_id, 'production.orders', 'write') THEN
    RAISE EXCEPTION 'Verificacao falhou: sem permissao de escrita em production.orders';
  END IF;

  RAISE NOTICE 'BIL cadastrada: empresa %, filial %, admin %', v_company_id, v_branch_id, v_admin_email;
END $$;

COMMIT;

-- Resumo final do cadastro
SELECT
  c.name AS empresa,
  c.cnpj,
  c.segment,
  c.sub_segment AS ramos,
  c.tax_regime::text AS regime_tributario,
  b.name AS filial,
  b.tipo::text AS tipo_filial,
  b.canal_padrao::text AS canal,
  u.email AS administrador,
  p.slug AS plano,
  s.status AS assinatura,
  s.current_period_end AS valida_ate,
  (
    SELECT count(*)
    FROM public.plan_modules pm
    WHERE pm.plan_id = p.id AND pm.enabled
  ) AS modulos_liberados
FROM public.companies c
JOIN public.branches b
  ON b.company_id = c.id AND b.is_headquarters = true
JOIN public.profiles pr ON pr.company_id = c.id
JOIN auth.users u ON u.id = pr.id
JOIN public.subscriptions s ON s.company_id = c.id
JOIN public.plans p ON p.id = s.plan_id
WHERE regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = '30965938000107'
  AND lower(u.email) = lower(current_setting('app.admin_email', true));
