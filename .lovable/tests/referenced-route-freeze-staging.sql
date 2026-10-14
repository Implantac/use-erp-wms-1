-- Staging only: run after migrations with an authorized test role and an OP
-- already linked to a route with at least one step. Never run against production.
-- All statements roll back; this is behavioral proof for one fixture, NOT A/B
-- or concurrent-session proof. Requires psql -v ON_ERROR_STOP=1.
BEGIN;
DO $$
DECLARE v_op uuid; v_route uuid; v_step uuid;
BEGIN
  SELECT o.id, o.route_id, rs.id INTO v_op, v_route, v_step
  FROM public.production_orders o
  JOIN public.production_route_steps rs ON rs.route_id = o.route_id
  WHERE o.route_id IS NOT NULL
  ORDER BY o.id, rs.sequence LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No linked OP+route+step fixture in isolated staging';
  END IF;

  BEGIN
    UPDATE public.production_routes SET version = version WHERE id = v_route;
    RAISE EXCEPTION 'Referenced route update was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.production_routes WHERE id = v_route;
    RAISE EXCEPTION 'Referenced route delete was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.production_route_steps SET sequence = sequence WHERE id = v_step;
    RAISE EXCEPTION 'Referenced route step update was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.production_orders SET route_id = NULL WHERE id = v_op;
    RAISE EXCEPTION 'OP route detachment was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
