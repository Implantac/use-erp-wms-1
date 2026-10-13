import type { SheetLike, MaterialItemLike } from '@/lib/pcp/types';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { SupplyItem } from '@/hooks/inventory/useSupplyStock';
import { useMemo } from 'react';
import type { MaterialNeed } from './types';
import { hasValidSheetMaterials } from './validateMaterials';

export function useMRPNeeds(orders: ProductionOrderRow[], sheets: SheetLike[], supplies: SupplyItem[]) {
  const activeOPs = useMemo(
    () => orders.filter(o => ['planned', 'in_progress'].includes(o.status)),
    [orders]
  );

  const materialNeeds = useMemo<MaterialNeed[]>(() => {
    const needsMap: Record<string, { totalRequired: number; relatedOPs: string[]; unit: string; name: string }> = {};

    activeOPs.forEach(op => {
      const sheet = sheets.find(s => s.product_code === op.product_code || s.product_id === op.product_id);
      if (sheet && hasValidSheetMaterials(sheet.materials)) {
        const remainingQty = Math.max(0, op.quantity - op.produced_quantity);
        sheet.materials.forEach((mat: MaterialItemLike) => {
          const code = mat.code || mat.componentCode || mat.material_code || '';
          const name = mat.name || mat.componentName || mat.material_name || code;
          const qtyPerUnit = mat.quantity ?? mat.qty ?? 0;
          const waste = mat.waste_pct ?? mat.wastePercentage ?? 0;
          const needed = remainingQty * qtyPerUnit * (1 + waste / 100);

          if (!needsMap[code]) {
            needsMap[code] = { totalRequired: 0, relatedOPs: [], unit: mat.unit || 'UN', name };
          }
          needsMap[code].totalRequired += needed;
          if (!needsMap[code].relatedOPs.includes(op.order_number)) {
            needsMap[code].relatedOPs.push(op.order_number);
          }
        });
      }
    });

    return Object.entries(needsMap).map(([code, data]) => {
      const supply = supplies.find(s => s.code === code || s.name === data.name);
      const inStock = supply?.current_quantity || 0;
      const available = inStock;
      const deficit = Math.max(0, data.totalRequired - available);
      const coveragePct = data.totalRequired > 0 ? Math.min(100, (available / data.totalRequired) * 100) : 100;

      let status: 'ok' | 'partial' | 'critical' = 'ok';
      if (coveragePct < 50) status = 'critical';
      else if (coveragePct < 100) status = 'partial';

      return {
        materialCode: code,
        materialName: data.name,
        unit: data.unit,
        totalRequired: Math.ceil(data.totalRequired * 100) / 100,
        inStock,
        reserved: 0,
        available,
        deficit: Math.ceil(deficit * 100) / 100,
        coveragePct: Math.round(coveragePct),
        relatedOPs: data.relatedOPs,
        status,
        supplier: supply?.supplier || undefined,
      };
    }).sort((a, b) => a.coveragePct - b.coveragePct);
  }, [activeOPs, sheets, supplies]);

  const opsWithInvalidSheet = useMemo(
    () => activeOPs.filter(op => !hasValidSheetMaterials(sheets.find(s => s.product_code === op.product_code || s.product_id === op.product_id)?.materials)),
    [activeOPs, sheets]
  );

  return { activeOPs, materialNeeds, opsWithInvalidSheet };
}
