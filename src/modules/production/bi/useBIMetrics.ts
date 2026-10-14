import { useMemo } from 'react';
import { differenceInDays, differenceInMinutes, format, parseISO, subDays } from 'date-fns';
import { useProductCosts } from '@/hooks/production/useProductCosts';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';

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

  const costBySector = useMemo(() => {
    const sectorMap: Record<string, { laborMin: number; produced: number; orders: number; rejected: number; estMin: number }> = {};
    orders.forEach(o => {
      const sector = o.sector || o.work_center || 'Geral';
      if (!sectorMap[sector]) sectorMap[sector] = { laborMin: 0, produced: 0, orders: 0, rejected: 0, estMin: 0 };
      sectorMap[sector].laborMin += o.realized_time_minutes;
      sectorMap[sector].produced += o.produced_quantity;
      sectorMap[sector].orders += 1;
      sectorMap[sector].rejected += o.rejected_quantity;
      sectorMap[sector].estMin += o.estimated_time_minutes;
    });
    return Object.entries(sectorMap).map(([sector, v]) => ({
      sector,
      laborHours: +(v.laborMin / 60).toFixed(1),
      produced: v.produced,
      costPerUnit: v.produced > 0 ? +(v.laborMin / v.produced).toFixed(2) : 0,
      orders: v.orders,
      rejected: v.rejected,
      rejectRate: v.produced > 0 ? +((v.rejected / (v.produced + v.rejected)) * 100).toFixed(1) : 0,
      efficiency: v.estMin > 0 ? +((v.estMin / Math.max(v.laborMin, 1)) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.laborHours - a.laborHours);
  }, [orders]);

  const totalEstimated = orders.reduce((s, o) => s + o.estimated_time_minutes, 0);
  const totalProduced = orders.reduce((s, o) => s + o.produced_quantity, 0);
  const totalRejected = orders.reduce((s, o) => s + o.rejected_quantity, 0);

  const productionTrend = useMemo(() => {
    const days: Record<string, { produced: number; rejected: number; hours: number }> = {};
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'dd/MM');
      days[d] = { produced: 0, rejected: 0, hours: 0 };
    }
    entries.filter(e => e.status === 'completed' && e.end_time).forEach(e => {
      const d = format(new Date(e.start_time), 'dd/MM');
      if (days[d]) {
        days[d].produced += e.produced_quantity;
        days[d].rejected += e.rejected_quantity;
        days[d].hours += differenceInMinutes(new Date(e.end_time!), new Date(e.start_time)) / 60;
      }
    });
    return Object.entries(days).map(([day, v]) => ({
      day, ...v,
      pcsH: v.hours > 0 ? +(v.produced / v.hours).toFixed(1) : 0,
      yieldRate: (v.produced + v.rejected) > 0 ? +(v.produced / (v.produced + v.rejected) * 100).toFixed(1) : 100,
    }));
  }, [entries, periodDays]);

  const completedOPs = orders.filter(o => o.status === 'completed' && o.completed_date && o.due_date);
  const onTime = completedOPs.filter(o => new Date(o.completed_date!) <= new Date(o.due_date!)).length;
  const onTimePct = completedOPs.length > 0 ? (onTime / completedOPs.length) * 100 : 0;
  const lateOPs = orders.filter(o => o.due_date && !['completed', 'cancelled'].includes(o.status) && differenceInDays(new Date(), parseISO(o.due_date)) > 0);

  const avgLeadTime = useMemo(() => {
    const completed = orders.filter(o => o.status === 'completed' && o.start_date && o.completed_date);
    if (completed.length === 0) return 0;
    return completed.reduce((s, o) => s + differenceInDays(new Date(o.completed_date!), new Date(o.start_date)), 0) / completed.length;
  }, [orders]);

  const capacityUtilization = useMemo(() => {
    if (capacities.length === 0) return 0;
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

  const strategicIndicators = useMemo(() => ({
    scrapRate: (totalProduced + totalRejected) > 0 ? (totalRejected / (totalProduced + totalRejected)) * 100 : null,
  }), [totalProduced, totalRejected]);

  return {
    costs, avgMargin, lowMarginProducts, highCostProducts,
    orders, profitByProduct, costBySector,
    totalProduced, totalRejected,
    productionTrend,
    onTimePct, onTime, completedOPs, lateOPs,
    avgLeadTime, capacityUtilization,
    marginDist, strategicIndicators,
  };
}

export type BIMetrics = ReturnType<typeof useBIMetrics>;
