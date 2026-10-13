-- Existing AFTER INSERT trigger executes as owner. Scope every technical lookup
-- to the company of the inserted OP; never copy another tenant's route/steps.
-- Do not rewrite historical OPs or backfill them without an approved migration.
CREATE OR REPLACE FUNCTION public.generate_op_steps_from_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_route public.production_routes%ROWTYPE;
  v_route_step public.production_route_steps%ROWTYPE;
  v_step_id uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Produto da OP não pertence à empresa da ordem'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_route
  FROM public.production_routes r
  WHERE r.product_id = NEW.product_id
    AND r.company_id = NEW.company_id
    AND r.is_active = true
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;
  IF v_route.id IS NULL THEN
    RETURN NEW; -- Planned OP without a configured route; not releasable as complete.
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id
      AND rs.company_id IS DISTINCT FROM NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Roteiro da OP possui etapa sem vínculo válido à empresa'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id AND rs.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Roteiro da OP não possui etapas válidas para a empresa'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.production_orders
    SET route_id = v_route.id
    WHERE id = NEW.id AND company_id = NEW.company_id;

  IF EXISTS (
    SELECT 1 FROM public.production_order_steps os
    WHERE os.production_order_id = NEW.id AND os.company_id = NEW.company_id
  ) THEN
    RETURN NEW;
  END IF;

  FOR v_route_step IN
    SELECT rs.* FROM public.production_route_steps rs
    WHERE rs.route_id = v_route.id AND rs.company_id = NEW.company_id
    ORDER BY rs.sequence, rs.id
  LOOP
    SELECT ps.id INTO v_step_id FROM public.production_steps ps
    WHERE ps.name = v_route_step.step_name
      AND ps.company_id = NEW.company_id
      AND ps.is_active = true
    ORDER BY ps.id LIMIT 1;
    IF v_step_id IS NULL THEN
      RAISE EXCEPTION 'Etapa do roteiro sem cadastro ativo na empresa: %', v_route_step.step_name
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.production_order_steps (
      company_id, production_order_id, step_id, sequence,
      estimated_time_minutes, quantity_pending, status
    ) VALUES (
      NEW.company_id, NEW.id, v_step_id, v_route_step.sequence,
      v_route_step.setup_time_minutes + v_route_step.operation_time_minutes,
      NEW.quantity, 'pending'
    );
  END LOOP;

  UPDATE public.production_orders
    SET estimated_time_minutes = v_route.total_time_minutes
    WHERE id = NEW.id AND company_id = NEW.company_id AND estimated_time_minutes = 0;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_op_steps_from_route() FROM PUBLIC, anon, authenticated;
