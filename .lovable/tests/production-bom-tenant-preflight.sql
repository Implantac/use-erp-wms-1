-- Read-only inventory on isolated staging using an approved cross-company audit role.
-- RLS may conceal rows; empty output under ordinary credentials proves nothing.
BEGIN TRANSACTION READ ONLY;
SELECT b.id AS bom_item_id, b.product_id, b.component_id,
  CASE
    WHEN b.product_id IS NULL OR p.id IS NULL THEN 'missing_product'
    WHEN p.company_id IS DISTINCT FROM b.company_id THEN 'product_company_mismatch'
    WHEN b.component_id IS NULL OR c.id IS NULL THEN 'missing_component'
    WHEN c.company_id IS DISTINCT FROM b.company_id THEN 'component_company_mismatch'
    WHEN b.product_id = b.component_id THEN 'self_consumption'
    WHEN b.quantity <= 0 OR b.quantity = 'NaN'::numeric
      OR COALESCE(b.waste_percentage, 0) < 0 OR b.waste_percentage = 'NaN'::numeric THEN 'invalid_quantity_or_waste'
  END AS finding
FROM public.production_bom b
LEFT JOIN public.products p ON p.id = b.product_id
LEFT JOIN public.products c ON c.id = b.component_id
WHERE b.product_id IS NULL OR p.id IS NULL OR p.company_id IS DISTINCT FROM b.company_id
   OR b.component_id IS NULL OR c.id IS NULL OR c.company_id IS DISTINCT FROM b.company_id
   OR b.product_id = b.component_id OR b.quantity <= 0 OR b.quantity = 'NaN'::numeric
      OR COALESCE(b.waste_percentage, 0) < 0 OR b.waste_percentage = 'NaN'::numeric
ORDER BY b.id;
ROLLBACK;
