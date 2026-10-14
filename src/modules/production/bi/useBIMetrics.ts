import { useMemo } from 'react';
import { useProductCosts } from '@/hooks/production/useProductCosts';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { buildProductionTrend } from './productionTrend';
import { aggregateSectorActivity } from './sectorActivity';
import { calculateOrderDateMetrics } from './orderDateMetrics';

export function useBIMetrics(periodDays: number) {
  const { costs, avgMargin, lowMarginProducts, highCostProducts } = useProductCosts();
  const { orders } = useProductionOrders();
  const { entries } = useTimeEntries();
  const { capacities } = useProductionCapacity();

  const profitByProduct = useMemo(() => costs
    .filter(c => c.sale_price > 0)
    .map(c => ({
      product: c.product_name.length > 20 ? c.product_name.slice(0, 20) + '…' : c.product_name,
      fullName: c.product_name,
      price: c.sale_price,
      cost: c.total_cost,
      unitDifference: c.sale_price - c.total_cost,
      margin: c.profit_margin,
    }))
    .sort((a, b) => b.unitDifference - a.unitDifference)
    .slice(0, 15), [costs]);

  const sectorActivity = useMemo(() => aggregateSectorActivity(orders), [orders]);


  const productionTrend = useMemo(() => buildProductionTrend(entries, periodDays), [entries, periodDays]);

  const { completedOPs, onTime, onTimePct, lateOPs, avgLeadTime, leadTimeSampleSize } =
    useMemo(() => calculateOrderDateMetrics(orders), [orders]);

  const capacityUtilization = useMemo(() => {
    if (capacities.length === 0) return null;
    return capacities.reduce((s, c) => s + c.current_load_pct, 0) / capacities.length;
  }, [capacities]);

  const marginDist = useMemo(() => {
    const brackets = [
      { label: 'Negativa', count: 0, fill: 'hsl(var(--destructive))' },
      { label: '0-10%', count: 0, fill: 'hsl(var(--chart-4))' },
      { label: '10-20%', count: 0, fill: 'hsl(var(--chart-3))' },
      { label: '20-30%', count: 0, fill: 'hsl(var(--chart-2))' },
      { label: '30%+', count: 0, fill: 'hsl(var(--primary))' },
    ];
    costs.forEach(c => {
      if (c.profit_margin < 0) brackets[0].count++;
      else if (c.profit_margin < 10) brackets[1].count++;
      else if (c.profit_margin < 20) brackets[2].count++;
      else if (c.profit_margin < 30) brackets[3].count++;
      else brackets[4].count++;
    });
    return brackets;
  }, [costs]);

  return {
    costs, avgMargin, lowMarginProducts, highCostProducts,
    orders, profitByProduct, sectorActivity,
    productionTrend,
    onTimePct, onTime, completedOPs, lateOPs,
    avgLeadTime, leadTimeSampleSize, capacityUtilization,
    marginDist,
  };
}

export type BIMetrics = ReturnType<typeof useBIMetrics>;
