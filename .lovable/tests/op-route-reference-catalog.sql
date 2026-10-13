-- Run only after migration on isolated staging. Structural check, not A/B proof.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.production_orders'::regclass
      AND confrelid = 'public.production_routes'::regclass
      AND conname = 'production_orders_route_id_fkey'
      AND contype = 'f' AND confdeltype = 'r' AND NOT convalidated
  ) THEN
    RAISE EXCEPTION 'Expected unvalidated RESTRICT FK from OP to route not found';
  END IF;
END;
$$;
