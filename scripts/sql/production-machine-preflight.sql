-- READ ONLY. Run only in an isolated homologation database after migrations are staged.
-- A zero count is necessary, not sufficient: also inspect RLS and triggers live.
SELECT 'active_machine_company_mismatch' AS check_name, count(*) AS affected
FROM public.time_entries e JOIN public.production_machines m ON m.id = e.machine_id
WHERE e.status IN ('started', 'paused') AND e.company_id IS DISTINCT FROM m.company_id
UNION ALL
SELECT 'active_machine_multiple_entries', count(*)
FROM (SELECT machine_id FROM public.time_entries
      WHERE machine_id IS NOT NULL AND status IN ('started', 'paused')
      GROUP BY machine_id HAVING count(*) > 1) duplicates
UNION ALL
SELECT 'active_entry_order_company_mismatch', count(*)
FROM public.time_entries e JOIN public.production_orders o ON o.id = e.production_order_id
WHERE e.status IN ('started', 'paused') AND e.company_id IS DISTINCT FROM o.company_id
UNION ALL
SELECT 'active_machine_missing', count(*)
FROM public.time_entries e LEFT JOIN public.production_machines m ON m.id = e.machine_id
WHERE e.status IN ('started', 'paused') AND e.machine_id IS NOT NULL AND m.id IS NULL
UNION ALL
SELECT 'active_machine_inactive', count(*)
FROM public.time_entries e JOIN public.production_machines m ON m.id = e.machine_id
WHERE e.status IN ('started', 'paused') AND NOT m.active;
