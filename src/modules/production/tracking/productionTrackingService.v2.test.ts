import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { readProductionTrackingPage, type TrackingClient, type TrackingQuery } from './productionTrackingService';
import { defaultTrackingFilters, type TrackingFilters } from './productionTrackingModel';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { userId: id(1), companyId: id(2), branchId: null, channel: 'CONSOLIDADO' };
const filters = defaultTrackingFilters(new Date('2026-11-04T12:00:00Z'));
const access = { is_admin: false, enforced: false, access: {} };
function mockClient(count: number | null = 0) {
  const expressions: string[] = [];
  const query = { select: () => query, eq: () => query, gte: () => query, lt: () => query,
    or: (value: string) => { expressions.push(value); return query; }, order: () => query, range: () => query, abortSignal: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null, count }).then(resolve) } as unknown as TrackingQuery;
  const client: TrackingClient = { from: vi.fn(() => query), rpc: vi.fn() };
  return { client, expressions };
}
describe('S016 v2: literal searches and fail-closed filter/count contracts', () => {
  it('escapes a literal backslash before ILIKE underscore/percent escaping', async () => {
    const { client, expressions } = mockClient();
    await readProductionTrackingPage(scope, { ...filters, search: String.raw`SKU\_%` }, access, 0, undefined, client);
    const quoted = expressions[0].split(',')[0].slice('order_number.ilike.'.length);
    const literal = JSON.parse(quoted) as string;
    expect(literal).toBe('%SKU' + '\\\\' + '\\_' + '\\%' + '%');
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it.each([
    [{ status: 'invented' }, /status/i], [{ priority: 'maximum' }, /prioridade/i], [{ sector: 'unknown-sector' }, /setor/i],
  ] as const)('rejects an unknown filter before creating a data query: %j', async (patch, message) => {
    const { client } = mockClient();
    await expect(readProductionTrackingPage(scope, { ...filters, ...patch } as TrackingFilters, access, 0, undefined, client)).rejects.toThrow(message);
    expect(client.from).not.toHaveBeenCalled();
  });
  it.each([-1, 0.5, NaN, Infinity])('does not relabel a malformed exact count %s as merely unavailable', async count => {
    const { client } = mockClient(count);
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, client)).rejects.toThrow(/Contagem/);
  });
  it('keeps a genuinely absent count distinct from an invalid supplied count', async () => {
    await expect(readProductionTrackingPage(scope, filters, access, 0, undefined, mockClient(null).client)).resolves.toMatchObject({ total: null });
  });
  it('refuses an overlong search before building the data query', async () => {
    const { client } = mockClient();
    await expect(readProductionTrackingPage(scope, { ...filters, search: 'x'.repeat(121) }, access, 0, undefined, client)).rejects.toThrow('120');
    expect(client.from).not.toHaveBeenCalled();
  });
});
