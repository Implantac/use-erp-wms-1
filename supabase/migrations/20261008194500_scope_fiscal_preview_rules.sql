-- Existing fiscal_tax_rules were created without issuer regime, validity or
-- approval metadata and with default zero rates. Do not treat them as ready.
ALTER TABLE public.fiscal_tax_rules
  ADD COLUMN IF NOT EXISTS issuer_tax_regime text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS reviewed_for_preview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_source text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.fiscal_tax_rules
  ADD CONSTRAINT fiscal_preview_valid_window CHECK (valid_until IS NULL OR valid_from IS NOT NULL AND valid_until >= valid_from),
  ADD CONSTRAINT fiscal_preview_review_complete CHECK (
    NOT reviewed_for_preview OR
    (issuer_tax_regime IS NOT NULL AND length(trim(issuer_tax_regime)) > 0
     AND cfop ~ '^[1-7][0-9]{3}$' AND ncm ~ '^[0-9]{8}$'
     AND valid_from IS NOT NULL AND review_source IS NOT NULL
     AND length(trim(review_source)) > 0 AND reviewed_at IS NOT NULL)
  );

-- Review is a privileged import/approval action. Authenticated operators may
-- continue editing drafts but cannot mark a rule ready by changing a checkbox.
CREATE OR REPLACE FUNCTION public.guard_fiscal_preview_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' AND NEW.reviewed_for_preview THEN
    RAISE EXCEPTION 'Revisão fiscal exige fluxo privilegiado de aprovação';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_fiscal_preview_review ON public.fiscal_tax_rules;
CREATE TRIGGER trg_guard_fiscal_preview_review
BEFORE INSERT OR UPDATE ON public.fiscal_tax_rules
FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_preview_review();
