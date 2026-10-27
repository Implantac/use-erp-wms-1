-- Contexto multiempresa de verdade para grupos:
-- 1) my_companies(): as empresas que o usuário pode abrir — a do perfil,
--    as em que tem papel (user_roles) e, para o system_admin, todas. A
--    leitura direta de public.companies continua escopada pela RLS (a RPC
--    é SECURITY DEFINER e só devolve empresas do próprio usuário).
-- 2) switch_active_company(uuid): troca a empresa ativa NO SERVIDOR
--    (profiles.company_id + unidade matriz), para a RLS acompanhar a tela.
--    Sem papel na empresa alvo (e sem ser system_admin), nega com 42501.

CREATE OR REPLACE FUNCTION public.my_companies()
RETURNS SETOF public.companies
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.*
  FROM public.companies c
  WHERE public.is_system_admin(auth.uid())
     OR c.id = public.get_user_company_id(auth.uid())
     OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.company_id = c.id
     )
  ORDER BY (c.parent_company_id IS NOT NULL), c.name;
$$;

REVOKE ALL ON FUNCTION public.my_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_companies() TO authenticated;

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
