import { useState } from 'react';
import { toastError } from '@/lib/toastHelpers';
import { canChangeOPStatus } from '@/lib/pcp/orderTransitions';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TimeEntryRow } from '@/hooks/system/useTimeEntries';
import type { DbOrder } from '@/hooks/commercial/useOrders';

type UpdateOP = (id: string, updates: Partial<ProductionOrderRow>) => Promise<unknown> | void;

export function usePCPPanelState() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [generatingFor, setGeneratingFor] = useState<DbOrder | null>(null);
  return { search, setSearch, statusFilter, setStatusFilter, generatingFor, setGeneratingFor };
}

export function computeDerived(productionOrders: ProductionOrderRow[], salesOrders: DbOrder[] = [], timeEntries: TimeEntryRow[] = [], today = new Date()) {
  const statusCounts = productionOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const activeStatuses = ['planned', 'in_progress', 'paused', 'waiting_material', 'outsourced', 'finishing'];
  const validProgress = productionOrders.filter(o => activeStatuses.includes(o.status)
    && Number.isFinite(o.quantity) && o.quantity > 0 && Number.isFinite(o.produced_quantity)
    && o.produced_quantity >= 0 && o.produced_quantity <= o.quantity);
  // Per-order ratios are dimensionless; never sum quantities across products.
  const averageProgress = validProgress.length
    ? validProgress.reduce((sum, o) => sum + o.produced_quantity / o.quantity, 0) / validProgress.length * 100
    : null;

  const ordersAwaitingProduction = salesOrders.filter(o => o.status === 'awaiting_production' || o.status === 'confirmed');
  const workCenterLoad = productionOrders.filter(o => activeStatuses.includes(o.status))
    .reduce((acc: Record<string, number>, o) => {
      const center = o.work_center?.trim() || 'Centro não informado';
      acc[center] = (acc[center] || 0) + 1;
      return acc;
    }, {});
  const workCenterData = Object.entries(workCenterLoad).map(([name, ordens]) => ({ name, ordens }));

  const nowMs = today.getTime();
  const delayedOPs = productionOrders.filter(o => {
    if (!activeStatuses.includes(o.status) || !o.due_date || !Number.isFinite(nowMs)) return false;
    const dueMs = new Date(o.due_date).getTime();
    return Number.isFinite(dueMs) && dueMs < nowMs;
  });

  const entriesByOperator = new Map<string, number>();
  for (const entry of timeEntries) {
    if (entry.status !== 'completed' || !entry.end_time || !entry.operator?.trim()) continue;
    const end = new Date(entry.end_time);
    const start = new Date(entry.start_time);
    if (!Number.isFinite(end.getTime()) || !Number.isFinite(start.getTime())
      || end > today || end <= start || end.toDateString() !== today.toDateString()) continue;
    const operator = entry.operator.trim();
    entriesByOperator.set(operator, (entriesByOperator.get(operator) || 0) + 1);
  }
  const operatorData = [...entriesByOperator].map(([name, entries]) => ({ name, entries }))
    .sort((a, b) => b.entries - a.entries).slice(0, 10);

  return { statusCounts, averageProgress, progressSampleSize: validProgress.length,
    ordersAwaitingProduction, workCenterData, today, delayedOPs, operatorData };
}

export async function handleStatusChange(op: ProductionOrderRow, newStatus: string, update: UpdateOP) {
  if (!canChangeOPStatus(op.status, newStatus)) { toastError('Transição inválida ou conclusão bloqueada até validação transacional'); return; }
  await update(op.id, {
    status: newStatus,
    ...(newStatus === 'in_progress' && !op.start_date ? { start_date: new Date().toISOString() } : {}),
  });

}
