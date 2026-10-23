import { supabase } from '@/integrations/supabase/client';
import type { SectorKind } from '@/lib/pcp/sectorProfiles';

interface RpcResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

interface RpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse<unknown>>;
}

interface LooseResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

interface LooseQuery<T> extends PromiseLike<LooseResponse<T>> {
  select: (columns?: string) => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  in: (column: string, values: unknown[]) => LooseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery<T>;
  limit: (count: number) => LooseQuery<T>;
  maybeSingle: () => Promise<LooseResponse<T>>;
  single: () => Promise<LooseResponse<T>>;
}

interface LooseClient {
  from<T>(table: string): LooseQuery<T>;
}

const rpcClient = supabase as unknown as RpcClient;
const looseClient = supabase as unknown as LooseClient;

export interface MaterialAllocationInput {
  component_id: string;
  lot_id: string;
  quantity: number;
}

export interface WeavingProfileInput {
  loom_resource_id?: string | null;
  machine_id?: string | null;
  work_center?: string | null;
  warp_product_id?: string | null;
  weft_product_id?: string | null;
  warp_lot_id?: string | null;
  weft_lot_id?: string | null;
  beam_code?: string | null;
  reed_code?: string | null;
  picks_per_cm?: number | null;
  warp_thread_count?: number | null;
  planned_width_cm?: number | null;
  planned_length_m?: number | null;
  setup_minutes?: number | null;
  notes?: string | null;
}

export interface WeavingOrderProfileRow extends Required<Omit<WeavingProfileInput, 'notes'>> {
  id: string;
  company_id: string;
  production_order_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeavingEventRow {
  id: string;
  production_order_id: string;
  production_order_step_id: string | null;
  machine_id: string | null;
  resource_id: string | null;
  event_type: string;
  quantity_m: number | null;
  downtime_minutes: number | null;
  reason: string | null;
  operator_name: string | null;
  deviation_category: string | null;
  cause_status: string | null;
  occurred_at: string;
}

export interface ProductionMaterialReservationRow {
  id: string;
  production_order_id: string;
  component_id: string;
  lot_id: string;
  stock_balance_id: string | null;
  requested_qty: number;
  reserved_qty: number;
  consumed_qty: number;
  released_qty: number;
  status: string;
  reserved_at: string;
}

export interface ProductionLotGenealogyRow {
  id: string;
  production_order_id: string;
  input_lot_id: string;
  output_lot_id: string;
  input_quantity: number;
  output_quantity: number;
  input_unit: string;
  output_unit: string;
  conversion_reference: string | null;
  created_at: string;
}

export interface CreateTextileProductionOrderInput {
  productId: string;
  quantity: number;
  idempotencyKey: string;
  priority?: string;
  dueDate?: string | null;
  workCenter?: string | null;
  salesOrderId?: string | null;
  orderItemId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  weavingProfile?: WeavingProfileInput;
}

export interface ScheduleProductionOrderInput {
  productionOrderId: string;
  plannedStart: string;
  plannedEnd: string;
  idempotencyKey: string;
  resourceId?: string | null;
  machineId?: string | null;
  workCenter?: string | null;
  sector?: string | null;
  shift?: string;
}

export interface StepProgressInput {
  productionOrderStepId: string;
  action: 'start' | 'progress' | 'pause' | 'complete';
  producedQuantity?: number;
  rejectedQuantity?: number;
  operatorName?: string | null;
  notes?: string | null;
  resourceId?: string | null;
  machineId?: string | null;
  workCenter?: string | null;
  shift?: string | null;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function assertData<T>(response: LooseResponse<T>, fallback: string): T {
  if (response.error) throw new Error(response.error.message || fallback);
  return response.data as T;
}

export function createClientIdempotencyKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function createTextileProductionOrder(input: CreateTextileProductionOrderInput) {
  return callRpc<Record<string, unknown>>('create_textile_production_order', {
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_idempotency_key: input.idempotencyKey,
    p_priority: input.priority ?? 'medium',
    p_due_date: input.dueDate ?? null,
    p_work_center: input.workCenter ?? null,
    p_sales_order_id: input.salesOrderId ?? null,
    p_order_item_id: input.orderItemId ?? null,
    p_client_id: input.clientId ?? null,
    p_client_name: input.clientName ?? null,
    p_weaving_profile: input.weavingProfile ?? {},
  });
}

export async function completeProductionOrder(input: {
  productionOrderId: string;
  idempotencyKey: string;
  producedQuantity: number;
  rejectedQuantity: number;
  allocations: MaterialAllocationInput[];
  outputLotNumber?: string | null;
}) {
  return callRpc<Record<string, unknown>>('complete_production_order', {
    p_production_order_id: input.productionOrderId,
    p_idempotency_key: input.idempotencyKey,
    p_produced_quantity: input.producedQuantity,
    p_rejected_quantity: input.rejectedQuantity,
    p_input_allocations: input.allocations,
    p_output_lot_number: input.outputLotNumber ?? null,
  });
}

export async function reserveProductionMaterials(
  productionOrderId: string,
  allocations: MaterialAllocationInput[],
  idempotencyKey: string,
) {
  return callRpc<Record<string, unknown>>('reserve_production_materials', {
    p_production_order_id: productionOrderId,
    p_allocations: allocations,
    p_idempotency_key: idempotencyKey,
  });
}

export async function releaseProductionMaterialReservation(reservationId: string, quantity?: number, reason?: string) {
  return callRpc<Record<string, unknown>>('release_production_material_reservation', {
    p_reservation_id: reservationId,
    p_quantity: quantity ?? null,
    p_reason: reason ?? null,
  });
}

export async function scheduleProductionOrder(input: ScheduleProductionOrderInput) {
  return callRpc<Record<string, unknown>>('schedule_production_order', {
    p_production_order_id: input.productionOrderId,
    p_planned_start: input.plannedStart,
    p_planned_end: input.plannedEnd,
    p_idempotency_key: input.idempotencyKey,
    p_resource_id: input.resourceId ?? null,
    p_machine_id: input.machineId ?? null,
    p_work_center: input.workCenter ?? null,
    p_sector: input.sector ?? null,
    p_shift: input.shift ?? 'diurno',
  });
}

export async function cancelProductionSchedule(scheduleId: string) {
  return callRpc<Record<string, unknown>>('cancel_production_schedule', { p_schedule_id: scheduleId });
}

export async function recordProductionStepProgress(input: StepProgressInput) {
  return callRpc<Record<string, unknown>>('record_production_step_progress', {
    p_production_order_step_id: input.productionOrderStepId,
    p_action: input.action,
    p_produced_quantity: input.producedQuantity ?? 0,
    p_rejected_quantity: input.rejectedQuantity ?? 0,
    p_operator_name: input.operatorName ?? null,
    p_notes: input.notes ?? null,
    p_resource_id: input.resourceId ?? null,
    p_machine_id: input.machineId ?? null,
    p_work_center: input.workCenter ?? null,
    p_shift: input.shift ?? null,
  });
}

export async function upsertWeavingOrderProfile(productionOrderId: string, profile: WeavingProfileInput) {
  return callRpc<Record<string, unknown>>('upsert_weaving_order_profile', {
    p_production_order_id: productionOrderId,
    p_profile: profile,
  });
}

export async function recordWeavingEvent(input: {
  productionOrderId: string;
  eventType: string;
  productionOrderStepId?: string | null;
  machineId?: string | null;
  resourceId?: string | null;
  quantityM?: number | null;
  downtimeMinutes?: number | null;
  reason?: string | null;
  operatorName?: string | null;
  deviationCategory?: string | null;
  causeStatus?: string | null;
}) {
  return callRpc<Record<string, unknown>>('record_weaving_event', {
    p_production_order_id: input.productionOrderId,
    p_event_type: input.eventType,
    p_production_order_step_id: input.productionOrderStepId ?? null,
    p_machine_id: input.machineId ?? null,
    p_resource_id: input.resourceId ?? null,
    p_quantity_m: input.quantityM ?? null,
    p_downtime_minutes: input.downtimeMinutes ?? null,
    p_reason: input.reason ?? null,
    p_operator_name: input.operatorName ?? null,
    p_deviation_category: input.deviationCategory ?? null,
    p_cause_status: input.causeStatus ?? null,
  });
}

export async function decideProductionQualityInspection(
  inspectionId: string,
  status: 'open' | 'approved' | 'rejected' | 'quarantine',
  correctiveAction?: string | null,
  notes?: string | null,
) {
  return callRpc<Record<string, unknown>>('decide_production_quality_inspection', {
    p_inspection_id: inspectionId,
    p_status: status,
    p_corrective_action: correctiveAction ?? null,
    p_notes: notes ?? null,
  });
}

export async function generateMrpPurchaseOrder(input: {
  items: Array<{ component_id: string; quantity: number; unit_price?: number | null }>;
  idempotencyKey: string;
  supplierId?: string | null;
  supplierName?: string | null;
  expectedDelivery?: string | null;
  priority?: string;
}) {
  return callRpc<Record<string, unknown>>('generate_mrp_purchase_order', {
    p_items: input.items,
    p_idempotency_key: input.idempotencyKey,
    p_supplier_id: input.supplierId ?? null,
    p_supplier_name: input.supplierName ?? null,
    p_expected_delivery: input.expectedDelivery ?? null,
    p_priority: input.priority ?? 'medium',
  });
}

export async function fetchWeavingOrderProfile(productionOrderId: string) {
  const response = await looseClient
    .from<WeavingOrderProfileRow | null>('weaving_order_profiles')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .maybeSingle();
  return assertData<WeavingOrderProfileRow | null>(response, 'Erro ao carregar perfil de tecelagem');
}

export async function fetchWeavingEvents(productionOrderId: string) {
  const response = await looseClient
    .from<WeavingEventRow[]>('weaving_production_events')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  return assertData<WeavingEventRow[]>(response, 'Erro ao carregar eventos de tecelagem') ?? [];
}

export async function fetchProductionMaterialReservations(productionOrderId: string) {
  const response = await looseClient
    .from<ProductionMaterialReservationRow[]>('production_material_reservations')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .order('reserved_at', { ascending: false });
  return assertData<ProductionMaterialReservationRow[]>(response, 'Erro ao carregar reservas de materiais') ?? [];
}

export async function fetchProductionLotGenealogy(productionOrderId: string) {
  const response = await looseClient
    .from<ProductionLotGenealogyRow[]>('production_lot_genealogy')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .order('created_at', { ascending: false });
  return assertData<ProductionLotGenealogyRow[]>(response, 'Erro ao carregar genealogia da OP') ?? [];
}

// ---------------------------------------------------------------------------
// Perfis técnicos e eventos por setor (fiação, malharia, tinturaria).
// A tecelagem mantém as tabelas/RPCs próprias (weaving_*); os demais setores
// usam upsert_sector_order_profile / record_sector_event (migration
// 20261019180000). Nenhum parâmetro de processo é presumido no front.
// ---------------------------------------------------------------------------

export type SectorProfileKind = 'fiacao' | 'malharia' | 'tinturaria' | 'beneficiamento';

export interface SectorOrderProfileRow {
  id: string;
  company_id: string;
  production_order_id: string;
  machine_id: string | null;
  work_center: string | null;
  notes: string | null;
  // fiação
  target_title?: string | null;
  twist_per_m?: number | null;
  // malharia
  gauge?: string | null;
  diameter_cm?: number | null;
  target_grammage_g_m2?: number | null;
  target_width_cm?: number | null;
  // tinturaria
  color_name?: string | null;
  color_code?: string | null;
  bath_ratio?: number | null;
  batch_code?: string | null;
  lab_l?: number | null;
  lab_a?: number | null;
  lab_b?: number | null;
  measured_lab_l?: number | null;
  measured_lab_a?: number | null;
  measured_lab_b?: number | null;
  // beneficiamento
  process_type?: string | null;
  target_shrinkage_pct?: number | null;
  temperature_c?: number | null;
  speed_m_min?: number | null;
  planned_output_m?: number | null;
  // comum
  planned_output_kg?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SectorEventRow {
  id: string;
  production_order_id: string;
  sector: string;
  production_order_step_id: string | null;
  machine_id: string | null;
  resource_id: string | null;
  event_type: string;
  quantity: number | null;
  downtime_minutes: number | null;
  reason: string | null;
  operator_name: string | null;
  deviation_category: string | null;
  cause_status: string | null;
  occurred_at: string;
}

const SECTOR_PROFILE_TABLES: Record<SectorProfileKind, string> = {
  fiacao: 'spinning_order_profiles',
  malharia: 'knitting_order_profiles',
  tinturaria: 'dyeing_order_profiles',
  beneficiamento: 'beneficiamento_order_profiles',
};

export async function upsertSectorOrderProfile(
  productionOrderId: string,
  sector: SectorProfileKind,
  profile: Record<string, unknown>,
) {
  return callRpc<Record<string, unknown>>('upsert_sector_order_profile', {
    p_production_order_id: productionOrderId,
    p_sector: sector,
    p_profile: profile,
  });
}

export async function recordSectorEvent(input: {
  productionOrderId: string;
  sector: SectorProfileKind;
  eventType: string;
  productionOrderStepId?: string | null;
  machineId?: string | null;
  resourceId?: string | null;
  quantity?: number | null;
  downtimeMinutes?: number | null;
  reason?: string | null;
  operatorName?: string | null;
  deviationCategory?: string | null;
  causeStatus?: string | null;
}) {
  return callRpc<Record<string, unknown>>('record_sector_event', {
    p_production_order_id: input.productionOrderId,
    p_sector: input.sector,
    p_event_type: input.eventType,
    p_production_order_step_id: input.productionOrderStepId ?? null,
    p_machine_id: input.machineId ?? null,
    p_resource_id: input.resourceId ?? null,
    p_quantity: input.quantity ?? null,
    p_downtime_minutes: input.downtimeMinutes ?? null,
    p_reason: input.reason ?? null,
    p_operator_name: input.operatorName ?? null,
    p_deviation_category: input.deviationCategory ?? null,
    p_cause_status: input.causeStatus ?? null,
  });
}

export async function fetchSectorOrderProfile(productionOrderId: string, sector: SectorProfileKind) {
  const response = await looseClient
    .from<SectorOrderProfileRow | null>(SECTOR_PROFILE_TABLES[sector])
    .select('*')
    .eq('production_order_id', productionOrderId)
    .maybeSingle();
  return assertData<SectorOrderProfileRow | null>(response, 'Erro ao carregar perfil do setor');
}

export async function fetchSectorEvents(productionOrderId: string) {
  const response = await looseClient
    .from<SectorEventRow[]>('sector_production_events')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  return assertData<SectorEventRow[]>(response, 'Erro ao carregar eventos do setor') ?? [];
}

/** Evento mínimo para os indicadores setoriais (tecelagem usa a tabela própria). */
export interface SectorIndicatorEventRow {
  production_order_id: string;
  event_type: string;
  downtime_minutes: number | null;
  deviation_category: string | null;
  machine_id: string | null;
  occurred_at: string;
}

export async function fetchSectorIndicatorEvents(
  companyId: string,
  kind: SectorKind,
  weavingOrderIds: readonly string[],
): Promise<SectorIndicatorEventRow[]> {
  if (kind === 'tecelagem') {
    if (weavingOrderIds.length === 0) return [];
    const response = await looseClient
      .from<SectorIndicatorEventRow[]>('weaving_production_events')
      .select('production_order_id, event_type, downtime_minutes, deviation_category, machine_id, occurred_at')
      .eq('company_id', companyId)
      .in('production_order_id', [...weavingOrderIds])
      .order('occurred_at', { ascending: false })
      .limit(1000);
    return assertData<SectorIndicatorEventRow[]>(response, 'Erro ao carregar eventos para indicadores') ?? [];
  }
  const response = await looseClient
    .from<SectorIndicatorEventRow[]>('sector_production_events')
    .select('production_order_id, event_type, downtime_minutes, deviation_category, machine_id, occurred_at')
    .eq('company_id', companyId)
    .eq('sector', kind)
    .order('occurred_at', { ascending: false })
    .limit(1000);
  return assertData<SectorIndicatorEventRow[]>(response, 'Erro ao carregar eventos para indicadores') ?? [];
}
