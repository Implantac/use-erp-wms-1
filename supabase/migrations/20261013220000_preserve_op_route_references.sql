-- Preserve technical provenance: route deletion must not orphan any OP.
-- NOT VALID permits pre-existing orphan references to be audited separately;
-- PostgreSQL still enforces the FK on subsequent inserts/updates/deletes.
-- Apply only after staging audit and during an approved migration window:
-- adding an FK takes table locks even when validation is deferred.
CREATE INDEX IF NOT EXISTS idx_production_orders_route_reference
  ON public.production_orders (route_id) WHERE route_id IS NOT NULL;

ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_route_id_fkey
  FOREIGN KEY (route_id) REFERENCES public.production_routes (id)
  ON DELETE RESTRICT NOT VALID;

-- Historical consistency is deliberately NOT asserted here. After auditing
-- and repairing orphan references with approval, VALIDATE CONSTRAINT separately.
