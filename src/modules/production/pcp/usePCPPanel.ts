import { useState } from 'react';
import { differenceInDays, parseISO, differenceInMinutes } from 'date-fns';
import { toastError } from '@/lib/toastHelpers';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TimeEntryRow } from '@/hooks/system/useTimeEntries';
import type { DbOrder } from '@/hooks/commercial/useOrders';

type UpdateOP = (id: string, updates: Partial<ProductionOrderRow>) => Promise<void> | void;

export function usePCPPanelState() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [generatingFor, setGeneratingFor] = useState<DbOrder | null>(null);
  return { search, setSearch, statusFilter, setStatusFilter, generatingFor, setGeneratingFor };
}

export function computeDerived(productionOrders: ProductionOrderRow[], salesOrders: DbOrder[] = [], timeEntries: TimeEntryRow[] = []) {
  const statusCounts = productionOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const totalCapacity = productionOrders.length > 0
    ? productionOrders.reduce((s, o) => s + (o.produced_quantity / Math.max(o.quantity, 1)), 0) / productionOrders.length * 100
    : 0;

  const ordersAwaitingProduction = (salesOrders || []).filter(o => o.status === 'awaiting_production' || o.status === 'confirmed');

  const workCenterLoad = productionOrders
    .filter(o => o.status === 'in_progress' || o.status === 'planned')
    .reduce((acc: Record<string, { count: number; totalQty: number }>, o) => {
      const wc = o.work_center || 'Sem setor';
      if (!acc[wc]) acc[wc] = { count: 0, totalQty: 0 };
      acc[wc].count++;
      acc[wc].totalQty += o.quantity - o.produced_quantity;
      return acc;
    }, {});
  const workCenterData = Object.entries(workCenterLoad).map(([name, v]) => ({ name, ordens: (v as { count: number; totalQty: number }).count, pendente: (v as { count: number; totalQty: number }).totalQty }));

  const today = new Date();
  const delayedOPs = productionOrders.filter(o => {
    if (!o.due_date || o.status === 'completed' || o.status === 'cancelled') return false;
    return differenceInDays(today, parseISO(o.due_date)) > 0;
  });

  const todayStr = new Date().toDateString();
  const todayEntries = timeEntries.filter(e => new Date(e.start_time).toDateString() === todayStr);
  const operators = [...new Set(todayEntries.map(e => e.operator))];
  const operatorData = operators.map(op => {
    const opEntries = todayEntries.filter(e => e.operator === op);
    const produced = opEntries.reduce((s, e) => s + e.produced_quantity, 0);
    const totalMin = opEntries.filter(e => e.end_time).reduce((s, e) => s + differenceInMinutes(new Date(e.end_time!), new Date(e.start_time)) - (e.paused_time || 0), 0);
    const pcsH = totalMin > 0 ? (produced / (totalMin / 60)) : 0;
    return { name: op.split(' ')[0], pcsH: Number(pcsH.toFixed(1)) };
  }).sort((a, b) => b.pcsH - a.pcsH).slice(0, 10);

  return { statusCounts, totalCapacity, ordersAwaitingProduction, workCenterData, today, delayedOPs, operatorData };
}


export async function handleStatusChange(op: ProductionOrderRow, newStatus: string, update: UpdateOP) {
  if (newStatus === 'completed') { toastError('Conclusão de OP bloqueada até validação transacional de qualidade e estoque'); return; }
  await update(op.id, {
    status: newStatus,
    ...(newStatus === 'in_progress' ? { start_date: new Date().toISOString() } : {}),
  });

}
