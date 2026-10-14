import type { MaterialItemLike, SheetLike } from '@/lib/pcp/types';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { SupplyItem } from '@/hooks/inventory/useSupplyStock';
import type { MaterialNeed } from './types';
import { hasValidSheetMaterials } from './validateMaterials';

/** A product with multiple candidate revisions has no deterministic planning BOM. */
export function getUniqueSheet(op: ProductionOrderRow, sheets: SheetLike[]): SheetLike | null {
  const candidates = sheets.filter(s => (op.product_id && s.product_id === op.product_id)
    || (op.product_code && s.product_code === op.product_code));
  return candidates.length === 1 ? candidates[0] : null;
}

/** Gross demand only. No lot, reservation, conversion or purchase authorization. */
export function calculateGrossMaterialNeeds(orders: ProductionOrderRow[], sheets: SheetLike[], supplies: SupplyItem[]): MaterialNeed[] {
  const needsMap = new Map<string, { materialCode: string; totalRequired: number; relatedOPs: string[]; unit: string; name: string }>();
  for (const op of orders.filter(o => ['planned', 'in_progress'].includes(o.status))) {
    const sheet = getUniqueSheet(op, sheets);
    if (!sheet || !hasValidSheetMaterials(sheet.materials)) continue;
    const remaining = op.quantity - op.produced_quantity;
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    for (const mat of sheet.materials as MaterialItemLike[]) {
      const code = (mat.code || mat.componentCode || mat.material_code || '').trim();
      const unit = mat.unit!.trim();
      const name = mat.name || mat.componentName || mat.material_name || code;
      const needed = remaining * (mat.quantity ?? mat.qty!) * (1 + (mat.waste_pct ?? mat.wastePercentage ?? 0) / 100);
      if (!Number.isFinite(needed) || needed <= 0) continue;
      const key = JSON.stringify([code, unit]); // Never combine kg, m and UN for one SKU.
      const entry = needsMap.get(key) ?? { materialCode: code, totalRequired: 0, relatedOPs: [], unit, name };
      entry.totalRequired += needed;
      if (!entry.relatedOPs.includes(op.order_number)) entry.relatedOPs.push(op.order_number);
      needsMap.set(key, entry);
    }
  }

  return [...needsMap.values()].map(data => {
    // Missing, duplicate or differently denominated stocks are UNKNOWN, not zero.
    const matches = supplies.filter(s => s.code === data.materialCode && s.unit === data.unit
      && Number.isFinite(s.current_quantity) && s.current_quantity >= 0);
    const coverageKnown = matches.length === 1 && Number.isFinite(data.totalRequired) && data.totalRequired > 0;
    const supply = coverageKnown ? matches[0] : undefined;
    const inStock = supply?.current_quantity ?? 0;
    const deficit = coverageKnown ? Math.max(0, data.totalRequired - inStock) : 0;
    const coveragePct = coverageKnown ? Math.round(Math.min(100, inStock / data.totalRequired * 100)) : 0;
    return {
      materialCode: data.materialCode,
      materialName: data.name,
      unit: data.unit,
      totalRequired: Math.ceil(data.totalRequired * 100) / 100,
      inStock,
      reserved: 0,
      available: inStock,
      deficit: Math.ceil(deficit * 100) / 100,
      coveragePct,
      coverageKnown,
      relatedOPs: data.relatedOPs,
      status: !coverageKnown ? 'unverified' as const : coveragePct < 50 ? 'critical' as const
        : coveragePct < 100 ? 'partial' as const : 'ok' as const,
      supplier: supply?.supplier || undefined,
    };
  }).sort((a, b) => (a.coverageKnown ? a.coveragePct : 101) - (b.coverageKnown ? b.coveragePct : 101));
}
