import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { readProductionTrackingPage, readTrackingSectorAccess, type TrackingClient, type TrackingQuery } from './productionTrackingService';
import { defaultTrackingFilters } from './productionTrackingModel';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { userId: id(1), companyId: id(2), branchId: null as string | null, channel: 'CONSOLIDADO' };
const filters = defaultTrackingFilters(new Date('2026-11-04T12:00:00Z'));
const access = { is_admin: false, enforced: false, access: {} };
const fixture = { id: id(3), company_id: id(2), branch_id: null, order_number: 'OP-1', product_code: 'TEC-1', product_name: 'Tecido', quantity: 100,
  produced_quantity: 50, rejected_quantity: null, unit: 'm', status: 'in_progress', priority: 'high', sector: 'tecelagem', work_center: null,
  client_name: null, sales_order_id: null, start_date: null, due_date: null, completed_date: null, created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T10:00:00Z' };
function clientWith(data: unknown, count: number | null = null, error: { message: string; code?: string } | null = null) {
  const calls: [string, ...unknown[]][] = [];
  const query = { select: (x: string, y: unknown) => { calls.push(['select', x, y]); return query; },
    eq: (x: string, y: string) => { calls.push(['eq', x, y]); return query; },
    gte: (x: string, y: string) => { calls.push(['gte', x, y]); return query; },
    lt: (x: string, y: string) => { calls.push(['lt', x, y]); return query; },
    or: (x: string) => { calls.push(['or', x]); return query; },
    order: (x: string, y: unknown) => { calls.push(['order', x, y]); return query; },
    range: (x: number, y: number) => { calls.push(['range', x, y]); return query; }, abortSignal: () => query,
    then: (resolve: (r: { data: unknown; error: { message: string } | null; count: number | null }) => unknown) => Promise.resolve({ data, error, count }).then(resolve) } as TrackingQuery;
  const client: TrackingClient = { from: vi.fn((name: string) => { calls.push(['from', name]); return query; }), rpc: vi.fn(async (name: string) => name === 'get_user_company_id' ? { data: id(2), error: null } : { data, error }) };
  return { client, calls };
}
describe('production tracking read service', () => {
  it('reads exact company, created date range, deterministic page and exact count; no invented channel column', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...fixture, id: id(100 + i) }));
    const { client, calls } = clientWith(page, 101);
    const result = await readProductionTrackingPage(scope, filters, access, 0, undefined, client);
    expect(result.total).toBe(101); expect(result.rows).toHaveLength(50); expect(result.hasNext).toBe(true);
    expect(calls).toContainEqual(['eq', 'company_id', id(2)]); expect(calls).toContainEqual(['range', 0, 49]);
    expect(calls.filter(c => c[0] === 'order').map(c => c[1])).toEqual(['created_at', 'id']);
    expect(JSON.stringify(calls)).not.toContain('canal_operacional'); expect(client.rpc).not.toHaveBeenCalled();
  });
  it('requests the second page instead of silently limiting the report to the first 50', async () => {
    const { client, calls } = clientWith([{ ...fixture, id: id(4) }], 51);
    const result = await readProductionTrackingPage(scope, filters, access, 1, undefined, client);
    expect(calls).toContainEqual(['range', 50, 99]); expect(result.hasNext).toBe(false); expect(result.total).toBe(51);
  });
  it('keeps a missing count unavailable rather than assigning page length to global total', async () => {
    const result = await readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith([fixture], null).client);
    expect(result.total).toBeNull();
  });
  it('applies exact active branch and rejects an attempted alternate unit', async () => {
    const s = { ...scope, branchId: id(5) }; const { client, calls } = clientWith([{ ...fixture, branch_id: id(5) }], 1);
    await readProductionTrackingPage(s, filters, access, 0, undefined, client);
    expect(calls).toContainEqual(['eq', 'branch_id', id(5)]);
    await expect(readProductionTrackingPage(s, { ...filters, branchId: id(6) }, access, 0, undefined, client)).rejects.toThrow('fora do contexto');
  });
  it('fails on out-of-company or out-of-branch returned rows, not filtering them away as success', async () => {
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith([{ ...fixture, company_id: id(9) }], 1).client)).rejects.toThrow('fora do contexto');
    await expect(readProductionTrackingPage({ ...scope, branchId: id(5) }, filters, access, 0, undefined, clientWith([fixture], 1).client)).rejects.toThrow('fora do contexto');
  });
  it('restricts explicit sector grants without permissive fallback; documents canonical coverage', async () => {
    const granted = { is_admin: false, enforced: true, access: { tecelagem: 'viewer' } };
    const { client, calls } = clientWith([fixture], 1);
    const result = await readProductionTrackingPage(scope, filters, granted, 0, undefined, client);
    expect(result.canonicalSectorScope).toBe(true);
    expect(String(calls.find(c => c[0] === 'or')?.[1])).toContain('sector.eq."tecelagem"');
    expect(String(calls.find(c => c[0] === 'or')?.[1])).not.toContain('malharia');
    await expect(readProductionTrackingPage(scope, filters, { ...granted, access: {} }, 0, undefined, client)).rejects.toThrow('Nenhum setor autorizado');
    await expect(readProductionTrackingPage(scope, { ...filters, sector: 'malharia' }, granted, 0, undefined, client)).rejects.toThrow('não autorizado');
  });
  it('quotes hostile search text and combines sector/search under AND, not as an authorization OR', async () => {
    const { client, calls } = clientWith([fixture], 1);
    await readProductionTrackingPage(scope, { ...filters, search: 'a"),company_id.neq.any' }, { is_admin: false, enforced: true, access: { tecelagem: 'viewer' } }, 0, undefined, client);
    const expression = String(calls.find(c => c[0] === 'or')?.[1]);
    expect(expression.startsWith('and(or(')).toBe(true);
    expect(expression).toContain(String.raw`a\"),company\\_id.neq.any`);
    expect(calls).toContainEqual(['eq', 'company_id', id(2)]);
  });
  it('propagates RLS/query errors and format/count/duplicate inconsistencies', async () => {
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith(null, null, { message: 'RLS denied' }).client)).rejects.toThrow('RLS denied');
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith([fixture, fixture], 2).client)).rejects.toThrow('duplicada');
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith([fixture], 0).client)).rejects.toThrow('Contagem inconsistente');
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, clientWith([{ ...fixture, quantity: null }], 1).client)).rejects.toThrow('Quantidade');
  });
  it('does not retry or report success when a later page read fails', async () => {
    const { client } = clientWith(null, null, { message: 'page unavailable' });
    await expect(readProductionTrackingPage(scope, filters, access, 1, undefined, client)).rejects.toThrow('page unavailable');
    expect(client.from).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit, valid access payload and handles missing RPC as blocked', async () => {
    await expect(readTrackingSectorAccess(scope, undefined, clientWith({ is_admin: false, enforced: true, access: {} }).client)).resolves.toEqual({ is_admin: false, enforced: true, access: {} });
    await expect(readTrackingSectorAccess(scope, undefined, clientWith(null, null, { message: 'missing RPC' }).client)).rejects.toThrow('Acesso setorial indisponível');
    await expect(readTrackingSectorAccess(scope, undefined, clientWith(null).client)).rejects.toThrow('não confirmado');
  });
  it('binds sector grants to the server company and refuses a visual-only switch without fallback', async () => {
    const { client } = clientWith({ is_admin: true, enforced: false, access: {} });
    vi.mocked(client.rpc).mockResolvedValueOnce({ data: id(99), error: null });
    await expect(readTrackingSectorAccess(scope, undefined, client)).rejects.toThrow('Empresa ativa difere');
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('get_user_company_id', { _user_id: id(1) }); expect(client.from).not.toHaveBeenCalled();
    vi.mocked(client.rpc).mockResolvedValueOnce({ data: null, error: { message: 'missing identity' } });
    await expect(readTrackingSectorAccess(scope, undefined, client)).rejects.toThrow('Empresa do servidor não confirmada');
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });
  it('refuses access after cancellation even if a mocked RPC returns late', async () => {
    const { client } = clientWith(access); const controller = new AbortController();
    vi.mocked(client.rpc).mockImplementationOnce(async () => { controller.abort(); return { data: id(2), error: null }; });
    await expect(readTrackingSectorAccess(scope, controller.signal, client)).rejects.toThrow('cancelada');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid dates/page/IDs before querying data', async () => {
    const { client } = clientWith([]);
    await expect(readProductionTrackingPage(scope, { ...filters, start: 'invalid' }, access, 0, undefined, client)).rejects.toThrow();
    await expect(readProductionTrackingPage(scope, filters, access, -1, undefined, client)).rejects.toThrow();
    await expect(readProductionTrackingPage({ ...scope, companyId: 'x' }, filters, access, 0, undefined, client)).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });
});
