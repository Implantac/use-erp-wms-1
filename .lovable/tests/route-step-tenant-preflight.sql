-- Read-only staging audit with authorized cross-company visibility.
-- Empty result with ordinary RLS credentials is not evidence of consistency.
BEGIN TRANSACTION READ ONLY;
SELECT rs.id AS route_step_id, rs.route_id,
  CASE
    WHEN rs.company_id IS NULL THEN 'step_without_company'
    WHEN r.id IS NULL OR r.company_id IS DISTINCT FROM rs.company_id THEN 'route_company_mismatch'
    WHEN rs.sector_id IS NOT NULL AND (s.id IS NULL OR s.company_id IS DISTINCT FROM rs.company_id) THEN 'sector_company_mismatch'
    WHEN rs.resource_id IS NOT NULL AND (res.id IS NULL OR res.company_id IS DISTINCT FROM rs.company_id) THEN 'resource_company_mismatch'
    WHEN rs.resource_id IS NOT NULL AND rs.sector_id IS NOT NULL
      AND res.sector_id IS NOT NULL AND res.sector_id IS DISTINCT FROM rs.sector_id THEN 'resource_sector_mismatch'
    WHEN ops.match_count <> 1 THEN 'missing_or_ambiguous_active_operation'
    WHEN rs.sequence < 1 OR rs.setup_time_minutes < 0 OR rs.operation_time_minutes < 0
      OR rs.setup_time_minutes = 'NaN'::numeric OR rs.operation_time_minutes = 'NaN'::numeric
      THEN 'invalid_step_order_or_time'
  END AS finding
FROM public.production_route_steps rs
LEFT JOIN public.production_routes r ON r.id = rs.route_id
LEFT JOIN public.production_sectors s ON s.id = rs.sector_id
LEFT JOIN public.production_resources res ON res.id = rs.resource_id
CROSS JOIN LATERAL (
  SELECT count(*) AS match_count FROM public.production_steps ps
  WHERE ps.company_id = rs.company_id AND ps.name = rs.step_name AND ps.is_active = true
) ops
WHERE rs.company_id IS NULL OR r.id IS NULL OR r.company_id IS DISTINCT FROM rs.company_id
  OR (rs.sector_id IS NOT NULL AND (s.id IS NULL OR s.company_id IS DISTINCT FROM rs.company_id))
  OR (rs.resource_id IS NOT NULL AND (res.id IS NULL OR res.company_id IS DISTINCT FROM rs.company_id))
  OR (rs.resource_id IS NOT NULL AND rs.sector_id IS NOT NULL
      AND res.sector_id IS NOT NULL AND res.sector_id IS DISTINCT FROM rs.sector_id)
  OR ops.match_count <> 1 OR rs.sequence < 1 OR rs.setup_time_minutes < 0 OR rs.operation_time_minutes < 0
  OR rs.setup_time_minutes = 'NaN'::numeric OR rs.operation_time_minutes = 'NaN'::numeric
ORDER BY rs.id;
ROLLBACK;
