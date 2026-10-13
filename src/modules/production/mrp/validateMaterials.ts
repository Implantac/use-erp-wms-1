import type { MaterialItemLike } from '@/lib/pcp/types';

/** Incomplete BOMs must never contribute partial demand to gross planning. */
export function hasValidSheetMaterials(materials: MaterialItemLike[] | null | undefined): boolean {
  if (!materials?.length) return false;
  return materials.every(material => {
    const code = (material.code || material.componentCode || material.material_code || '').trim();
    const unit = material.unit?.trim();
    const quantity = material.quantity ?? material.qty;
    const waste = material.waste_pct ?? material.wastePercentage ?? 0;
    return !!code && !!unit && Number.isFinite(quantity) && (quantity ?? 0) > 0
      && Number.isFinite(waste) && waste >= 0;
  });
}
