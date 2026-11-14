/** LOJ-05A: presentation/contract only. This is not fiscal authorization. */
export const INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED = false;
export const RELEASE_ACTIVATION_MESSAGE =
  'Ação preparada, mas não ativada operacionalmente. Nenhum pedido ou reserva será criado nesta versão candidata.';
export const LEGACY_RECEIPT_MESSAGE =
  'Recebimento intercompany indisponível: exige entrega identificada e conciliação do expedido (LOJ-06).';

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) throw new Error(`${label}: identificador inválido.`);
  return value;
}

export interface IntercompanyReleaseRow {
  id: string;
  request_id: string;
  company_id: string;
  branch_id: string | null;
  requesting_company_id: string;
  requesting_branch_id: string | null;
  production_order_id: string;
  completion_id: string;
  output_lot_id: string;
  stock_balance_id: string;
  sales_order_id: string;
  order_item_id: string;
  reservation_id: string;
  quantity: number;
  unit: string;
  release_status: 'reservada_bloqueada_fiscal';
  released_by: string;
  released_at: string;
}

export interface IntercompanyReleaseResult {
  id: string;
  status: 'producao_solicitada';
  release_id: string;
  release_status: 'reservada_bloqueada_fiscal';
  production_order_id: string;
  completion_id: string;
  output_lot_id: string;
  sales_order_id: string;
  reservation_id: string;
  quantity: number;
  unit: string;
  dispatch_enabled: false;
  idempotent_replay: boolean;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta de disponibilização inválida.');
  return value as Record<string, unknown>;
}

function quantityAndUnit(raw: Record<string, unknown>) {
  if (typeof raw.quantity !== 'number' || !Number.isFinite(raw.quantity) || raw.quantity <= 0
    || typeof raw.unit !== 'string' || !raw.unit.trim()) {
    throw new Error('Quantidade/unidade da disponibilização inválidas.');
  }
  return { quantity: raw.quantity, unit: raw.unit };
}

export function parseIntercompanyReleaseRow(value: unknown): IntercompanyReleaseRow {
  const r = object(value);
  const ids = ['id', 'request_id', 'company_id', 'requesting_company_id', 'production_order_id',
    'completion_id', 'output_lot_id', 'stock_balance_id', 'sales_order_id', 'order_item_id', 'reservation_id', 'released_by'];
  for (const key of ids) requireUuid(r[key], key);
  for (const key of ['branch_id', 'requesting_branch_id']) if (r[key] !== null) requireUuid(r[key], key);
  quantityAndUnit(r);
  if (r.release_status !== 'reservada_bloqueada_fiscal' || r.company_id === r.requesting_company_id
    || typeof r.released_at !== 'string' || !Number.isFinite(Date.parse(r.released_at))) {
    throw new Error('Lastro de disponibilização inconsistente.');
  }
  return r as unknown as IntercompanyReleaseRow;
}

export function parseIntercompanyReleaseResult(value: unknown, requestId: string): IntercompanyReleaseResult {
  const r = object(value);
  for (const key of ['id', 'release_id', 'production_order_id', 'completion_id', 'output_lot_id', 'sales_order_id', 'reservation_id']) {
    requireUuid(r[key], key);
  }
  quantityAndUnit(r);
  if (r.id !== requestId || r.status !== 'producao_solicitada'
    || r.release_status !== 'reservada_bloqueada_fiscal' || r.dispatch_enabled !== false
    || typeof r.idempotent_replay !== 'boolean') throw new Error('Retorno incompatível; resultado não confirmado. Atualize para reconciliar.');
  return r as unknown as IntercompanyReleaseResult;
}

export type ReleaseReadState = 'loading' | 'error' | 'incompatible' | 'inconsistent' | 'ready' | 'unavailable';
export class IntercompanyReleaseReadError extends Error {
  constructor(public readonly kind: 'error' | 'incompatible' | 'inconsistent', message: string) {
    super(message); this.name = 'IntercompanyReleaseReadError';
  }
}
export interface ReleasePresentationInput {
  requestId: string;
  productionOrderId?: string | null;
  productionStatus?: string | null;
  salesOrderId?: string | null;
  readState: ReleaseReadState;
  release?: IntercompanyReleaseRow;
}

export function releasePresentation(input: ReleasePresentationInput): { kind: string; label: string; canReview: boolean } {
  if (input.readState === 'loading') return { kind: 'loading', label: 'Consultando disponibilização…', canReview: false };
  if (input.readState === 'error') return { kind: 'error', label: 'Falha ao consultar disponibilização; resultado não confirmado.', canReview: false };
  if (input.readState === 'incompatible') return { kind: 'incompatible', label: 'Contrato de disponibilização indisponível ou incompatível no backend. Ação bloqueada.', canReview: false };
  if (input.readState === 'inconsistent') return { kind: 'inconsistent', label: 'Lastro inconsistente; conciliação individual necessária. Ação bloqueada.', canReview: false };
  if (input.readState === 'unavailable') return { kind: 'unavailable', label: 'Disponibilização não consultada neste contexto.', canReview: false };
  const r = input.release;
  if (r) {
    if (r.request_id !== input.requestId || (input.productionOrderId !== undefined && r.production_order_id !== input.productionOrderId)
      || (input.salesOrderId !== undefined && r.sales_order_id !== input.salesOrderId)) {
      return { kind: 'inconsistent', label: 'Vínculo inconsistente; conciliação individual necessária.', canReview: false };
    }
    return { kind: 'reserved', label: 'Pedido pendente · quantidade reservada · fiscal e expedição bloqueados', canReview: false };
  }
  if (!input.productionOrderId) return { kind: 'inconsistent', label: 'OP não identificada; conciliação individual necessária.', canReview: false };
  if (input.productionStatus === 'completed') return { kind: 'awaiting', label: 'OP concluída — aguardando disponibilização gerencial', canReview: true };
  return { kind: 'production', label: 'Produção solicitada — sem disponibilização visível neste contexto', canReview: false };
}

export function canReleaseInContext(input: {
  userId: string | null; companyId: string | null; rootCompanyId: string | null;
  roles: readonly { company_id: string; role: string }[]; rolesReady: boolean;
}): boolean {
  return isUuid(input.userId) && isUuid(input.companyId) && input.companyId === input.rootCompanyId
    && input.rolesReady && input.roles.some(r => r.company_id === input.companyId && ['admin', 'manager'].includes(r.role));
}

export function formatReleaseQuantity(quantity: unknown, unit?: string | null): string {
  const value = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity.toLocaleString('pt-BR') : 'Não apurada';
  return `${value} ${unit?.trim() || '(unidade não informada)'}`;
}
