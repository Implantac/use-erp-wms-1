-- Papel por empresa de verdade: a UNIQUE (user_id, role) nasceu antes dos
-- grupos multi-CNPJ e impedia o mesmo gestor de ser admin/manager em duas
-- empresas — embora as RPCs do grupo e do fluxo de lojas já consultem
-- user_roles escopado por company_id. A unicidade passa a ser por
-- (usuário, papel, empresa). Reversível (recriar a constraint antiga).

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_role_company_key
  UNIQUE (user_id, role, company_id);

COMMENT ON CONSTRAINT user_roles_user_role_company_key ON public.user_roles IS
  'Um usuário pode ter o mesmo papel em várias empresas (grupos multi-CNPJ).';
