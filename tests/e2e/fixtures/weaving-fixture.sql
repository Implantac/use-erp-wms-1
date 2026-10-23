-- ============================================================================
-- Fixture de homologação E2E — PCP de Tecelagem (empresa isolada de teste)
--
-- Cria, de forma idempotente, TUDO que tests/e2e/textile-weaving-pcp.spec.ts
-- precisa para rodar contra a stack local já migrada (459 migrations):
--   empresa de homologação + usuário de teste (Auth) + artigo/BOM/roteiro
--   ativos + lote de fio liberado com saldo.
--
-- NÃO rode em ambiente operacional: cria empresa e usuário de homologação.
--
-- Uso (na raiz do repositório, stack local no ar):
--   docker compose -f docker-compose.local.yml --env-file .env.local exec -T db \
--     psql -U supabase_admin -d postgres \
--     -v e2e_email=e2e.tecelagem@example.com -v e2e_password='TroqueEstaSenha1' \
--     < tests/e2e/fixtures/weaving-fixture.sql
-- Sem -v, usa e2e.tecelagem@example.com / E2eHomologacao!2026 (só homologação).
--
-- Ao final ele imprime os IDs para montar as variáveis da spec:
--   E2E_WEAVING_EMAIL, E2E_WEAVING_PASSWORD,
--   E2E_WEAVING_PRODUCT_ID, E2E_WEAVING_COMPONENT_ID, E2E_WEAVING_LOT_ID
-- ============================================================================

\set ON_ERROR_STOP on

\if :{?e2e_email}
\else
  \set e2e_email 'e2e.tecelagem@example.com'
\endif
\if :{?e2e_password}
\else
  \set e2e_password 'E2eHomologacao!2026'
\endif

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Sinalizadores aceitos pelas guardas locais (mesmo padrão do seed-bil.sql):
-- este cadastro é administrativo (SQL local), não um UPDATE pela API.
SELECT set_config('app.allow_tenant_link', 'on', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  v_email text := lower(trim(:'e2e_email'));
  v_password text := :'e2e_password';
  v_crypto_schema text;
  v_password_hash text;
  v_user_id uuid;
  v_company_id uuid := 'e2000000-0000-4000-8000-000000000001';
  v_product_id uuid := 'e2000000-0000-4000-8000-000000000010';  -- tecido (artigo)
  v_component_id uuid := 'e2000000-0000-4000-8000-000000000011'; -- fio 30 (componente)
  v_route_id uuid := 'e2000000-0000-4000-8000-000000000020';
  v_lot_id uuid := 'e2000000-0000-4000-8000-000000000030';
  v_existing uuid;
BEGIN
  IF v_email = '' OR v_email NOT LIKE '%@%' THEN
    RAISE EXCEPTION 'e2e_email invalido: %', v_email;
  END IF;
  IF length(coalesce(v_password, '')) < 6 THEN
    RAISE EXCEPTION 'e2e_password deve ter ao menos 6 caracteres';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regclass('public.production_orders') IS NULL THEN
    RAISE EXCEPTION 'Banco incompleto: aplique as migrations (servico migrate) antes da fixture.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_textile_production_order') THEN
    RAISE EXCEPTION 'RPC create_textile_production_order ausente: migrations industriais nao aplicadas.';
  END IF;

  SELECT n.nspname INTO v_crypto_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'crypt' AND pg_get_function_identity_arguments(p.oid) = 'text, text'
  ORDER BY CASE n.nspname WHEN 'extensions' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 10))', v_crypto_schema, v_crypto_schema)
    USING v_password INTO v_password_hash;

  -- ------------------------------------------------------------------
  -- 1) Empresa de homologação (isolada da BIL e de qualquer operação real)
  -- ------------------------------------------------------------------
  SELECT id INTO v_existing FROM public.companies WHERE cnpj = '40111222000199' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    v_company_id := v_existing;
  ELSE
    INSERT INTO public.companies (id, name, trade_name, cnpj, segment)
    VALUES (v_company_id, 'E2E Homologação Têxtil LTDA', 'E2E Têxtil', '40111222000199', 'textil')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------
  -- 2) Usuário de teste (Auth) + profile vinculado + papel de gerente
  -- ------------------------------------------------------------------
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email ORDER BY created_at LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, v_password_hash, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', 'E2E Tecelagem'),
      false, false, now(), now()
    );
  ELSE
    UPDATE auth.users
       SET encrypted_password = v_password_hash,
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           deleted_at = NULL, banned_until = NULL, updated_at = now()
     WHERE id = v_user_id;
  END IF;

  DELETE FROM auth.identities WHERE user_id = v_user_id AND provider = 'email';
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', v_user_id::text, now(), now(), now());

  INSERT INTO public.profiles (id, name, email)
  VALUES (v_user_id, 'E2E Tecelagem', v_email)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = now();

  -- Vínculo com a empresa DEPOIS do profile existir (padrão do seed-bil).
  UPDATE public.profiles SET company_id = v_company_id, updated_at = now() WHERE id = v_user_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (v_user_id, 'manager', v_company_id)
  ON CONFLICT DO NOTHING;

  -- ------------------------------------------------------------------
  -- 3) Artigo, componente, operações, roteiro e BOM (empresa de homologação)
  -- ------------------------------------------------------------------
  INSERT INTO public.products (id, company_id, code, name, type, unit, item_kind, cost_price, sale_price, min_stock, max_stock, reorder_point, lead_time_days, status)
  VALUES
    (v_product_id, v_company_id, 'E2E-TECIDO', 'Tecido E2E Homologação', 'finished', 'm', 'acabado', 0, 0, 0, 0, 0, 0, 'active'),
    (v_component_id, v_company_id, 'E2E-FIO-30', 'Fio 30 E2E Homologação', 'raw_material', 'kg', 'materia_prima', 12, 0, 0, 0, 0, 0, 'active')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name = EXCLUDED.name, status = 'active', updated_at = now();

  INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector, is_active)
  SELECT v_company_id, 'Urdimento', 'E2E-URD', 1, 20, 'Tecelagem', true
   WHERE NOT EXISTS (SELECT 1 FROM public.production_steps WHERE company_id = v_company_id AND name = 'Urdimento');
  INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector, is_active)
  SELECT v_company_id, 'Tecelagem', 'E2E-TEC', 2, 30, 'Tecelagem', true
   WHERE NOT EXISTS (SELECT 1 FROM public.production_steps WHERE company_id = v_company_id AND name = 'Tecelagem');

  -- Sem UPDATE em reexecução: rota vinculada a OP é congelada pela governança.
  INSERT INTO public.production_routes (id, company_id, code, product_id, version, is_active, total_time_minutes)
  VALUES (v_route_id, v_company_id, 'ROT-E2E-TECIDO', v_product_id, '1.0', true, 50)
  ON CONFLICT (id) DO NOTHING;

  -- Roteiro já vinculado a OP é congelado (trigger de governança): só
  -- (re)cria as etapas enquanto nenhuma OP usa esta rota.
  IF NOT EXISTS (SELECT 1 FROM public.production_orders WHERE route_id = v_route_id) THEN
    DELETE FROM public.production_route_steps WHERE route_id = v_route_id;
    INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
    VALUES (v_route_id, v_company_id, 1, 'Urdimento', 20),
           (v_route_id, v_company_id, 2, 'Tecelagem', 30);
  END IF;

  DELETE FROM public.production_bom WHERE company_id = v_company_id AND product_id = v_product_id AND component_id = v_component_id;
  INSERT INTO public.production_bom (company_id, product_id, component_id, quantity, waste_percentage)
  VALUES (v_company_id, v_product_id, v_component_id, 0.22, 5);

  -- ------------------------------------------------------------------
  -- 4) Lote de fio liberado + saldo (reabastecido a cada execução da fixture)
  --    Consumo por run da spec: 10 m x 0,22 kg/m x 1,05 = 2,31 kg.
  -- ------------------------------------------------------------------
  -- Lote generoso para homologação (consumo por run da spec: 2,31 kg).
  -- stock_balances é imutável (trigger): nada de DELETE/UPDATE de saldo aqui;
  -- o saldo é inserido uma única vez, se ainda não existir para o lote.
  INSERT INTO public.stock_lots (id, company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, initial_quantity, unit_cost, origin, origin_type, status, quality_status)
  VALUES (v_lot_id, v_company_id, v_component_id, 'E2E-FIO-30', 'Fio 30 E2E Homologação', 'E2E-FIO-LOTE-001', 5000, 5000, 5000, 12, 'Compra homologação', 'COMPRA', 'available', 'approved')
  ON CONFLICT (id) DO UPDATE
     SET status = 'available', quality_status = 'approved', updated_at = now();

  INSERT INTO public.stock_balances (company_id, product_id, product_code, product_name, lot_id, lot_number, quantity, reserved_qty, stock_status, canal_operacional, branch_id, unit)
  SELECT v_company_id, v_component_id, 'E2E-FIO-30', 'Fio 30 E2E Homologação', v_lot_id, 'E2E-FIO-LOTE-001', 5000, 0, 'available', 'ATACADO_INDUSTRIA', NULL, 'kg'
   WHERE NOT EXISTS (
     SELECT 1 FROM public.stock_balances
      WHERE company_id = v_company_id AND product_id = v_component_id AND lot_id = v_lot_id);

  RAISE NOTICE 'Fixture E2E tecelagem pronta. Empresa=% Usuario=%', v_company_id, v_user_id;
  RAISE NOTICE 'E2E_WEAVING_PRODUCT_ID=%', v_product_id;
  RAISE NOTICE 'E2E_WEAVING_COMPONENT_ID=%', v_component_id;
  RAISE NOTICE 'E2E_WEAVING_LOT_ID=%', v_lot_id;
END $$;

COMMIT;

-- Conferência rápida do que a spec vai enxergar
SELECT 'company' AS item, id::text AS valor FROM public.companies WHERE cnpj = '40111222000199'
UNION ALL SELECT 'product', id::text FROM public.products WHERE code = 'E2E-TECIDO'
UNION ALL SELECT 'component', id::text FROM public.products WHERE code = 'E2E-FIO-30'
UNION ALL SELECT 'lot', id::text FROM public.stock_lots WHERE lot_number = 'E2E-FIO-LOTE-001';
