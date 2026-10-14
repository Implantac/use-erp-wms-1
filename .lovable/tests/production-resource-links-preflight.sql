-- Staging-only read-only audit with approved cross-tenant visibility.
-- RLS can hide rows; empty results with a restricted role prove nothing.
BEGIN TRANSACTION READ ONLY;
SELECT l.id AS production_line_id, l.sector_id,
       CASE WHEN l.company_id IS NULL THEN 'line_without_company'
            ELSE 'line_sector_company_mismatch' END AS finding
FROM public.production_lines l
LEFT JOIN public.production_sectors s ON s.id = l.sector_id
WHERE l.company_id IS NULL
   OR (l.sector_id IS NOT NULL AND (s.id IS NULL OR s.company_id IS DISTINCT FROM l.company_id))
ORDER BY l.id;

SELECT res.id AS production_resource_id, res.sector_id, res.line_id,
  CASE WHEN res.company_id IS NULL THEN 'resource_without_company'
       WHEN res.sector_id IS NOT NULL AND (s.id IS NULL OR s.company_id IS DISTINCT FROM res.company_id)
         THEN 'resource_sector_company_mismatch'
       WHEN res.line_id IS NOT NULL AND (l.id IS NULL OR l.company_id IS DISTINCT FROM res.company_id)
         THEN 'resource_line_company_mismatch'
       ELSE 'resource_line_sector_mismatch' END AS finding
FROM public.production_resources res
LEFT JOIN public.production_sectors s ON s.id = res.sector_id
LEFT JOIN public.production_lines l ON l.id = res.line_id
WHERE res.company_id IS NULL
   OR (res.sector_id IS NOT NULL AND (s.id IS NULL OR s.company_id IS DISTINCT FROM res.company_id))
   OR (res.line_id IS NOT NULL AND (l.id IS NULL OR l.company_id IS DISTINCT FROM res.company_id
       OR (res.sector_id IS NOT NULL AND l.sector_id IS NOT NULL
           AND l.sector_id IS DISTINCT FROM res.sector_id)))
ORDER BY res.id;
ROLLBACK;
