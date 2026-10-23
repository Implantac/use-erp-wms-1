-- ============================================================================
-- Fiscal self-service: o CLIENTE configura sem suporte especializado
--
-- Cada empresa tem seu provedor e seu certificado. Esta migration adiciona:
-- 1) checklist de homologação + referência da empresa no provedor;
-- 2) cofre do token do provedor (fiscal_provider_secrets): NENHUM usuário
--    lê o token — grava via RPC (write-only) e só o worker (service_role)
--    lê para transmitir;
-- 3) claim_fiscal_jobs: o worker reivindica jobs 'queued' sem corrida.
-- ============================================================================

ALTER TABLE public.fiscal_provider_settings
  ADD COLUMN IF NOT EXISTS homologation_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_company_ref text;

CREATE TABLE IF NOT EXISTS public.fiscal_provider_secrets (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  token text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_provider_secrets ENABLE ROW LEVEL SECURITY;
-- Sem políticas para authenticated: ninguém lê o token pela API.
REVOKE ALL ON public.fiscal_provider_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fiscal_provider_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.set_fiscal_provider_token(
  p_company_id uuid,
  p_token text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    public.is_system_admin(auth.uid())
    OR p_company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = p_company_id)
  ) THEN
    RAISE EXCEPTION 'sem acesso a esta empresa' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'token vazio';
  END IF;
  INSERT INTO public.fiscal_provider_secrets (company_id, token, updated_by, updated_at)
  VALUES (p_company_id, btrim(p_token), auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE
    SET token = EXCLUDED.token, updated_by = EXCLUDED.updated_by, updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.set_fiscal_provider_token(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_fiscal_provider_token(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    public.is_system_admin(auth.uid())
    OR p_company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.company_id = p_company_id)
  ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.fiscal_provider_secrets WHERE company_id = p_company_id);
END $$;
GRANT EXECUTE ON FUNCTION public.has_fiscal_provider_token(uuid) TO authenticated;

-- Worker do provedor: reivindica jobs queued (um por vez por linha, sem corrida).
CREATE OR REPLACE FUNCTION public.claim_fiscal_jobs(p_limit int DEFAULT 10)
RETURNS SETOF public.fiscal_emission_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.fiscal_emission_jobs j
     SET status = 'processing', attempt_count = attempt_count + 1
   WHERE j.id IN (
     SELECT id FROM public.fiscal_emission_jobs
      WHERE status = 'queued' ORDER BY queued_at LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_fiscal_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_jobs(int) TO service_role;
