-- Protect future BOM writes against cross-company product/component references.
-- No backfill or historical validation; audit legacy data separately.
CREATE OR REPLACE FUNCTION public.validate_production_bom_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.product_id IS NULL OR NEW.component_id IS NULL
    OR NEW.quantity IS NULL OR NEW.quantity <= 0 OR NEW.quantity = 'NaN'::numeric
    OR COALESCE(NEW.waste_percentage, 0) < 0
    OR NEW.waste_percentage = 'NaN'::numeric
    OR NEW.product_id = NEW.component_id THEN
    RAISE EXCEPTION 'Ficha de materiais exige produto e componente distintos, quantidade positiva e perda não negativa'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.products c
    WHERE c.id = NEW.component_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Produto e componente da ficha devem pertencer à mesma empresa'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_production_bom_tenancy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_validate_production_bom_tenancy ON public.production_bom;
CREATE TRIGGER tr_validate_production_bom_tenancy
  BEFORE INSERT OR UPDATE OF company_id, product_id, component_id, quantity, waste_percentage
  ON public.production_bom
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_bom_tenancy();
