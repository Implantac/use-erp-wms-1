-- READ-ONLY pre-production check; run with a privileged DB operator on a TEST COPY.
-- The historical migrations granted access to a named support account and
-- modified the shared enterprise plan. Do not delete users or subscriptions
-- automatically: confirm ownership and approved support policy first.
DO $$
DECLARE
  v_user_id uuid;
  v_role_count integer;
  v_subscription_count integer;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'etcsuporte889@gmail.com';
  IF v_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_role_count FROM public.user_roles
      WHERE user_id = v_user_id AND role = 'admin';
    SELECT count(*) INTO v_subscription_count FROM public.subscriptions s
      JOIN public.profiles p ON p.company_id = s.company_id
      WHERE p.id = v_user_id AND s.current_period_end >= '2099-01-01'::timestamptz;
    RAISE EXCEPTION 'REVISÃO OBRIGATÓRIA: conta histórica de suporte presente (admin roles %, assinaturas longas %). Inventarie permissões antes da implantação.', v_role_count, v_subscription_count;
  END IF;
  RAISE NOTICE 'Conta histórica de suporte não encontrada; ainda revisar plano enterprise e outros privilégios manualmente.';
END $$;
