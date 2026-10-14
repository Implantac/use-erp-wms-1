import type { SheetLike } from '@/lib/pcp/types';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { SupplyItem } from '@/hooks/inventory/useSupplyStock';
import { useMemo } from 'react';
import type { MaterialNeed } from './types';
import { hasValidSheetMaterials } from './validateMaterials';
import { calculateGrossMaterialNeeds, getUniqueSheet } from './grossNeeds';

export function useMRPNeeds(orders: ProductionOrderRow[], sheets: SheetLike[], supplies: SupplyItem[]) {
  const activeOPs = useMemo(
    () => orders.filter(o => ['planned', 'in_progress'].includes(o.status)),
    [orders]
  );

  const materialNeeds = useMemo<MaterialNeed[]>(() => calculateGrossMaterialNeeds(activeOPs, sheets, supplies),
    [activeOPs, sheets, supplies]);

  const opsWithInvalidSheet = useMemo(
    () => activeOPs.filter(op => !hasValidSheetMaterials(getUniqueSheet(op, sheets)?.materials)),
    [activeOPs, sheets]
  );

  return { activeOPs, materialNeeds, opsWithInvalidSheet };
}
