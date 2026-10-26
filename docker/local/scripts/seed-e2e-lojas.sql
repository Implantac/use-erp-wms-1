-- ============================================================================
-- USE ERP (local) — usuários de homologação da jornada E2E das lojas
--
-- Rode DEPOIS de PREPARAR-GRUPO-ZIPO.bat e PREPARAR-LOJAS-TEXAS.bat
-- (preparar-e2e-lojas.ps1 chama este arquivo). Idempotente: recria/atualiza
-- os dois usuários de TESTE abaixo com senhas conhecidas — ambiente local
-- de homologação apenas, nunca produção.
--
--   loja@texasfarm.example.com  / E2eLoja@2026    (operador da Loja — pede)
--   gestor@zipo.example.com / E2eGestor@2026  (admin do grupo — decide/expede)
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_crypto_schema text;
  v_zipo uuid; v_texas uuid;
  v_zipo_br uuid; v_cd uuid; v_Loja uuid;
  rec record;
  v_user_id uuid;
  v_hash text;
BEGIN
  SELECT id INTO v_zipo FROM public.companies
  WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '10312467000120'
  ORDER BY created_at LIMIT 1;
  SELECT id INTO v_texas FROM public.companies
  WHERE regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') = '57832353000175'
  ORDER BY created_at LIMIT 1;
  IF v_zipo IS NULL OR v_texas IS NULL THEN
    RAISE EXCEPTION 'Grupo Zipo/Texas nao encontrado — rode PREPARAR-GRUPO-ZIPO.bat antes.';
  END IF;

  SELECT id INTO v_zipo_br FROM public.branches WHERE company_id = v_zipo ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cd FROM public.branches WHERE company_id = v_texas AND code = 'CD' LIMIT 1;
  SELECT id INTO v_Loja FROM public.branches WHERE company_id = v_texas AND code = 'Loja' LIMIT 1;
  IF v_zipo_br IS NULL OR v_cd IS NULL OR v_Loja IS NULL THEN
    RAISE EXCEPTION 'Unidades incompletas (Zipo/CD/Loja) — rode PREPARAR-LOJAS-TEXAS.bat antes.';
  END IF;

  SELECT n.nspname INTO v_crypto_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'crypt' AND pg_get_function_identity_arguments(p.oid) = 'text, text'
  ORDER BY CASE n.nspname WHEN 'extensions' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
  LIMIT 1;
  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'Extensao pgcrypto nao encontrada (funcao crypt ausente).';
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('loja@texasfarm.example.com', 'E2eLoja@2026', 'Operador Loja (E2E)', v_texas, v_Loja),
      ('gestor@zipo.example.com', 'E2eGestor@2026', 'Gestor do Grupo (E2E)', v_zipo, v_zipo_br)
    ) AS t(email, senha, nome, empresa, unidade)
  LOOP
    EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 10))', v_crypto_schema, v_crypto_schema)
      USING rec.senha INTO v_hash;

    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = rec.email ORDER BY created_at LIMIT 1;
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
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        rec.email, v_hash, now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('name', rec.nome),
        false, false, now(), now(), '', '', '', '', '', '', '', '', ''
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = v_hash,
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          deleted_at = NULL, banned_until = NULL, updated_at = now()
      WHERE id = v_user_id;
    END IF;

    DELETE FROM auth.identities WHERE user_id = v_user_id AND provider = 'email';
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', rec.email, 'email_verified', true, 'phone_verified', false),
      'email', v_user_id::text, now(), now(), now()
    );

    INSERT INTO public.profiles (id, name, email, company_id, branch_id, default_branch_id)
    VALUES (v_user_id, rec.nome, rec.email, rec.empresa, rec.unidade, rec.unidade)
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, email = EXCLUDED.email,
        company_id = EXCLUDED.company_id, branch_id = EXCLUDED.branch_id,
        default_branch_id = EXCLUDED.default_branch_id, updated_at = now();

    RAISE NOTICE 'E2E user pronto: %', rec.email;
  END LOOP;

  -- Papéis: operador da Loja na empresa da Loja; gestor admin nas duas.
  INSERT INTO public.user_roles (user_id, role, company_id)
  SELECT u.id, 'operator'::public.app_role, v_texas FROM auth.users u WHERE lower(u.email) = 'loja@texasfarm.example.com'
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, company_id)
  SELECT u.id, 'admin'::public.app_role, c FROM auth.users u
  JOIN (VALUES (v_zipo), (v_texas)) AS x(c) ON true
  WHERE lower(u.email) = 'gestor@zipo.example.com'
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;
