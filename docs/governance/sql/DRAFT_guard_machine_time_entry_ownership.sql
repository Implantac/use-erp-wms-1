-- PREPARED ONLY. Do not apply in production before isolated rehearsal and RLS audit.
-- An AFTER trigger runs in the same transaction as the time_entries write.
-- A machine row lock serializes competing claims; exceptions roll back the entry.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.time_entries e
    JOIN public.production_machines m ON m.id = e.machine_id
    WHERE e.status IN ('started', 'paused') AND e.company_id IS DISTINCT FROM m.company_id
  ) THEN
    RAISE EXCEPTION 'Active time entries reference machines of another company; reconcile before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_entries e
    JOIN public.production_orders o ON o.id = e.production_order_id
    WHERE e.status IN ('started', 'paused') AND e.company_id IS DISTINCT FROM o.company_id
  ) THEN
    RAISE EXCEPTION 'Active time entries reference orders of another company; reconcile before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_entries e JOIN public.production_machines m ON m.id = e.machine_id
    WHERE e.status IN ('started', 'paused') AND NOT m.active
  ) THEN
    RAISE EXCEPTION 'Inactive machines have active time entries; reconcile before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.time_entries e
    WHERE e.machine_id IS NOT NULL AND e.status IN ('started', 'paused')
    GROUP BY e.machine_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Machines with multiple active time entries; reconcile before migration';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_machine_status_from_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_machine public.production_machines%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.machine_id IS DISTINCT FROM OLD.machine_id THEN
      RAISE EXCEPTION 'Time entry company and machine are immutable';
    END IF;
    IF OLD.status = 'completed' AND NEW.status IN ('started', 'paused') THEN
      RAISE EXCEPTION 'A completed time entry cannot claim a machine again';
    END IF;
  END IF;

  IF NEW.machine_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_machine FROM public.production_machines
    WHERE id = NEW.machine_id FOR UPDATE;
  IF NOT FOUND OR NEW.company_id IS NULL OR v_machine.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Time entry and machine must belong to the same company';
  END IF;
  IF NEW.production_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_orders o
    WHERE o.id = NEW.production_order_id AND o.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Time entry and production order must belong to the same company';
  END IF;

  -- Never release/claim a machine while another unfinished entry owns it.
  IF EXISTS (
    SELECT 1 FROM public.time_entries e
    WHERE e.machine_id = NEW.machine_id AND e.id <> NEW.id
      AND e.status IN ('started', 'paused')
  ) THEN
    RAISE EXCEPTION 'Machine is already assigned to another active time entry';
  END IF;

  IF NEW.status IN ('started', 'paused') AND NOT v_machine.active THEN
    RAISE EXCEPTION 'Inactive machine cannot be claimed by a time entry';
  END IF;

  IF NEW.status = 'started' THEN
    UPDATE public.production_machines
      SET status = 'running', current_operator = NEW.operator,
          current_order_id = NEW.production_order_id, updated_at = now()
      WHERE id = NEW.machine_id AND company_id = NEW.company_id;
  ELSIF NEW.status = 'paused' THEN
    UPDATE public.production_machines
      SET status = 'stopped', current_operator = NEW.operator,
          current_order_id = NEW.production_order_id, updated_at = now()
      WHERE id = NEW.machine_id AND company_id = NEW.company_id;
  ELSIF NEW.status = 'completed' THEN
    UPDATE public.production_machines
      SET status = 'available', current_operator = NULL,
          current_order_id = NULL, updated_at = now()
      WHERE id = NEW.machine_id AND company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Existing trigger remains installed and calls the replaced function.
-- No GRANT EXECUTE: trigger functions are not callable as regular RPCs.
