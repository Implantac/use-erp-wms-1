-- Official RTC cCredPres catalog metadata. No codes or rates are seeded here:
-- a source-controlled import approved from the current official table is required.
-- Version windows distinguish table publication from per-tax credit validity.
CREATE TABLE IF NOT EXISTS public.rtc_presumed_credit_catalog (
  version text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[0-9]{2}$'),
  description text NOT NULL,
  legal_basis text NOT NULL,
  source_url text NOT NULL,
  version_valid_from date NOT NULL,
  version_valid_until date,
  cbs_valid_from date,
  cbs_valid_until date,
  ibs_valid_from date,
  ibs_valid_until date,
  allow_nfe boolean NOT NULL,
  allow_nfce boolean NOT NULL,
  allow_cte boolean NOT NULL,
  allow_nfse boolean NOT NULL,
  appropriation_via_invoice boolean NOT NULL,
  appropriation_via_event boolean NOT NULL,
  allow_cbs_group boolean NOT NULL,
  allow_ibs_group boolean NOT NULL,
  deduct_from_item_tax boolean NOT NULL,
  requires_payment_declaration boolean NOT NULL,
  reference_classification text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, code),
  CONSTRAINT rtc_credit_version_window CHECK (version_valid_until IS NULL OR version_valid_until >= version_valid_from),
  CONSTRAINT rtc_credit_cbs_window CHECK (cbs_valid_until IS NULL OR cbs_valid_from IS NOT NULL AND cbs_valid_until >= cbs_valid_from),
  CONSTRAINT rtc_credit_ibs_window CHECK (ibs_valid_until IS NULL OR ibs_valid_from IS NOT NULL AND ibs_valid_until >= ibs_valid_from)
);

ALTER TABLE public.rtc_presumed_credit_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rtc_presumed_credit_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rtc_presumed_credit_catalog TO authenticated;
GRANT ALL ON public.rtc_presumed_credit_catalog TO service_role;

CREATE POLICY rtc_presumed_credit_catalog_read ON public.rtc_presumed_credit_catalog
  FOR SELECT TO authenticated USING (true);
-- Only service_role may import/replace an audited official version.
CREATE POLICY rtc_presumed_credit_catalog_service ON public.rtc_presumed_credit_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);
