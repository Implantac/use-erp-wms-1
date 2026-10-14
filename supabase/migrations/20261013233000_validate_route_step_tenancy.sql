-- Reject new cross-company route-step writes even when bypassing the UI.
-- No backfill: audit old routes/steps separately. This does not version routes.
CREATE OR REPLACE FUNCTION public.validate_production_route_step_tenancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_count integer;
BEGIN
  IF NEW.company_id IS NULL OR NEW.route_id IS NULL
     OR NEW.step_name IS NULL OR btrim(NEW.step_name) = ''
     OR NEW.sequence IS NULL OR NEW.sequence < 1
     OR NEW.setup_time_minutes IS NULL OR NEW.setup_time_minutes < 0
     OR NEW.setup_time_minutes = 'NaN'::numeric
     OR NEW.operation_time_minutes IS NULL OR NEW.operation_time_minutes < 0
     OR NEW.operation_time_minutes = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Etapa de roteiro exige empresa, nome, sequência e tempos válidos'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_routes r
    WHERE r.id = NEW.route_id AND r.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Roteiro não pertence à empresa da etapa'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_sectors s
    WHERE s.id = NEW.sector_id AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Setor não pertence à empresa da etapa'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.resource_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_resources res
    WHERE res.id = NEW.resource_id AND res.company_id = NEW.company_id
      AND (NEW.sector_id IS NULL OR res.sector_id IS NULL OR res.sector_id = NEW.sector_id)
  ) THEN
    RAISE EXCEPTION 'Recurso não pertence à empresa ou ao setor da etapa'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer INTO v_operation_count
  FROM public.production_steps ps
  WHERE ps.company_id = NEW.company_id AND ps.name = NEW.step_name AND ps.is_active = true;
  IF v_operation_count <> 1 THEN
    RAISE EXCEPTION 'Etapa exige exatamente uma operação ativa com este nome na empresa'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_production_route_step_tenancy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_validate_production_route_step_tenancy ON public.production_route_steps;
CREATE TRIGGER tr_validate_production_route_step_tenancy
  BEFORE INSERT OR UPDATE OF company_id, route_id, step_name, sector_id, resource_id,
                             sequence, setup_time_minutes, operation_time_minutes
  ON public.production_route_steps
  FOR EACH ROW EXECUTE FUNCTION public.validate_production_route_step_tenancy();
