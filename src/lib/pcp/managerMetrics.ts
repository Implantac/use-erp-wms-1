/**
 * Painel do Gerente de Produção — agregações sobre dados reais da empresa.
 *
 * Fórmulas (todas sobre linhas carregadas da empresa ativa; nada é estimado):
 * - OPs abertas: status fora de completed/cancelled/canceled.
 * - Produção na janela (padrão 30 dias): OPs concluídas com completed_date na
 *   janela, somadas POR UNIDADE (nunca somamos m com kg). Rendimento =
 *   produced / (produced + rejected) das OPs concluídas na janela.
 * - Aprovação de qualidade: aprovada / (aprovada + rejeitada) das inspeções.
 *   Se as inspeções forem de mais de uma unidade (ou alguma sem unidade da
 *   OP), o indicador fica null -> a tela mostra "Sem dados suficientes".
 * - OP sem programação: OP aberta em planned/in_progress/paused/
 *   waiting_material sem janela scheduled/in_progress.
 * - Lotes com saldo: soma de stock_lots.remaining_qty (> 0) por produto.
 *   Lote bloqueado: quality_status em blocked/quarantine/rejected (ou status
 *   diferente de available) ainda com saldo restante.
 * - Expedido na janela (padrão 7 dias): soma de stock_movements do picking
 *   WMS (source = 'wms_pick') por produto.
 * - Atrasadas: OPs abertas com due_date anterior a agora.
 */

export interface ManagerOrderInput {
  id: string;
  status: string;
  sector?: string | null;
  work_center?: string | null;
  unit?: string | null;
  quantity: number;
  produced_quantity: number;
  rejected_quantity: number;
  due_date?: string | null;
  completed_date?: string | null;
}

export interface ManagerScheduleInput {
  production_order_id: string | null;
  planned_start: string;
  planned_end: string;
  status?: string | null;
}

export interface ManagerLotInput {
  product_code: string;
  remaining_qty: number;
  status: string;
  quality_status: string;
}

export interface ManagerShipmentInput {
  product_code: string;
  quantity: number;
  created_at: string;
}

export interface ManagerInspectionInput {
  approved_quantity: number;
  rejected_quantity: number;
  order_unit?: string | null;
}

export interface UnitProduction {
  unit: string;
  produced: number;
  rejected: number;
  yieldPct: number | null;
  orders: number;
}

export interface ProductQuantity {
  productCode: string;
  quantity: number;
}

export interface SectorOpenCount {
  sector: string;
  openOrders: number;
}

export interface ManagerMetrics {
  totalOrders: number;
  openOrders: number;
  completedInWindow: number;
  productionByUnit: UnitProduction[];
  qualityApprovalPct: number | null;
  qualitySampleSize: number;
  overdueOpenOrders: number;
  unscheduledOpenOrders: number;
  windowsToday: number;
  openBySector: SectorOpenCount[];
  lotsByProduct: ProductQuantity[];
  blockedLots: number;
  shippedByProduct: ProductQuantity[];
}

const CLOSED = new Set(['completed', 'cancelled', 'canceled']);
const SCHEDULABLE = new Set(['planned', 'in_progress', 'paused', 'waiting_material']);
const ACTIVE_SCHEDULE = new Set(['scheduled', 'in_progress']);
const BLOCKED_QUALITY = new Set([
  'blocked', 'quarantine', 'rejected',
  'bloqueada', 'bloqueado', 'rejeitada', 'rejeitado', 'quarentena',
]);

const num = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

function inWindow(iso: string | null | undefined, now: Date, days: number): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  return time <= now.getTime() && now.getTime() - time <= days * 24 * 60 * 60 * 1000;
}

export function computeManagerMetrics(input: {
  orders: readonly ManagerOrderInput[];
  schedules: readonly ManagerScheduleInput[];
  lots: readonly ManagerLotInput[];
  shipments: readonly ManagerShipmentInput[];
  inspections: readonly ManagerInspectionInput[];
  now?: Date;
  productionWindowDays?: number;
  shipmentWindowDays?: number;
}): ManagerMetrics {
  const now = input.now ?? new Date();
  const productionDays = input.productionWindowDays ?? 30;
  const shipmentDays = input.shipmentWindowDays ?? 7;

  const open = input.orders.filter((order) => !CLOSED.has(order.status));
  const completed = input.orders.filter(
    (order) => order.status === 'completed' && inWindow(order.completed_date, now, productionDays),
  );

  const byUnit = new Map<string, UnitProduction>();
  for (const order of completed) {
    const unit = order.unit?.trim() || 'sem unidade';
    const row = byUnit.get(unit) ?? { unit, produced: 0, rejected: 0, yieldPct: null, orders: 0 };
    row.produced += num(order.produced_quantity);
    row.rejected += num(order.rejected_quantity);
    row.orders += 1;
    byUnit.set(unit, row);
  }
  for (const row of byUnit.values()) {
    const total = row.produced + row.rejected;
    row.yieldPct = total > 0 ? (row.produced / total) * 100 : null;
  }

  const units = [...new Set(input.inspections.map((i) => i.order_unit?.trim()).filter(Boolean))];
  const hasUnknownUnit = input.inspections.some((i) => !i.order_unit?.trim());
  let qualityApprovalPct: number | null = null;
  if (units.length === 1 && !hasUnknownUnit && input.inspections.length > 0) {
    const approved = input.inspections.reduce((sum, i) => sum + num(i.approved_quantity), 0);
    const rejected = input.inspections.reduce((sum, i) => sum + num(i.rejected_quantity), 0);
    qualityApprovalPct = approved + rejected > 0 ? (approved / (approved + rejected)) * 100 : null;
  }

  const scheduledOrderIds = new Set(
    input.schedules
      .filter((s) => ACTIVE_SCHEDULE.has(s.status ?? ''))
      .map((s) => s.production_order_id)
      .filter(Boolean),
  );
  const unscheduledOpenOrders = open.filter(
    (order) => SCHEDULABLE.has(order.status) && !scheduledOrderIds.has(order.id),
  ).length;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
  const windowsToday = input.schedules.filter((s) => {
    if (!ACTIVE_SCHEDULE.has(s.status ?? '')) return false;
    const start = new Date(s.planned_start).getTime();
    const end = new Date(s.planned_end).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= endOfToday && end >= startOfToday;
  }).length;

  const sectorMap = new Map<string, number>();
  for (const order of open) {
    const sector = order.sector?.trim() || order.work_center?.trim() || 'Sem setor/centro registrado';
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + 1);
  }

  const lotMap = new Map<string, number>();
  let blockedLots = 0;
  for (const lot of input.lots) {
    const remaining = num(lot.remaining_qty);
    if (remaining <= 0) continue;
    lotMap.set(lot.product_code, (lotMap.get(lot.product_code) ?? 0) + remaining);
    if (BLOCKED_QUALITY.has(lot.quality_status?.trim().toLowerCase() ?? '') || lot.status !== 'available') {
      blockedLots += 1;
    }
  }

  const shipMap = new Map<string, number>();
  for (const shipment of input.shipments) {
    if (!inWindow(shipment.created_at, now, shipmentDays)) continue;
    shipMap.set(shipment.product_code, (shipMap.get(shipment.product_code) ?? 0) + num(shipment.quantity));
  }

  const byQuantityDesc = (a: ProductQuantity, b: ProductQuantity) =>
    b.quantity - a.quantity || a.productCode.localeCompare(b.productCode);

  return {
    totalOrders: input.orders.length,
    openOrders: open.length,
    completedInWindow: completed.length,
    productionByUnit: [...byUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit)),
    qualityApprovalPct,
    qualitySampleSize: input.inspections.length,
    overdueOpenOrders: open.filter((order) => {
      if (!order.due_date) return false;
      const due = new Date(order.due_date).getTime();
      return Number.isFinite(due) && due < now.getTime();
    }).length,
    unscheduledOpenOrders,
    windowsToday,
    openBySector: [...sectorMap.entries()]
      .map(([sector, count]) => ({ sector, openOrders: count }))
      .sort((a, b) => b.openOrders - a.openOrders || a.sector.localeCompare(b.sector)),
    lotsByProduct: [...lotMap.entries()]
      .map(([productCode, quantity]) => ({ productCode, quantity }))
      .sort(byQuantityDesc),
    blockedLots,
    shippedByProduct: [...shipMap.entries()]
      .map(([productCode, quantity]) => ({ productCode, quantity }))
      .sort(byQuantityDesc),
  };
}
