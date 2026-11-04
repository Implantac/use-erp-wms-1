export interface WipOrderInput {
  id: string;
  order_number: string;
  product_name: string;
  status: string;
  quantity: number;
  produced_quantity: number;
  unit: string;
  created_at: string;
}

export interface WipStepInput {
  production_order_id: string;
  sequence: number;
  status: string;
  started_at: string | null;
  created_at: string;
  step_name?: string;
  step_sector?: string | null;
}

export type WipAgeBucket = "0-2 dias" | "3-7 dias" | "8-15 dias" | "mais de 15 dias";

export const WIP_AGE_BUCKETS: WipAgeBucket[] = ["0-2 dias", "3-7 dias", "8-15 dias", "mais de 15 dias"];

export interface WipOrderRow {
  orderId: string;
  orderNumber: string;
  productName: string;
  status: string;
  currentStepName: string;
  currentStepSector: string | null;
  ageDays: number;
  daysInCurrentStep: number;
  remainingQty: number;
  unit: string;
  ageBucket: WipAgeBucket;
}

export interface WipStepGroup {
  stepName: string;
  orders: number;
  oldestAgeDays: number;
}

export interface WipPanelData {
  rows: WipOrderRow[];
  byStep: WipStepGroup[];
  byBucket: Array<{ bucket: WipAgeBucket; orders: number }>;
  totalOpen: number;
}

const CLOSED_STATUSES = new Set(["completed", "cancelled", "canceled"]);
const DAY_MS = 86_400_000;

export function wipAgeBucket(ageDays: number): WipAgeBucket {
  if (ageDays <= 2) return "0-2 dias";
  if (ageDays <= 7) return "3-7 dias";
  if (ageDays <= 15) return "8-15 dias";
  return "mais de 15 dias";
}

function daysBetween(fromIso: string, nowMs: number): number {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.floor((nowMs - from) / DAY_MS));
}

/**
 * Trabalho em processo (WIP) por etapa atual e idade da OP, calculado só de
 * dados reais (OPs abertas e suas etapas geradas). A etapa atual é a primeira
 * não concluída do roteiro; sem etapa gerada, a OP aparece como "sem etapa" —
 * nada é estimado.
 */
export function buildWipPanel(orders: WipOrderInput[], steps: WipStepInput[], nowMs: number): WipPanelData {
  const openOrders = orders.filter((order) => !CLOSED_STATUSES.has(order.status.toLowerCase()));
  const stepsByOrder = new Map<string, WipStepInput[]>();
  for (const step of steps) {
    const list = stepsByOrder.get(step.production_order_id) ?? [];
    list.push(step);
    stepsByOrder.set(step.production_order_id, list);
  }

  const rows: WipOrderRow[] = openOrders.map((order) => {
    const orderSteps = (stepsByOrder.get(order.id) ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    const current = orderSteps.find((step) => step.status.toLowerCase() !== "completed");
    const stepSince = current ? (current.started_at ?? current.created_at) : order.created_at;
    const ageDays = daysBetween(order.created_at, nowMs);
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      productName: order.product_name,
      status: order.status,
      currentStepName: current ? (current.step_name?.trim() || "Etapa sem nome") : (orderSteps.length > 0 ? "Aguardando conclusão da OP" : "Sem etapa gerada"),
      currentStepSector: current ? (current.step_sector ?? null) : null,
      ageDays,
      daysInCurrentStep: daysBetween(stepSince, nowMs),
      remainingQty: Math.max(0, (Number(order.quantity) || 0) - (Number(order.produced_quantity) || 0)),
      unit: order.unit,
      ageBucket: wipAgeBucket(ageDays),
    };
  });
  rows.sort((a, b) => b.ageDays - a.ageDays || a.orderNumber.localeCompare(b.orderNumber));

  const groupMap = new Map<string, WipStepGroup>();
  for (const row of rows) {
    const group = groupMap.get(row.currentStepName) ?? { stepName: row.currentStepName, orders: 0, oldestAgeDays: 0 };
    group.orders += 1;
    group.oldestAgeDays = Math.max(group.oldestAgeDays, row.ageDays);
    groupMap.set(row.currentStepName, group);
  }
  const byStep = [...groupMap.values()].sort((a, b) => b.orders - a.orders || b.oldestAgeDays - a.oldestAgeDays);
  const byBucket = WIP_AGE_BUCKETS.map((bucket) => ({
    bucket,
    orders: rows.filter((row) => row.ageBucket === bucket).length,
  }));

  return { rows, byStep, byBucket, totalOpen: rows.length };
}
