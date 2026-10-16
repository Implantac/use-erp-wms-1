-- DESIGN DRAFT ONLY: deliberately outside supabase/migrations.
-- Do not apply without isolated Supabase, effective RLS/permissions review,
-- stock_lots schema verification, migration rehearsal and transaction RPC.
-- stock_lots / stock_movements remain inventory sources; these tables only describe provenance.
CREATE TABLE public.textile_process_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id),
  stage_code text NOT NULL CHECK (length(trim(stage_code)) > 0),
  route_version text NOT NULL CHECK (length(trim(route_version)) > 0),
  state text NOT NULL CHECK (state IN ('draft','posted','void')),
  operator_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  CHECK ((state = 'posted' AND posted_at IS NOT NULL) OR (state <> 'posted' AND posted_at IS NULL))
);
CREATE TABLE public.textile_process_inputs (
  run_id uuid NOT NULL REFERENCES public.textile_process_runs(id),
  stock_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  PRIMARY KEY (run_id, stock_lot_id)
);
CREATE TABLE public.textile_process_outputs (
  run_id uuid NOT NULL REFERENCES public.textile_process_runs(id),
  stock_lot_id uuid NOT NULL REFERENCES public.stock_lots(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (length(trim(unit)) > 0),
  PRIMARY KEY (run_id, stock_lot_id),
  UNIQUE (stock_lot_id) -- no output lot may be attributed to two process runs
);
CREATE INDEX textile_process_runs_company_op ON public.textile_process_runs(company_id, production_order_id);
CREATE INDEX textile_process_inputs_lot ON public.textile_process_inputs(stock_lot_id);

ALTER TABLE public.textile_process_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textile_process_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textile_process_outputs ENABLE ROW LEVEL SECURITY;
-- No permissive policies or client GRANTs: fail closed until a reviewed server
-- transaction checks company/branch, lot ownership, units, quality, stock,
-- OP state, rework, idempotency and all input/output edges atomically.
-- Never post this draft by copying the DDL alone into production.
