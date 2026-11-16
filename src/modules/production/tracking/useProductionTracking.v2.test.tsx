import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ context: { userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' },
  currentBranch: null as { id: string } | null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }, access: vi.fn(), page: vi.fn() }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => state.context }));
vi.mock('./productionTrackingService', () => ({ readTrackingSectorAccess: state.access, readProductionTrackingPage: state.page }));
import { defaultTrackingFilters, trackingContextKey, type TrackingScope } from './productionTrackingModel';
import { useProductionTracking } from './useProductionTracking';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const filters = defaultTrackingFilters(new Date('2026-11-04T12:00:00Z'));
const clients: QueryClient[] = [];
beforeEach(() => {
  Object.assign(state.context, { currentCompany: { id: id(2) }, currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false });
  state.access.mockReset().mockResolvedValue({ is_admin: false, enforced: false, access: {} });
  state.page.mockReset().mockImplementation(async (scope: TrackingScope, _filters: unknown, grants: { enforced: boolean }) => {
    if (grants.enforced) throw new Error('Nenhum setor autorizado');
    return { rows: [{ order_number: 'PREVIOUS-READ' }], total: 1, page: 0, hasNext: false, contextKey: trackingContextKey(scope), loadedAt: '2026-11-04T10:00:00Z', canonicalSectorScope: false };
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
function setup(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } })) {
  if (!clients.includes(client)) clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useProductionTracking(filters, 0), { wrapper });
}
describe('S016 v2: authorization cache cannot survive an unresolved context boundary', () => {
  it('does not resurface a cached page before grants are rechecked after a same-company switch', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.context.isSwitching = true; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    state.access.mockResolvedValue({ is_admin: false, enforced: true, access: {} });
    state.context.isSwitching = false; hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.access).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.error?.message).toContain('Nenhum setor autorizado'));
    expect(hook.result.current.data).toBeUndefined();
  });
  it('does not reuse a fresh company-A page after A → B → A', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.context.currentCompany = { id: id(4) }; hook.rerender();
    await waitFor(() => expect(hook.result.current.data?.contextKey).toContain(id(4)));
    state.access.mockResolvedValue({ is_admin: false, enforced: true, access: {} });
    state.context.currentCompany = { id: id(2) }; hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.access).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(hook.result.current.error?.message).toContain('Nenhum setor autorizado'));
  });

  it.each(['unit', 'channel'] as const)('requires fresh grants at a %s boundary without changing the company', async boundary => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.access.mockResolvedValue({ is_admin: false, enforced: true, access: {} });
    if (boundary === 'unit') state.context.currentBranch = { id: id(5) };
    else state.context.activeChannel = 'ATACADO_INDUSTRIA';
    hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.access).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.error?.message).toContain('Nenhum setor autorizado'));
  });
  it("does not reuse another mount's grants/page from a shared QueryClient", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
    const first = setup(client); await waitFor(() => expect(first.result.current.data).toBeDefined()); first.unmount();
    state.access.mockResolvedValue({ is_admin: false, enforced: true, access: {} });
    const second = setup(client); expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.access).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.error?.message).toContain('Nenhum setor autorizado'));
  });
});
