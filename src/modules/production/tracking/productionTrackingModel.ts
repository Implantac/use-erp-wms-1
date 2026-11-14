import { getOrderOverdueDays, getOrderProgress, productionOrderStatusLabel, productionOrderPriorityLabel } from '../productionOrders/orderPresentation';
import { SECTOR_LABELS, type SectorKind } from '@/lib/pcp/sectorProfiles';
import type { Tables } from '@/integrations/supabase/types';

export type TrackingRow = Pick<Tables<'production_orders'>,
  'id' | 'company_id' | 'branch_id' | 'order_number' | 'product_code' | 'product_name' | 'quantity' |
  'produced_quantity' | 'rejected_quantity' | 'unit' | 'status' | 'priority' | 'sector' | 'work_center' |
  'client_name' | 'sales_order_id' | 'start_date' | 'due_date' | 'completed_date' | 'created_at' | 'updated_at'>;
export interface TrackingFilters {
  start: string; end: string; search: string; status: string; priority: string; sector: SectorKind | 'all'; branchId: string | null;
}
export interface TrackingScope { userId: string; companyId: string; branchId: string | null; channel: string }
export interface TrackingSectorAccess { is_admin: boolean; enforced: boolean; access: Partial<Record<SectorKind, string>> }
export const TRACKING_PAGE_SIZE = 50;
export const TRACKING_COLUMNS = 'id,company_id,branch_id,order_number,product_code,product_name,quantity,produced_quantity,rejected_quantity,unit,status,priority,sector,work_center,client_name,sales_order_id,start_date,due_date,completed_date,created_at,updated_at';
export const SECTOR_KEYS = Object.keys(SECTOR_LABELS) as SectorKind[];
export const CANONICAL_SECTOR_NOTE = 'Recorte setorial por código/nome canônico exato. Textos legados com outra classificação não estão incluídos; o filtro não é prova de RLS.';

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function defaultTrackingFilters(now = new Date()): TrackingFilters {
  const start = new Date(now); start.setDate(start.getDate() - 29);
  return { start: localDay(start), end: localDay(now), search: '', status: 'all', priority: 'all', sector: 'all', branchId: null };
}
function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Informe datas válidas para a criação da OP.');
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime()) || localDay(date) !== value) throw new Error('Data de criação da OP inválida.');
  return date;
}
export function trackingDateRange(filters: Pick<TrackingFilters, 'start' | 'end'>) {
  const start = parseDay(filters.start); const end = parseDay(filters.end);
  if (start > end) throw new Error('A data inicial deve ser anterior ou igual à final.');
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), before: end.toISOString() };
}
export function trackingContextKey(scope: TrackingScope) {
  return JSON.stringify([scope.userId, scope.companyId, scope.branchId, scope.channel]);
}
export function parseTrackingSectorAccess(value: unknown): TrackingSectorAccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Acesso setorial não confirmado.');
  const r = value as Record<string, unknown>;
  if (typeof r.is_admin !== 'boolean' || typeof r.enforced !== 'boolean' || !r.access || typeof r.access !== 'object' || Array.isArray(r.access)) {
    throw new Error('Contrato de acesso setorial inválido.');
  }
  for (const [key, level] of Object.entries(r.access)) {
    if (!SECTOR_KEYS.includes(key as SectorKind) || !['viewer', 'operator', 'manager'].includes(String(level))) throw new Error('Permissão setorial desconhecida.');
  }
  return r as unknown as TrackingSectorAccess;
}
export function allowedTrackingSectors(access: TrackingSectorAccess): SectorKind[] | null {
  return access.is_admin || !access.enforced ? null : SECTOR_KEYS.filter(key => access.access[key] !== undefined);
}
export function sectorVocabulary(sectors: readonly SectorKind[]) {
  // Exact canonical values only: never match another sector by a broad substring.
  return [...new Set(sectors.flatMap(key => [key, SECTOR_LABELS[key]]))];
}
export function trackingQuantityIssues(row: TrackingRow): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(row.quantity) || row.quantity <= 0) issues.push('Planejado inválido ou não positivo');
  if (!Number.isFinite(row.produced_quantity) || row.produced_quantity < 0) issues.push('Produzido inválido ou negativo');
  if (Number.isFinite(row.quantity) && Number.isFinite(row.produced_quantity) && row.produced_quantity > row.quantity) issues.push('Produzido acima do planejado');
  if (row.rejected_quantity !== null && (!Number.isFinite(row.rejected_quantity) || row.rejected_quantity < 0)) issues.push('Rejeitado informado inválido ou negativo');
  if (!row.unit?.trim()) issues.push('Unidade de medida não informada');
  return issues;
}
export function trackingProgress(row: TrackingRow) {
  const progress = getOrderProgress(row);
  if (progress !== null) return { percent: progress, label: `${progress}% produzido/planejado` };
  const above = Number.isFinite(row.quantity) && row.quantity > 0 && Number.isFinite(row.produced_quantity) && row.produced_quantity > row.quantity;
  return { percent: null, label: above ? 'Acima do planejado — conferir' : 'Não apurado — conferir quantidades' };
}
export function displayTrackingNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) : 'Não apurado';
}
export function trackingPageSummary(rows: readonly TrackingRow[], now = new Date()) {
  return { total: rows.length, inProgress: rows.filter(r => r.status === 'in_progress').length,
    completed: rows.filter(r => r.status === 'completed').length, late: rows.filter(r => getOrderOverdueDays(r, now) > 0).length };
}

function csvCell(value: unknown): string {
  let text: string;
  if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : 'Não apurado';
  else {
    text = value == null ? '' : String(value);
    if (/^[\t\r\n]/.test(text) || /^[\s\uFEFF\u200B-\u200D]*[=+\-@]/.test(text)) text = `'${text}`;
  }
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function buildTrackingCsv(rows: readonly TrackingRow[]): string {
  const headers = ['OP', 'SKU', 'Produto', 'Cliente', 'Empresa (ID)', 'Unidade operacional (ID)', 'Setor', 'Centro',
    'Planejado', 'Produzido registrado', 'Rejeitado informado', 'Unidade de medida', 'Status', 'Prioridade', 'Início', 'Prazo', 'Conclusão', 'Criação', 'Conferência das quantidades'];
  const values = rows.map(r => [r.order_number, r.product_code, r.product_name, r.client_name, r.company_id, r.branch_id, r.sector, r.work_center,
    r.quantity, r.produced_quantity, r.rejected_quantity === null ? 'Não informado' : r.rejected_quantity, r.unit || 'Não informada',
    productionOrderStatusLabel(r.status), productionOrderPriorityLabel(r.priority), r.start_date, r.due_date, r.completed_date, r.created_at,
    trackingQuantityIssues(r).join(' | ') || 'Sem inconsistência quantitativa detectada nesta leitura']);
  return '\uFEFF' + [headers, ...values].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
