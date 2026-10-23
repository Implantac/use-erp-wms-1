export interface IndustrialOrderMetricInput {
  status: string;
  quantity: number;
  produced_quantity: number;
  due_date?: string | null;
  start_date?: string | null;
  sector?: string | null;
  work_center?: string | null;
}

export interface IndustrialInspectionMetricInput {
  approved_quantity: number;
  rejected_quantity: number;
  /** Unit inherited from the linked production order; never assume "peças". */
  order_unit?: string | null;
}

export interface IndustrialSectorCount {
  sector: string;
  openOrders: number;
}

export interface IndustrialDashboardMetrics {
  openOrders: number;
  inProgressOrders: number;
  startedToday: number;
  overdueOrders: number;
  averageProgressPct: number | null;
  progressSampleSize: number;
  inspectionCount: number;
  approvedQuantity: number | null;
  rejectedQuantity: number | null;
  qualityUnit: string | null;
  approvalRatePct: number | null;
  sectorCounts: IndustrialSectorCount[];
}

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled']);

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function sameLocalDay(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    && date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

/**
 * Metrics are calculated only from rows loaded for the active company.
 * Quantities from different OP units are never aggregated: if inspections are
 * linked to more than one unit (or an OP unit is missing), quality quantities
 * and approval rate stay null so the UI can show "Sem dados suficientes".
 */
export function calculateIndustrialDashboardMetrics(
  orders: readonly IndustrialOrderMetricInput[],
  inspections: readonly IndustrialInspectionMetricInput[],
  now = new Date(),
): IndustrialDashboardMetrics {
  const openOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status));
  const progressValues: number[] = [];

  for (const order of openOrders) {
    if (Number.isFinite(order.quantity) && order.quantity > 0 && isFiniteNonNegative(order.produced_quantity)) {
      progressValues.push(Math.min(100, (order.produced_quantity / order.quantity) * 100));
    }
  }

  const sectorMap = new Map<string, number>();
  for (const order of openOrders) {
    const sector = order.sector?.trim() || order.work_center?.trim() || 'Sem setor/centro registrado';
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + 1);
  }

  const qualityUnits = [...new Set(
    inspections
      .map((inspection) => inspection.order_unit?.trim())
      .filter((unit): unit is string => Boolean(unit)),
  )];
  const hasUnknownQualityUnit = inspections.some((inspection) => !inspection.order_unit?.trim());
  const qualityUnit = qualityUnits.length === 1 && !hasUnknownQualityUnit ? qualityUnits[0] : null;

  let approvedQuantity: number | null = null;
  let rejectedQuantity: number | null = null;
  let approvalRatePct: number | null = null;
  if (qualityUnit && inspections.every((inspection) => isFiniteNonNegative(inspection.approved_quantity)
    && isFiniteNonNegative(inspection.rejected_quantity))) {
    approvedQuantity = inspections.reduce((sum, inspection) => sum + inspection.approved_quantity, 0);
    rejectedQuantity = inspections.reduce((sum, inspection) => sum + inspection.rejected_quantity, 0);
    const inspected = approvedQuantity + rejectedQuantity;
    approvalRatePct = inspected > 0 ? (approvedQuantity / inspected) * 100 : null;
  }

  return {
    openOrders: openOrders.length,
    inProgressOrders: openOrders.filter((order) => order.status === 'in_progress').length,
    startedToday: openOrders.filter((order) => sameLocalDay(order.start_date, now)).length,
    overdueOrders: openOrders.filter((order) => {
      if (!order.due_date) return false;
      const due = new Date(order.due_date).getTime();
      return Number.isFinite(due) && due < now.getTime();
    }).length,
    averageProgressPct: progressValues.length
      ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
      : null,
    progressSampleSize: progressValues.length,
    inspectionCount: inspections.length,
    approvedQuantity,
    rejectedQuantity,
    qualityUnit,
    approvalRatePct,
    sectorCounts: [...sectorMap.entries()]
      .map(([sector, count]) => ({ sector, openOrders: count }))
      .sort((a, b) => b.openOrders - a.openOrders || a.sector.localeCompare(b.sector)),
  };
}
