export interface NetMrpOrder {
  id: string;
  productId: string | null;
  quantity: number;
  producedQuantity: number;
  /** Frozen BOM snapshot captured on the OP; when present it takes precedence over the current product BOM. */
  bomLines?: NetMrpBomLine[];
}

export interface NetMrpBomLine {
  productId: string;
  componentId: string;
  quantity: number;
  wastePercentage: number | null;
}

export interface NetMrpProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  minStock: number | null;
  standardBatchSize: number | null;
  leadTimeDays: number | null;
}

export interface NetMrpBalance {
  productId: string;
  quantity: number;
  reservedQty: number;
  stockStatus: string | null;
  qualityKnown: boolean;
}

export interface NetMrpPurchaseLine {
  productId: string;
  quantity: number;
  receivedQuantity: number;
  status: string;
  expectedDelivery: string | null;
}

export interface NetMrpInput {
  orders: NetMrpOrder[];
  bomLines: NetMrpBomLine[];
  products: NetMrpProduct[];
  balances: NetMrpBalance[];
  purchases: NetMrpPurchaseLine[];
  requirementDate?: string | null;
}

export interface NetMaterialNeed {
  componentId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  grossRequirement: number;
  physicalStock: number;
  reserved: number;
  blockedOrUnverified: number;
  available: number;
  onOrder: number;
  draftPurchase: number;
  safetyStock: number;
  netRequirement: number;
  suggestedPurchase: number;
  leadTimeDays: number | null;
  earliestOpenDelivery: string | null;
  requirementDate: string | null;
  lateRisk: boolean;
  relatedOPs: string[];
  status: 'ok' | 'partial' | 'critical' | 'unverified';
}

export interface OrderMaterialCoverage {
  orderId: string;
  grossRequirement: number;
  availableCoverage: number;
  coveragePct: number | null;
  ready: boolean;
  missingComponents: number;
}

const OPEN_PURCHASE_STATUSES = new Set(['sent', 'confirmed', 'approved', 'partial', 'partially_received']);
const DRAFT_PURCHASE_STATUSES = new Set(['draft', 'pending_approval']);

function positive(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundUpToBatch(quantity: number, batchSize: number | null): number {
  const batch = positive(batchSize);
  if (quantity <= 0) return 0;
  if (batch <= 0) return quantity;
  return Math.ceil(quantity / batch) * batch;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function calculateNetMaterialNeeds(input: NetMrpInput): NetMaterialNeed[] {
  const products = new Map(input.products.map((product) => [product.id, product]));
  const grossByComponent = new Map<string, { quantity: number; orders: Set<string> }>();

  for (const order of input.orders) {
    if (!order.productId) continue;
    const remaining = Math.max(0, order.quantity - order.producedQuantity);
    if (remaining <= 0) continue;
    const orderLines = order.bomLines?.length ? order.bomLines : input.bomLines;
    for (const line of orderLines) {
      if (line.productId !== order.productId) continue;
      const gross = remaining * line.quantity * (1 + positive(line.wastePercentage) / 100);
      const current = grossByComponent.get(line.componentId) ?? { quantity: 0, orders: new Set<string>() };
      current.quantity += gross;
      current.orders.add(order.id);
      grossByComponent.set(line.componentId, current);
    }
  }

  const result: NetMaterialNeed[] = [];
  for (const [componentId, gross] of grossByComponent) {
    const product = products.get(componentId);
    if (!product) continue;
    const balances = input.balances.filter((balance) => balance.productId === componentId);
    const physicalStock = balances.reduce((sum, balance) => sum + Math.max(0, balance.quantity), 0);
    const reserved = balances.reduce((sum, balance) => sum + Math.max(0, Math.min(balance.reservedQty, balance.quantity)), 0);
    const blockedOrUnverified = balances.reduce((sum, balance) => {
      const normalizedStatus = (balance.stockStatus ?? '').toLowerCase();
      const isBlocked = normalizedStatus !== '' && normalizedStatus !== 'available';
      return sum + (isBlocked || !balance.qualityKnown ? Math.max(0, balance.quantity - balance.reservedQty) : 0);
    }, 0);
    const available = Math.max(0, physicalStock - reserved - blockedOrUnverified);
    const openPurchases = input.purchases.filter(
      (purchase) => purchase.productId === componentId && OPEN_PURCHASE_STATUSES.has(purchase.status),
    );
    const draftPurchases = input.purchases.filter(
      (purchase) => purchase.productId === componentId && DRAFT_PURCHASE_STATUSES.has(purchase.status),
    );
    const onOrder = openPurchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.quantity - purchase.receivedQuantity),
      0,
    );
    const draftPurchase = draftPurchases.reduce(
      (sum, purchase) => sum + Math.max(0, purchase.quantity - purchase.receivedQuantity),
      0,
    );
    const safetyStock = positive(product.minStock);
    const netRequirement = Math.max(0, gross.quantity + safetyStock - available - onOrder);
    const earliestOpenDelivery = openPurchases
      .map((purchase) => purchase.expectedDelivery)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null;
    const projectedArrival = product.leadTimeDays !== null && Number.isFinite(product.leadTimeDays)
      ? addDays(new Date(), product.leadTimeDays)
      : null;
    const requirementDate = input.requirementDate ?? null;
    const lateRisk = Boolean(
      netRequirement > 0 && requirementDate && projectedArrival && projectedArrival > new Date(requirementDate),
    );
    const hasKnownBalance = balances.length > 0 && balances.every((balance) => balance.qualityKnown);
    const status: NetMaterialNeed['status'] = !hasKnownBalance
      ? 'unverified'
      : netRequirement <= 0
        ? 'ok'
        : available + onOrder > 0
          ? 'partial'
          : 'critical';

    result.push({
      componentId,
      materialCode: product.code,
      materialName: product.name,
      unit: product.unit,
      grossRequirement: gross.quantity,
      physicalStock,
      reserved,
      blockedOrUnverified,
      available,
      onOrder,
      draftPurchase,
      safetyStock,
      netRequirement,
      suggestedPurchase: roundUpToBatch(netRequirement, product.standardBatchSize),
      leadTimeDays: product.leadTimeDays,
      earliestOpenDelivery,
      requirementDate,
      lateRisk,
      relatedOPs: [...gross.orders],
      status,
    });
  }

  return result.sort((a, b) => b.netRequirement - a.netRequirement || a.materialCode.localeCompare(b.materialCode));
}

export function getOrderNetCoverage(
  order: NetMrpOrder,
  bomLines: NetMrpBomLine[],
  needs: NetMaterialNeed[],
): OrderMaterialCoverage {
  const remaining = Math.max(0, order.quantity - order.producedQuantity);
  const lines = order.productId
    ? (order.bomLines?.length ? order.bomLines : bomLines.filter((line) => line.productId === order.productId))
    : [];
  if (!order.productId || remaining <= 0 || lines.length === 0) {
    return { orderId: order.id, grossRequirement: 0, availableCoverage: 0, coveragePct: null, ready: false, missingComponents: lines.length };
  }

  let grossRequirement = 0;
  let coveredRequirement = 0;
  let missingComponents = 0;
  for (const line of lines) {
    const need = needs.find((candidate) => candidate.componentId === line.componentId);
    const requirement = remaining * line.quantity * (1 + positive(line.wastePercentage) / 100);
    grossRequirement += requirement;
    if (!need) {
      missingComponents += 1;
      continue;
    }
    const componentShare = need.grossRequirement > 0 ? requirement / need.grossRequirement : 0;
    coveredRequirement += Math.min(requirement, (need.available + need.onOrder) * componentShare);
    if (need.netRequirement > 0) missingComponents += 1;
  }

  const coveragePct = grossRequirement > 0 ? Math.min(100, (coveredRequirement / grossRequirement) * 100) : null;
  return {
    orderId: order.id,
    grossRequirement,
    availableCoverage: coveredRequirement,
    coveragePct,
    ready: missingComponents === 0 && coveragePct !== null,
    missingComponents,
  };
}
