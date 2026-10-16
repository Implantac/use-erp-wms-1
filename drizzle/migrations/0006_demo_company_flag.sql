ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ALTER COLUMN cnpj DROP NOT NULL;
ALTER TABLE public.companies ADD CONSTRAINT companies_cnpj_required_unless_demo CHECK (is_demo OR cnpj IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.block_fiscal_docs_for_demo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id AND c.is_demo) THEN
    RAISE EXCEPTION 'Empresa de demonstração: emissão de documentos fiscais bloqueada.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_fiscal_docs_for_demo() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['nfe','nfce','cte','mdfe','fiscal_emission_jobs'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_block_fiscal_demo ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_block_fiscal_demo BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_fiscal_docs_for_demo()', t);
  END LOOP;
END $$;