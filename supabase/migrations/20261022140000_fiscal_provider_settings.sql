-- ============================================================================
-- Configuração do provedor fiscal por empresa (SEM emissão)
--
-- Prepara o terreno da homologação: registra provedor escolhido, ambiente,
-- validade do certificado e CSC — mas NÃO emite nada. A emissão continua
-- bloqueada até a homologação SEFAZ/provedor ser concluída e comprovada.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'nao_definido'
    CHECK (provider IN ('nao_definido', 'focus_nfe', 'nfe_io', 'plugnotas', 'proprio')),
  environment text NOT NULL DEFAULT 'homologacao'
    CHECK (environment IN ('homologacao', 'producao')),
  certificate_expires_at date,
  csc_configured boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_provider_settings_rw ON public.fiscal_provider_settings;
CREATE POLICY fiscal_provider_settings_rw ON public.fiscal_provider_settings
  FOR ALL TO authenticated
  USING (
    public.is_system_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id = fiscal_provider_settings.company_id
    )
  )
  WITH CHECK (
    public.is_system_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.company_id = fiscal_provider_settings.company_id
    )
  );
