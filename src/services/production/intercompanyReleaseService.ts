import { supabase } from '@/integrations/supabase/client';
import {
  IntercompanyReleaseReadError, parseIntercompanyReleaseResult, parseIntercompanyReleaseRow, requireUuid,
  type IntercompanyReleaseResult, type IntercompanyReleaseRow,
} from '@/lib/store/intercompanyRelease';

interface Response { data: unknown; error: { message: string; code?: string } | null }
export interface ReleaseQuery extends PromiseLike<Response> {
  select(columns: string): ReleaseQuery;
  in(column: string, values: readonly string[]): ReleaseQuery;
  eq(column: string, value: string): ReleaseQuery;
  or(filter: string): ReleaseQuery;
  abortSignal(signal: AbortSignal): ReleaseQuery;
}
export interface ReleaseClient {
  from(table: string): ReleaseQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Response>;
}
export interface ReleaseScope { userId: string; companyId: string; branchId: string | null; channel: string }
const defaultClient = supabase as unknown as ReleaseClient;
const COLUMNS = 'id,request_id,company_id,branch_id,requesting_company_id,requesting_branch_id,production_order_id,completion_id,output_lot_id,stock_balance_id,sales_order_id,order_item_id,reservation_id,quantity,unit,release_status,released_by,released_at';
const INCOMPATIBLE_CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

export function releaseScopeKey(scope: ReleaseScope): string {
  return JSON.stringify([scope.userId, scope.companyId, scope.branchId, scope.channel]);
}
function validateScope(scope: ReleaseScope) {
  requireUuid(scope.userId, 'Usuário'); requireUuid(scope.companyId, 'Empresa');
  if (scope.branchId !== null) requireUuid(scope.branchId, 'Unidade');
}
function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Consulta cancelada.');
}

/** Read-only, bounded batches. Missing/RLS-invisible records are not global proof of absence. */
export async function readIntercompanyReleases(
  scope: ReleaseScope, requestIds: readonly string[], signal?: AbortSignal, client: ReleaseClient = defaultClient,
): Promise<IntercompanyReleaseRow[]> {
  validateScope(scope); assertNotAborted(signal);
  const ids = [...new Set(requestIds.map(id => requireUuid(id, 'Solicitação')))].sort();
  const result: IntercompanyReleaseRow[] = [];
  for (let index = 0; index < ids.length; index += 80) {
    assertNotAborted(signal);
    const batch = ids.slice(index, index + 80);
    const filter = scope.branchId
      ? `and(company_id.eq.${scope.companyId},branch_id.eq.${scope.branchId}),and(requesting_company_id.eq.${scope.companyId},requesting_branch_id.eq.${scope.branchId})`
      : `company_id.eq.${scope.companyId},requesting_company_id.eq.${scope.companyId}`;
    let query = client.from('intercompany_production_releases').select(COLUMNS).in('request_id', batch).or(filter);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    assertNotAborted(signal);
    if (error) throw new IntercompanyReleaseReadError(error.code && INCOMPATIBLE_CODES.has(error.code) ? 'incompatible' : 'error', `Disponibilização indisponível: ${error.message}`);
    if (!Array.isArray(data)) throw new IntercompanyReleaseReadError('inconsistent', 'Consulta de disponibilização retornou formato inválido.');
    for (const raw of data) {
      let row: IntercompanyReleaseRow;
      try { row = parseIntercompanyReleaseRow(raw); }
      catch { throw new IntercompanyReleaseReadError('inconsistent', 'Contrato do lastro inconsistente; não é prova de ausência.'); }
      const inSource = row.company_id === scope.companyId && (!scope.branchId || row.branch_id === scope.branchId);
      const inDestination = row.requesting_company_id === scope.companyId && (!scope.branchId || row.requesting_branch_id === scope.branchId);
      if (!batch.includes(row.request_id) || (!inSource && !inDestination) || result.some(r => r.request_id === row.request_id)) {
        throw new IntercompanyReleaseReadError('inconsistent', 'Lastro fora do escopo ou duplicado; conciliação necessária.');
      }
      result.push(row);
    }
  }
  return result;
}

/** Mutation adapter only: exactly this RPC, no stock/reservation/OP writes or automatic retry. UI source-lock remains false. */
export async function finalizeIntercompanyProduction(
  requestId: string, client: ReleaseClient = defaultClient,
): Promise<IntercompanyReleaseResult> {
  requireUuid(requestId, 'Solicitação');
  const { data, error } = await client.rpc('finalize_intercompany_production', { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return parseIntercompanyReleaseResult(data, requestId);
}

export async function readReleaseRoles(scope: ReleaseScope, signal?: AbortSignal, client: ReleaseClient = defaultClient) {
  validateScope(scope); assertNotAborted(signal);
  // Server guards use the profile company, not the visual selection. Never switch it or infer equality.
  const backend = await client.rpc('get_user_company_id', { _user_id: scope.userId });
  assertNotAborted(signal);
  if (backend.error) throw new Error(`Empresa do servidor não confirmada: ${backend.error.message}`);
  if (backend.data !== scope.companyId) throw new Error('Empresa ativa difere da empresa usada pelo servidor; disponibilização bloqueada.');
  let query = client.from('user_roles').select('company_id,role').eq('user_id', scope.userId).eq('company_id', scope.companyId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  assertNotAborted(signal);
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Papéis não confirmados.');
  return data.map((r: unknown) => {
    if (!r || typeof r !== 'object' || !('company_id' in r) || !('role' in r)
      || r.company_id !== scope.companyId || typeof r.role !== 'string') throw new Error('Papel fora do contexto.');
    return { company_id: scope.companyId, role: r.role };
  });
}
