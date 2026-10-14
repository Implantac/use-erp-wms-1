-- Prospectively validate company ownership of production line and resource links.
-- Old rows are not rewritten. Parent tenant changes require separate policy.
CREATE OR REPLACE FUNCTION public.validate_production_line_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Linha produtiva exige empresa' USING ERRCODE = '23514';
  END IF;
  IF NEW.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_sectors s
    WHERE s.id = NEW.sector_id AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Setor da linha não pertence à mesma empresa' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_production_line_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_validate_production_line_links ON public.production_lines;
CREATE TRIGGER tr_validate_production_line_links
  BEFORE INSERT OR UPDATE OF company_id, sector_id ON public.production_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_line_links();

CREATE OR REPLACE FUNCTION public.validate_production_resource_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line_sector uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Recurso produtivo exige empresa' USING ERRCODE = '23514';
  END IF;
  IF NEW.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_sectors s
    WHERE s.id = NEW.sector_id AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Setor do recurso não pertence à mesma empresa' USING ERRCODE = '23514';
  END IF;
  IF NEW.line_id IS NOT NULL THEN
    SELECT l.sector_id INTO v_line_sector FROM public.production_lines l
    WHERE l.id = NEW.line_id AND l.company_id = NEW.company_id;
    IF NOT FOUND OR (NEW.sector_id IS NOT NULL AND v_line_sector IS NOT NULL
      AND v_line_sector IS DISTINCT FROM NEW.sector_id) THEN
      RAISE EXCEPTION 'Linha do recurso não pertence à empresa ou ao setor informado'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_production_resource_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_validate_production_resource_links ON public.production_resources;
CREATE TRIGGER tr_validate_production_resource_links
  BEFORE INSERT OR UPDATE OF company_id, sector_id, line_id ON public.production_resources
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_resource_links();
