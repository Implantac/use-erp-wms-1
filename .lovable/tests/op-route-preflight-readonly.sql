-- Execute only in isolated staging, with an approved cross-tenant audit role.
-- Example: psql -X -v ON_ERROR_STOP=1 -f .lovable/tests/op-route-preflight-readonly.sql
-- The transaction is read-only. Results are diagnostic, not authorization to edit data.
-- RLS may hide rows for ordinary users: an empty result is NOT proof of consistency.
BEGIN TRANSACTION READ ONLY;

WITH active_routes AS (
  SELECT r.id, r.company_id, r.product_id, p.company_id AS product_company_id
  FROM public.production_routes r
  LEFT JOIN public.products p ON p.id = r.product_id
  WHERE r.is_active = true
),
route_findings AS (
  SELECT 'route_without_company' AS finding, id AS route_id, NULL::uuid AS step_id
  FROM active_routes WHERE company_id IS NULL
  UNION ALL
  SELECT 'route_product_company_mismatch', id, NULL::uuid
  FROM active_routes
  WHERE product_id IS NOT NULL AND product_company_id IS DISTINCT FROM company_id
  UNION ALL
  SELECT 'route_without_product', id, NULL::uuid
  FROM active_routes WHERE product_id IS NULL
),
step_findings AS (
  SELECT 'route_step_company_mismatch' AS finding, r.id AS route_id, rs.id AS step_id
  FROM active_routes r
  JOIN public.production_route_steps rs ON rs.route_id = r.id
  WHERE rs.company_id IS DISTINCT FROM r.company_id
  UNION ALL
  SELECT 'route_without_steps', r.id, NULL::uuid
  FROM active_routes r
  WHERE NOT EXISTS (SELECT 1 FROM public.production_route_steps rs WHERE rs.route_id = r.id)
  UNION ALL
  SELECT CASE WHEN count(ps.id) = 0 THEN 'missing_active_operation'
              ELSE 'ambiguous_active_operation' END,
         r.id, rs.id
  FROM active_routes r
  JOIN public.production_route_steps rs ON rs.route_id = r.id
  LEFT JOIN public.production_steps ps
    ON ps.company_id = r.company_id
    AND ps.name = rs.step_name AND ps.is_active = true
  WHERE rs.company_id = r.company_id
  GROUP BY r.id, rs.id
  HAVING count(ps.id) <> 1
)
SELECT finding, route_id, step_id
FROM (SELECT * FROM route_findings UNION ALL SELECT * FROM step_findings) findings
ORDER BY finding, route_id, step_id;

-- Historical references (diagnostic only; do not modify old OPs in this preflight).
SELECT o.id AS production_order_id, o.route_id
FROM public.production_orders o
JOIN public.production_routes r ON r.id = o.route_id
WHERE r.company_id IS DISTINCT FROM o.company_id
ORDER BY o.id;

ROLLBACK;
