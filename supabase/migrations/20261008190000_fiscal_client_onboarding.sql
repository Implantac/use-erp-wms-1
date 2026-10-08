-- Per-tenant fiscal onboarding and coverage inventory. Metadata only: no rate
-- defaults, automatic entitlement, XML release, or production activation.
CREATE TABLE public.fiscal_client_setup (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_regime text NOT NULL CHECK (length(trim(tax_regime)) > 0),
  responsible_name text NOT NULL CHECK (length(trim(responsible_name)) > 0),
  responsible_registration text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fiscal_operation_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.fiscal_client_setup(company_id) ON DELETE CASCADE,
  document_model text NOT NULL CHECK (document_model IN ('NFE','NFCE','NFSE','CTE','CTEOS','MDFE','BPE','NF3E','NFCOM','NFAG','NFGAS','NFEABI','OTHER')),
  operation_kind text NOT NULL CHECK (length(trim(operation_kind)) > 0),
  cfop text CHECK (cfop IS NULL OR cfop ~ '^[1-7][0-9]{3}$'),
  ncm text CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$'),
  nbs text,
  origin_uf text CHECK (origin_uf IS NULL OR origin_uf ~ '^[A-Z]{2}$'),
  destination_uf text CHECK (destination_uf IS NULL OR destination_uf ~ '^[A-Z]{2}$'),
  tax_regime text NOT NULL CHECK (length(trim(tax_regime)) > 0),
  valid_from date NOT NULL,
  valid_until date,
  source_reference text NOT NULL CHECK (length(trim(source_reference)) > 0),
  classification_reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','homologated','suspended')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_coverage_window CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT fiscal_coverage_approval CHECK (status <> 'homologated' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX fiscal_coverage_lookup ON public.fiscal_operation_coverage(company_id, document_model, tax_regime, cfop, valid_from);

ALTER TABLE public.fiscal_client_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_operation_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_client_setup, public.fiscal_operation_coverage FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_client_setup, public.fiscal_operation_coverage TO authenticated;
GRANT ALL ON public.fiscal_client_setup, public.fiscal_operation_coverage TO service_role;

CREATE POLICY fiscal_setup_read ON public.fiscal_client_setup FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY fiscal_setup_insert ON public.fiscal_client_setup FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)));
CREATE POLICY fiscal_setup_update ON public.fiscal_client_setup FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)));
CREATE POLICY fiscal_coverage_read ON public.fiscal_operation_coverage FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY fiscal_coverage_insert ON public.fiscal_operation_coverage FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND status = 'draft' AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)));
CREATE POLICY fiscal_coverage_update ON public.fiscal_operation_coverage FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND status IN ('draft','reviewed','suspended') AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND status <> 'homologated' AND
    (public.has_role(auth.uid(),'admin'::app_role,company_id) OR public.has_role(auth.uid(),'manager'::app_role,company_id)));
-- No DELETE: retain audit history. Approval metadata is not fiscal authorization.
