import { supabase } from '@/integrations/supabase/client';
import { requireUuid } from '@/lib/store/intercompanyRelease';
import { allowedTrackingSectors, parseTrackingSectorAccess, sectorVocabulary, TRACKING_COLUMNS, TRACKING_PAGE_SIZE,
  trackingContextKey, trackingDateRange, type TrackingFilters, type TrackingRow, type TrackingScope, type TrackingSectorAccess } from './productionTrackingModel';

interface ReadResponse { data: unknown; error: { message: string } | null; count?: number | null }
export interface TrackingQuery extends PromiseLike<ReadResponse> {
  select(columns: string, options: { count: 'exact' }): TrackingQuery;
  eq(column: string, value: string): TrackingQuery;
  gte(column: string, value: string): TrackingQuery;
  lt(column: string, value: string): TrackingQuery;
  or(expression: string): TrackingQuery;
  order(column: string, options: { ascending: boolean }): TrackingQuery;
  range(from: number, to: number): TrackingQuery;
  abortSignal(signal: AbortSignal): TrackingQuery;
}
export interface TrackingClient {
  from(table: string): TrackingQuery;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<ReadResponse>;
}
const defaultClient = supabase as unknown as TrackingClient;
export interface TrackingPage { rows: TrackingRow[]; total: number | null; page: number; hasNext: boolean;
  contextKey: string; canonicalSectorScope: boolean; loadedAt: string }

function quoteFilter(value: string) { return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
function readRow(value: unknown, scope: TrackingScope, branchId: string | null, vocabulary: readonly string[] | null): TrackingRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OP com formato inválido.');
  const row = value as Record<string, unknown>;
  requireUuid(row.id, 'OP');
  if (row.company_id !== scope.companyId || (branchId !== null && row.branch_id !== branchId)) throw new Error('OP retornada fora do contexto.');
  for (const key of ['order_number', 'product_code', 'product_name', 'unit', 'status', 'priority', 'created_at', 'updated_at']) {
    if (typeof row[key] !== 'string') throw new Error(`Campo de OP inválido: ${key}.`);
  }
  for (const key of ['quantity', 'produced_quantity']) if (typeof row[key] !== 'number') throw new Error(`Quantidade de OP inválida: ${key}.`);
  if (row.rejected_quantity !== null && typeof row.rejected_quantity !== 'number') throw new Error('Rejeitado informado inválido.');
  for (const key of ['branch_id', 'sector', 'work_center', 'client_name', 'sales_order_id', 'start_date', 'due_date', 'completed_date']) {
    if (row[key] !== null && typeof row[key] !== 'string') throw new Error(`Campo opcional de OP inválido: ${key}.`);
  }
  if (vocabulary && !vocabulary.includes(String(row.sector))) throw new Error('OP com setor fora do recorte canônico.');
  return row as unknown as TrackingRow;
}

export async function readTrackingSectorAccess(scope: TrackingScope, signal?: AbortSignal, client: TrackingClient = defaultClient): Promise<TrackingSectorAccess> {
  requireUuid(scope.userId, 'Usuário'); requireUuid(scope.companyId, 'Empresa');
  if (scope.branchId !== null) requireUuid(scope.branchId, 'Unidade');
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  // my_sector_access is bound to get_user_company_id in the existing backend, not to the UI company.
  const backend = await client.rpc('get_user_company_id', { _user_id: scope.userId });
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  if (backend.error) throw new Error(`Empresa do servidor não confirmada: ${backend.error.message}`);
  if (backend.data !== scope.companyId) throw new Error('Empresa ativa difere da empresa usada pelo acesso setorial do servidor. Consulta bloqueada, sem troca automática.');
  const { data, error } = await client.rpc('my_sector_access');
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  if (error) throw new Error(`Acesso setorial indisponível: ${error.message}`);
  return parseTrackingSectorAccess(data);
}

/** Read-only production report. No changes to OP status/stock/fiscal are exposed here. */
export async function readProductionTrackingPage(scope: TrackingScope, filters: TrackingFilters, access: TrackingSectorAccess,
  page: number, signal?: AbortSignal, client: TrackingClient = defaultClient): Promise<TrackingPage> {
  requireUuid(scope.userId, 'Usuário'); requireUuid(scope.companyId, 'Empresa');
  if (!Number.isSafeInteger(page) || page < 0 || page > 100_000) throw new Error('Página inválida.');
  const branchId = scope.branchId ?? filters.branchId;
  if (branchId !== null) requireUuid(branchId, 'Unidade');
  if (scope.branchId && filters.branchId && scope.branchId !== filters.branchId) throw new Error('Unidade fora do contexto ativo.');
  const dates = trackingDateRange(filters);
  const allowed = allowedTrackingSectors(parseTrackingSectorAccess(access));
  if (allowed && allowed.length === 0) throw new Error('Nenhum setor autorizado para este acompanhamento.');
  if (filters.sector !== 'all' && allowed && !allowed.includes(filters.sector)) throw new Error('Setor não autorizado.');
  const sectors = filters.sector === 'all' ? allowed : [filters.sector];
  const vocabulary = sectors ? sectorVocabulary(sectors) : null;
  let query = client.from('production_orders').select(TRACKING_COLUMNS, { count: 'exact' })
    .eq('company_id', scope.companyId).gte('created_at', dates.from).lt('created_at', dates.before);
  if (branchId) query = query.eq('branch_id', branchId);
  for (const name of ['status', 'priority'] as const) if (filters[name] !== 'all') query = query.eq(name, filters[name]);
  const groups: string[] = [];
  const search = filters.search.trim();
  if (search.length > 120) throw new Error('Busca limitada a 120 caracteres.');
  if (search) {
    const pattern = quoteFilter('%' + search.replace(/[%_]/g, '\\$&') + '%');
    groups.push(`or(${['order_number', 'product_code', 'product_name', 'client_name'].map(key => `${key}.ilike.${pattern}`).join(',')})`);
  }
  if (vocabulary) groups.push(`or(${vocabulary.map(value => `sector.eq.${quoteFilter(value)}`).join(',')})`);
  if (groups.length) query = query.or(groups.length === 1 ? groups[0].slice(3, -1) : `and(${groups.join(',')})`);
  query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * TRACKING_PAGE_SIZE, (page + 1) * TRACKING_PAGE_SIZE - 1);
  if (signal) query = query.abortSignal(signal);
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  const { data, error, count } = await query;
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  if (error) throw new Error(`Falha na consulta de OPs: ${error.message}`);
  if (!Array.isArray(data) || data.length > TRACKING_PAGE_SIZE) throw new Error('Página de OPs inválida ou incompleta.');
  const rows = data.map(r => readRow(r, scope, branchId, vocabulary));
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('OP duplicada na mesma página.');
  const total = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
  const offset = page * TRACKING_PAGE_SIZE;
  if (total !== null && ((total < offset + rows.length && rows.length > 0)
    || (rows.length < TRACKING_PAGE_SIZE && total > offset + rows.length))) {
    throw new Error('Contagem inconsistente ou página truncada; atualize a leitura antes de navegar/exportar.');
  }
  return { rows, total, page, hasNext: total !== null ? (page + 1) * TRACKING_PAGE_SIZE < total : rows.length === TRACKING_PAGE_SIZE,
    contextKey: trackingContextKey(scope), canonicalSectorScope: vocabulary !== null, loadedAt: new Date().toISOString() };
}
