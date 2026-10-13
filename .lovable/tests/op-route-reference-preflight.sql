-- Staging only, with authorized visibility of all companies.
-- Read-only inventory before adding the OP -> route FK. Empty under RLS
-- does not establish that no orphan or cross-company reference exists.
BEGIN TRANSACTION READ ONLY;
SELECT o.id AS production_order_id, o.route_id,
       CASE WHEN r.id IS NULL THEN 'missing_route'
            WHEN r.company_id IS DISTINCT FROM o.company_id THEN 'route_company_mismatch'
       END AS finding
FROM public.production_orders o
LEFT JOIN public.production_routes r ON r.id = o.route_id
WHERE o.route_id IS NOT NULL
  AND (r.id IS NULL OR r.company_id IS DISTINCT FROM o.company_id)
ORDER BY o.id;
ROLLBACK;
