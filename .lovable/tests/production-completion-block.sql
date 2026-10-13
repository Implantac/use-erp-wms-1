-- Execute only in an isolated staging database after applying the migration.
-- Requires an existing disposable, non-completed production order fixture.
-- The attempted update is rolled back even if the trigger does not fire.
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.production_orders
  WHERE status IS DISTINCT FROM 'completed' ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'fixture_required: seed a non-completed OP in isolated staging';
  END IF;
  BEGIN
    UPDATE public.production_orders SET status = 'completed' WHERE id = v_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'production_completion_not_blocked';
  END IF;
END;
$$;
ROLLBACK;
