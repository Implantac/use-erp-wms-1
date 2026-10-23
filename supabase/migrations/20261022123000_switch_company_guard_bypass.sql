-- switch_active_company: atravessa as guardas de profiles pelo caminho
-- oficial (sinalizador transacional app.allow_tenant_link, o mesmo do
-- bootstrap_tenant). As guardas de tenant (trg_prevent_profile_*_change)
-- barram a troca de company_id por UPDATE comum; dentro desta RPC a troca
-- já foi autorizada (papel na empresa alvo ou system_admin), então o
-- sinalizador é ligado só nesta transação e morre com ela.

CREATE OR REPLACE FUNCTION public.switch_active_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_branch uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_system_admin(v_user)
    OR p_company_id = public.get_user_company_id(v_user)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_user AND ur.company_id = p_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Empresa não autorizada para este usuário'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_branch
  FROM public.branches
  WHERE company_id = p_company_id AND is_active
  ORDER BY is_headquarters DESC, created_at
  LIMIT 1;

  -- Caminho oficial pelas guardas de tenant (só nesta transação).
  PERFORM set_config('app.allow_tenant_link', 'on', true);

  UPDATE public.profiles
  SET company_id = p_company_id,
      branch_id = v_branch,
      default_branch_id = v_branch,
      updated_at = now()
  WHERE id = v_user;

  RETURN jsonb_build_object('company_id', p_company_id, 'branch_id', v_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.switch_active_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_active_company(uuid) TO authenticated;
