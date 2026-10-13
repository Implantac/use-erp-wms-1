import type { MaterialItemLike } from '@/lib/pcp/types';
import type { MaterialNeed } from './types';

/** Gross-balance comparison only; never an authorization to consume stock. */
export function getOrderGrossCoverage(materials: MaterialItemLike[] | null | undefined, needs: MaterialNeed[]): number | null {
  if (!materials?.length) return null;
  let coverage = 100;
  for (const material of materials) {
    const code = (material.code || material.componentCode || material.material_code || '').trim();
    const quantity = material.quantity ?? material.qty;
    if (!code || !Number.isFinite(quantity) || (quantity ?? 0) <= 0 || !material.unit) return null;
    const need = needs.find(n => n.materialCode === code && n.unit === material.unit);
    if (!need || !Number.isFinite(need.coveragePct)) return null;
    coverage = Math.min(coverage, need.coveragePct);
  }
  return coverage;
}
