import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { finalizeIntercompanyProduction, readIntercompanyReleases, readReleaseRoles, type ReleaseClient, type ReleaseQuery } from './intercompanyReleaseService';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { userId: id(1), companyId: id(2), branchId: null as string | null, channel: 'CONSOLIDADO' };
const proof = { id: id(10), request_id: id(3), company_id: id(2), branch_id: null, requesting_company_id: id(4), requesting_branch_id: null,
  production_order_id: id(5), completion_id: id(6), output_lot_id: id(7), stock_balance_id: id(8), sales_order_id: id(9), order_item_id: id(11),
  reservation_id: id(12), quantity: 10, unit: 'm', release_status: 'reservada_bloqueada_fiscal', released_by: id(1), released_at: '2026-11-04T10:00:00Z' };
const success = { id: id(3), status: 'producao_solicitada', release_id: id(10), release_status: 'reservada_bloqueada_fiscal',
  production_order_id: id(5), completion_id: id(6), output_lot_id: id(7), sales_order_id: id(9), reservation_id: id(12), quantity: 10,
  unit: 'm', dispatch_enabled: false, idempotent_replay: false };
function clientWith(data: unknown, error: { message: string; code?: string } | null = null) {
  const calls: [string, ...unknown[]][] = [];
  const query = { select: (x: string) => { calls.push(['select', x]); return query; },
    in: (x: string, y: readonly string[]) => { calls.push(['in', x, y]); return query; },
    eq: (x: string, y: string) => { calls.push(['eq', x, y]); return query; },
    or: (x: string) => { calls.push(['or', x]); return query; }, abortSignal: () => query,
    then: (resolve: (r: { data: unknown; error: { message: string } | null }) => unknown) => Promise.resolve({ data, error }).then(resolve) } as ReleaseQuery;
  const client: ReleaseClient = { from: vi.fn((table: string) => { calls.push(['from', table]); return query; }), rpc: vi.fn(async (name: string) => name === 'get_user_company_id' ? { data: id(2), error: null } : { data, error }) };
  return { client, calls };
}
describe('release service: injected mocked client only', () => {
  it('uses exactly one RPC with the full request UUID, no extra fiscal/quantity arguments', async () => {
    const { client } = clientWith(success);
    await expect(finalizeIntercompanyProduction(id(3), client)).resolves.toEqual(success);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('finalize_intercompany_production', { p_request_id: id(3) });
    expect(client.from).not.toHaveBeenCalled();
  });
  it('rejects malformed identity before any RPC', async () => {
    const { client } = clientWith(success);
    await expect(finalizeIntercompanyProduction('invalid', client)).rejects.toThrow();
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('does not turn RPC failure, missing schema or incompatible payload into success', async () => {
    await expect(finalizeIntercompanyProduction(id(3), clientWith(null, { message: 'function missing' }).client)).rejects.toThrow('function missing');
    await expect(finalizeIntercompanyProduction(id(3), clientWith({ ...success, dispatch_enabled: true }).client)).rejects.toThrow('não confirmado');
  });
  it('propagates uncertain network failures without automatic retry', async () => {
    const { client } = clientWith(null); vi.mocked(client.rpc).mockRejectedValue(new Error('timeout'));
    await expect(finalizeIntercompanyProduction(id(3), client)).rejects.toThrow('timeout');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it('reads persisted proof within exact company scope; no dispatch_enabled SELECT', async () => {
    const { client, calls } = clientWith([proof]);
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, client)).resolves.toEqual([proof]);
    expect(calls).toContainEqual(['or', `company_id.eq.${id(2)},requesting_company_id.eq.${id(2)}`]);
    expect(String(calls.find(c => c[0] === 'select')?.[1])).not.toContain('dispatch_enabled');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('supports source/destination branch filters and rejects wrong branch replies', async () => {
    const s = { ...scope, branchId: id(22) };
    const { client, calls } = clientWith([{ ...proof, branch_id: id(22) }]);
    await expect(readIntercompanyReleases(s, [id(3)], undefined, client)).resolves.toHaveLength(1);
    expect(String(calls.find(c => c[0] === 'or')?.[1])).toContain(`requesting_branch_id.eq.${id(22)}`);
    await expect(readIntercompanyReleases(s, [id(3)], undefined, clientWith([proof]).client)).rejects.toThrow('fora do escopo');
  });
  it('refuses out-of-scope/duplicate proof rather than showing it or treating it as absent', async () => {
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith([{ ...proof, company_id: id(90) }]).client)).rejects.toThrow();
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith([proof, proof]).client)).rejects.toThrow('duplicado');
  });
  it('does not return a partial batch collection when a later batch fails', async () => {
    const { client } = clientWith([]); const bad = clientWith(null, { message: 'RLS unavailable' });
    vi.mocked(client.from).mockImplementationOnce(() => clientWith([proof]).client.from('intercompany_production_releases'))
      .mockImplementationOnce(() => bad.client.from('intercompany_production_releases'));
    const ids = [id(3), ...Array.from({ length: 80 }, (_, i) => id(100 + i))];
    await expect(readIntercompanyReleases(scope, ids, undefined, client)).rejects.toThrow('RLS unavailable');
    expect(client.from).toHaveBeenCalledTimes(2);
  });
  it('performs no read for an empty request list or an already aborted signal', async () => {
    const { client } = clientWith([]);
    await expect(readIntercompanyReleases(scope, [], undefined, client)).resolves.toEqual([]);
    const controller = new AbortController(); controller.abort();
    await expect(readIntercompanyReleases(scope, [id(3)], controller.signal, client)).rejects.toThrow('cancelada');
    expect(client.from).not.toHaveBeenCalled();
  });
  it('distinguishes incompatible schema and inconsistent proof from absence and ordinary query errors', async () => {
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith(null, { message: 'missing table', code: 'PGRST205' }).client)).rejects.toMatchObject({ kind: 'incompatible' });
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith([{ ...proof, reservation_id: null }]).client)).rejects.toMatchObject({ kind: 'inconsistent' });
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith(null, { message: 'denied', code: '42501' }).client)).rejects.toMatchObject({ kind: 'error' });
    await expect(readIntercompanyReleases(scope, [id(3)], undefined, clientWith([]).client)).resolves.toEqual([]);
  });
  it('does not use roles from a different backend company or retry a failed identity check', async () => {
    const { client } = clientWith([{ company_id: id(2), role: 'admin' }]);
    vi.mocked(client.rpc).mockResolvedValueOnce({ data: id(99), error: null });
    await expect(readReleaseRoles(scope, undefined, client)).rejects.toThrow('Empresa ativa difere');
    expect(client.from).not.toHaveBeenCalled(); expect(client.rpc).toHaveBeenCalledExactlyOnceWith('get_user_company_id', { _user_id: id(1) });
    vi.mocked(client.rpc).mockResolvedValueOnce({ data: null, error: { message: 'identity unavailable' } });
    await expect(readReleaseRoles(scope, undefined, client)).rejects.toThrow('não confirmada'); expect(client.from).not.toHaveBeenCalled();
  });
  it('queries real roles with user/company identity and propagates errors', async () => {
    const { client, calls } = clientWith([{ company_id: id(2), role: 'manager' }]);
    expect(await readReleaseRoles(scope, undefined, client)).toEqual([{ company_id: id(2), role: 'manager' }]);
    expect(calls).toContainEqual(['eq', 'user_id', id(1)]); expect(calls).toContainEqual(['eq', 'company_id', id(2)]);
    await expect(readReleaseRoles(scope, undefined, clientWith(null, { message: 'denied' }).client)).rejects.toThrow('denied');
  });
});
