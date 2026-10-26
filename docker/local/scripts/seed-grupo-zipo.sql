-- ============================================================================
-- USE ERP (local) — cadastro do grupo Zipo Confecções + TEXAS FARM STORE
--
-- Grupo multi-CNPJ para testar o fluxo operacional do controle de lojas:
--   * Zipo Confecções (CNPJ 10.312.467/0001-20, IE 90453753-55) — INDÚSTRIA
--     de confecções (segmento/nicho 'apparel'), com a unidade Matriz/CD.
--   * TEXAS FARM STORE LTDA - EPP (CNPJ 57.832.353/0001-75) — Loja empresa
--     do grupo (parent_company_id = Zipo), com o CD Loja e a Loja.
--   * Usuário etcsuporte como administrador das DUAS empresas (acesso total:
--     papel admin, todas as permissões do catálogo e overrides explícitos).
--   * O sistema se molda ao nicho: aplica o RPC OFICIAL set_company_niche
--     ('apparel' = Confecção), que libera os módulos do pacote e registra a
--     auditoria; nada de nicho "no braço".
--   * Estoque inicial real (lotes/saldos pelo mesmo padrão dos demais seeds)
--     + políticas de reposição da Loja — a Loja nasce abaixo do mínimo e o
--     motor de reposição passa a sugerir (indústria/CD como fontes).
--
-- Idempotente: pode rodar de novo sem duplicar nada.
--
-- Uso (stack local no ar, migrations aplicadas — REPARAR-BANCO.bat):
--   docker compose -f docker-compose.local.yml --env-file .env.local \
--     exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     -v admin_email='etcsuporte889@gmail.com' \
--     -f /tmp/seed-grupo-zipo.sql
-- (PREPARAR-GRUPO-ZIPO.bat faz isso por você.)
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?admin_password}
\else
  \getenv admin_password ZIPO_ADMIN_PASSWORD
\endif

SELECT set_config('app.admin_email', :'admin_email', false);
SELECT set_config('app.admin_password', :'admin_password', false);

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Cadastro administrativo via SQL local (mesmas guardas do cadastro da BIL).
SELECT set_config('app.allow_tenant_link', 'on', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $seed$
DECLARE
  v_admin_email    text := lower(current_setting('app.admin_email'));
  v_admin_password text := current_setting('app.admin_password');
  v_admin_name     text := 'Etc Suporte';
  v_crypto_schema  text;
  v_password_hash  text;
  v_user_id        uuid;

  v_zipo_id   uuid;
  v_loja_id   uuid;
  v_zipo_br   uuid;  -- Matriz/CD da indústria
  v_loja_cd   uuid;  -- CD da Loja (empresa Loja)
  v_loja_st   uuid;  -- Loja da Loja

  v_plan_id   uuid;
  v_modules   text[];
  r           record;
BEGIN
  IF v_admin_email IS NULL OR v_admin_email = '' THEN
    RAISE EXCEPTION 'admin_email nao informado (psql -v admin_email=...)';
  END IF;
  IF v_admin_password IS NULL OR length(v_admin_password) < 6 THEN
    RAISE EXCEPTION 'admin_password deve ter ao menos 6 caracteres';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'Banco local incompleto: rode as migrations (REPARAR-BANCO) antes.';
  END IF;

  SELECT n.nspname INTO v_crypto_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'crypt'
    AND pg_get_function_identity_arguments(p.oid) = 'text, text'
  ORDER BY CASE n.nspname WHEN 'extensions' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 10))', v_crypto_schema, v_crypto_schema)
    USING v_admin_password INTO v_password_hash;

  -- ------------------------------------------------------------------
  -- 1) Usuário administrador (cria se não existir; nunca duplica)
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
  -- 2) Empresas do grupo (indústria raiz + Loja pelo CNPJ)
  -- ------------------------------------------------------------------
  SELECT id INTO v_zipo_id FROM public.companies
  WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '10312467000120'
  ORDER BY created_at LIMIT 1;

  IF v_zipo_id IS NULL THEN
    INSERT INTO public.companies (
      name, trade_name, cnpj, state_registration, segment, sub_segment,
      status, is_headquarters
    ) VALUES (
      'Zipo Confecções', 'Zipo Confecções', '10.312.467/0001-20',
      '90453753-55', 'apparel', 'Indústria de confecções', 'active', true
    ) RETURNING id INTO v_zipo_id;
  ELSE
    UPDATE public.companies
    SET name = 'Zipo Confecções', trade_name = 'Zipo Confecções',
        state_registration = '90453753-55', segment = 'apparel',
        sub_segment = 'Indústria de confecções', status = 'active',
        updated_at = now()
    WHERE id = v_zipo_id;
  END IF;

  SELECT id INTO v_loja_id FROM public.companies
  WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '57832353000175'
  ORDER BY created_at LIMIT 1;

  IF v_loja_id IS NULL THEN
    INSERT INTO public.companies (
      name, trade_name, cnpj, segment, sub_segment, status,
      is_headquarters, parent_company_id
    ) VALUES (
      'TEXAS FARM STORE LTDA - EPP', 'Texas Farm Store',
      '57.832.353/0001-75', 'apparel', 'Loja de varejo (vestuário)',
      'active', true, v_zipo_id
    ) RETURNING id INTO v_loja_id;
  ELSE
    UPDATE public.companies
    SET name = 'TEXAS FARM STORE LTDA - EPP', trade_name = 'Texas Farm Store',
        segment = 'apparel', sub_segment = 'Loja de varejo (vestuário)',
        status = 'active', parent_company_id = v_zipo_id, updated_at = now()
    WHERE id = v_loja_id;
  END IF;

  -- ------------------------------------------------------------------
  -- 3) Unidades: Matriz/CD da indústria; CD Loja e Loja da Loja
  -- ------------------------------------------------------------------
  SELECT id INTO v_zipo_br FROM public.branches
  WHERE company_id = v_zipo_id AND code = 'MATRIZ' ORDER BY created_at LIMIT 1;
  IF v_zipo_br IS NULL THEN
    INSERT INTO public.branches (
      company_id, name, code, cnpj, state_registration, tax_regime,
      is_headquarters, is_active, tipo, canal_padrao
    ) VALUES (
      v_zipo_id, 'Matriz/CD', 'MATRIZ', '10.312.467/0001-20', '90453753-55',
      'real', true, true, 'industria'::public.branch_tipo,
      'ATACADO_INDUSTRIA'::public.canal_operacional
    ) RETURNING id INTO v_zipo_br;
  END IF;

  SELECT id INTO v_loja_cd FROM public.branches
  WHERE company_id = v_loja_id AND code = 'CD' ORDER BY created_at LIMIT 1;
  IF v_loja_cd IS NULL THEN
    INSERT INTO public.branches (
      company_id, name, code, cnpj, tax_regime,
      is_headquarters, is_active, tipo, canal_padrao
    ) VALUES (
      v_loja_id, 'CD Loja', 'CD', '57.832.353/0001-75', 'real',
      false, true, 'cd'::public.branch_tipo,
      'ATACADO_INDUSTRIA'::public.canal_operacional
    ) RETURNING id INTO v_loja_cd;
  END IF;


  -- Alinha o canal do CD em instalações onde ele nasceu inconsistente.
  UPDATE public.branches
  SET canal_padrao = 'ATACADO_INDUSTRIA'::public.canal_operacional
  WHERE id = v_loja_cd
    AND canal_padrao IS DISTINCT FROM 'ATACADO_INDUSTRIA'::public.canal_operacional;

  SELECT id INTO v_loja_st FROM public.branches
  WHERE company_id = v_loja_id AND code = 'Loja' ORDER BY created_at LIMIT 1;
  IF v_loja_st IS NULL THEN
    INSERT INTO public.branches (
      company_id, name, code, cnpj, tax_regime,
      is_headquarters, is_active, tipo, canal_padrao
    ) VALUES (
      v_loja_id, 'Loja', 'Loja', '57.832.353/0001-75', 'real',
      true, true, 'filial'::public.branch_tipo,
      'VAREJO_PDV'::public.canal_operacional
    ) RETURNING id INTO v_loja_st;
  END IF;

  -- ------------------------------------------------------------------
  -- 4) Superadmin: perfil na indústria + papel admin nas DUAS empresas
  -- ------------------------------------------------------------------
  UPDATE public.profiles
  SET company_id = v_zipo_id, branch_id = v_zipo_br,
      default_branch_id = v_zipo_br, name = v_admin_name,
      email = v_admin_email, updated_at = now()
  WHERE id = v_user_id;

  -- Superadmin da plataforma + admin nas duas empresas (a unicidade de
  -- user_roles é por usuário+papel+empresa desde 20261022121000).
  INSERT INTO public.user_roles (user_id, role, company_id)
  SELECT v_user_id, 'system_admin'::public.app_role, v_zipo_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role = 'system_admin' AND ur.company_id = v_zipo_id
  );

  INSERT INTO public.user_roles (user_id, role, company_id)
  SELECT v_user_id, 'admin'::public.app_role, c
  FROM (VALUES (v_zipo_id), (v_loja_id)) AS x(c)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role = 'admin' AND ur.company_id = x.c
  );

  -- ------------------------------------------------------------------
  -- 5) Assinatura ativa nas duas empresas (base p/ aplicar o nicho)
  -- ------------------------------------------------------------------
  SELECT modules INTO v_modules FROM public.niche_packages WHERE segment = 'apparel';

  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'enterprise' LIMIT 1;
  IF v_plan_id IS NULL THEN
    INSERT INTO public.plans (
      name, slug, description, price_monthly, price_annual, trial_days,
      max_users, max_orders_month, storage_mb, allowed_modules, is_active,
      sort_order, max_companies, max_branches, nfe_per_month, ai_calls_per_month
    ) VALUES (
      'Enterprise', 'enterprise', 'Plano completo', 0, 0, 0,
      9999, 999999, 102400, v_modules, true, 4, 99, 999, 999999, 999999
    ) RETURNING id INTO v_plan_id;
    INSERT INTO public.plan_modules (plan_id, module_key, enabled)
    SELECT v_plan_id, module_key, true FROM unnest(v_modules) AS module_key
    ON CONFLICT (plan_id, module_key) DO UPDATE SET enabled = true;
  END IF;

  INSERT INTO public.subscriptions (
    company_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, trial_end,
    cancelled_at, cancel_at_period_end
  )
  SELECT c, v_plan_id, 'active', 'annual', now(),
         '2099-12-31 23:59:59+00', NULL, NULL, false
  FROM (VALUES (v_zipo_id), (v_loja_id)) AS x(c)
  ON CONFLICT (company_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id, status = 'active',
      current_period_end = '2099-12-31 23:59:59+00', updated_at = now();

  -- ------------------------------------------------------------------
  -- 6) Nicho OFICIAL: o sistema se molda à empresa (apparel = Confecção)
  -- ------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated',
                      'email', v_admin_email)::text, true);

  PERFORM public.set_company_niche(v_zipo_id, 'apparel', ARRAY['apparel']);
  PERFORM public.set_company_niche(v_loja_id, 'apparel', ARRAY['apparel']);

  -- ------------------------------------------------------------------
  -- 7) Permissões: admin com tudo nas duas empresas
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
    ('production.quality', 'read', 'producao', 'Visualizar qualidade'),
    ('production.quality', 'write', 'producao', 'Operar qualidade')
  ON CONFLICT (resource, action) DO UPDATE
  SET module_key = EXCLUDED.module_key, description = EXCLUDED.description;

  INSERT INTO public.role_permissions (role, permission_id)
  SELECT 'admin'::public.app_role, id FROM public.permissions
  ON CONFLICT (role, permission_id) DO NOTHING;

  INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted, created_by)
  SELECT v_user_id, c, p.id, true, v_user_id
  FROM public.permissions p
  CROSS JOIN (VALUES (v_zipo_id), (v_loja_id)) AS x(c)
  ON CONFLICT (user_id, company_id, permission_id) DO UPDATE SET granted = true;

  -- ------------------------------------------------------------------
  -- 8) Catálogo vestuário (mesmos SKUs nas 2 empresas — casa no grupo),
  --    Lotes de abertura cadastrados; os SALDOS de abertura ficam por
--    unidade/canal (lot_id nulo), que é a linha que o ledger ajusta nos
--    movimentos sem lote (transferências, perdas, contagens).
  -- ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('CAMISETA-TF-001',   'Camiseta Estampada Texas Farm',        600, 150, 20, 60, 25),
      ('BONE-TF-001',       'Boné Texas Farm Aba Curva',            250,  60,  8, 30, 18),
      ('CAMISA-XADREZ-001', 'Camisa Xadrez Country Manga Longa',    300,  80, 12, 30, 45),
      ('CALCA-JEANS-001',   'Calça Jeans Country',                  180,  40,  5, 20, 60)
    ) AS v(code, nome, q_zipo, q_cd, q_Loja, minimo, custo)
  LOOP
    -- produtos nas duas empresas
    INSERT INTO public.products (company_id, code, name, type, unit, item_kind)
    SELECT c, r.code, r.nome, 'finished', 'un', 'acabado'
    FROM (VALUES (v_zipo_id), (v_loja_id)) AS x(c)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.company_id = x.c AND p.code = r.code
    );

    -- lotes + saldo na Matriz/CD da indústria
    INSERT INTO public.stock_lots (
      company_id, product_id, product_code, product_name, lot_number,
      quantity, remaining_qty, status, quality_status, unit_cost
    )
    SELECT v_zipo_id, p.id, p.code, p.name, 'ZIPO-' || r.code || '-001',
           r.q_zipo, r.q_zipo, 'available', 'approved', r.custo
    FROM public.products p
    WHERE p.company_id = v_zipo_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_lots l
                      WHERE l.company_id = v_zipo_id
                        AND l.lot_number = 'ZIPO-' || r.code || '-001');

    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_zipo_id, l.product_id, NULL, v_zipo_br, 'ATACADO_INDUSTRIA',
           l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
    WHERE l.company_id = v_zipo_id AND l.lot_number = 'ZIPO-' || r.code || '-001'
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_zipo_id AND b.lot_id = l.id);

    -- lotes + saldo no CD Loja
    INSERT INTO public.stock_lots (
      company_id, product_id, product_code, product_name, lot_number,
      quantity, remaining_qty, status, quality_status, unit_cost
    )
    SELECT v_loja_id, p.id, p.code, p.name, 'CDTF-' || r.code || '-001',
           r.q_cd, r.q_cd, 'available', 'approved', r.custo
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_lots l
                      WHERE l.company_id = v_loja_id
                        AND l.lot_number = 'CDTF-' || r.code || '-001');

    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_loja_id, l.product_id, NULL, v_loja_cd, 'VAREJO_PDV',
           l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
    WHERE l.company_id = v_loja_id AND l.lot_number = 'CDTF-' || r.code || '-001'
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_loja_id AND b.lot_id = l.id);

    -- lotes + saldo na Loja (abaixo do mínimo de propósito)
    INSERT INTO public.stock_lots (
      company_id, product_id, product_code, product_name, lot_number,
      quantity, remaining_qty, status, quality_status, unit_cost
    )
    SELECT v_loja_id, p.id, p.code, p.name, 'TF-' || r.code || '-001',
           r.q_Loja, r.q_Loja, 'available', 'approved', r.custo
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.stock_lots l
                      WHERE l.company_id = v_loja_id
                        AND l.lot_number = 'TF-' || r.code || '-001');

    INSERT INTO public.stock_balances (
      company_id, product_id, lot_id, branch_id, canal_operacional,
      product_code, product_name, quantity, reserved_qty
    )
    SELECT v_loja_id, l.product_id, NULL, v_loja_st, 'VAREJO_PDV',
           l.product_code, l.product_name, l.remaining_qty, 0
    FROM public.stock_lots l
    WHERE l.company_id = v_loja_id AND l.lot_number = 'TF-' || r.code || '-001'
      AND NOT EXISTS (SELECT 1 FROM public.stock_balances b
                      WHERE b.company_id = v_loja_id AND b.lot_id = l.id);

    -- política de reposição da Loja (o motor passa a sugerir)
    INSERT INTO public.replenishment_policies (
      company_id, branch_id, product_id, min_stock, max_stock,
      lead_time_days, is_active
    )
    SELECT v_loja_id, v_loja_st, p.id, r.minimo, r.minimo * 3, 7, true
    FROM public.products p
    WHERE p.company_id = v_loja_id AND p.code = r.code
      AND NOT EXISTS (SELECT 1 FROM public.replenishment_policies rp
                      WHERE rp.branch_id = v_loja_st AND rp.product_id = p.id);
  END LOOP;

  -- ------------------------------------------------------------------
  -- 9) Autoverificação (qualquer falha desfaz o cadastro inteiro)
  -- ------------------------------------------------------------------
  IF (SELECT parent_company_id FROM public.companies WHERE id = v_loja_id) <> v_zipo_id THEN
    RAISE EXCEPTION 'Verificacao falhou: Loja nao esta ligada a industria no grupo';
  END IF;
  IF (SELECT segment FROM public.companies WHERE id = v_zipo_id) <> 'apparel'
     OR (SELECT segment FROM public.companies WHERE id = v_loja_id) <> 'apparel' THEN
    RAISE EXCEPTION 'Verificacao falhou: nicho apparel nao aplicado';
  END IF;
  IF (SELECT count(*) FROM public.user_roles
      WHERE user_id = v_user_id AND role = 'admin'
        AND company_id IN (v_zipo_id, v_loja_id)) <> 2 THEN
    RAISE EXCEPTION 'Verificacao falhou: admin nao esta nas duas empresas';
  END IF;
  IF (SELECT COALESCE(sum(quantity), 0) FROM public.stock_balances
      WHERE company_id = v_zipo_id AND branch_id = v_zipo_br) <= 0 THEN
    RAISE EXCEPTION 'Verificacao falhou: industria sem estoque inicial';
  END IF;
  IF (SELECT count(*) FROM public.replenishment_policies
      WHERE company_id = v_loja_id AND branch_id = v_loja_st) < 4 THEN
    RAISE EXCEPTION 'Verificacao falhou: politicas da Loja nao criadas';
  END IF;

  RAISE NOTICE 'GRUPO_ZIPO_CADASTRADO industria=% Loja=% admin=%',
    v_zipo_id, v_loja_id, v_admin_email;
END
$seed$;

COMMIT;
