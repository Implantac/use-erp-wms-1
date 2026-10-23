-- ============================================================================
-- USE ERP (local) — BASELINE pré-migrations. NÃO é uma migration do projeto.
--
-- Por quê isto existe:
--   O histórico em supabase/migrations COMEÇA presumindo objetos que na nuvem
--   de origem foram criados fora das migrations (o template inicial de
--   autenticação/RBAC): o enum public.app_role, a tabela public.user_roles e
--   a função public.has_role(uuid, app_role). Sem eles, um banco vazio —
--   local OU um projeto Supabase novo — para na migration
--   20260309001236 (ALTER TABLE public.user_roles ... "relation does not exist").
--   A prova está no próprio repositório: nenhuma das migrations cria
--   esses objetos, mas dezenas os usam desde o início; os valores/papéis
--   abaixo são os que as migrations posteriores presumem (admin/manager/
--   operator/viewer — os demais papéis são adicionados pelas migrations
--   20260605020638, 20260628234502 e 20260721141727).
--
-- Segurança/idempotência:
--   - Tudo é "IF NOT EXISTS" / CREATE OR REPLACE: se o objeto já existir
--     (ex.: banco restaurado de backup), este script não altera nada.
--   - As migrations seguintes substituem has_role por versões com escopo
--     de empresa (20260624095822, 20260625122103...), como na nuvem.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operator', 'viewer');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
