import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ context: { userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' }, currentBranch: null,
  activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }, readAccess: vi.fn(), readPage: vi.fn() }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => state.context }));
vi.mock('./productionTrackingService', () => ({ readTrackingSectorAccess: state.readAccess, readProductionTrackingPage: state.readPage }));
import { useProductionTracking } from './useProductionTracking';
import { defaultTrackingFilters, trackingContextKey } from './productionTrackingModel';
const filters = defaultTrackingFilters(new Date('2026-11-04T12:00:00Z'));
afterEach(cleanup);
beforeEach(() => {
  state.context.currentCompany = { id: '00000000-0000-4000-8000-000000000002' }; state.context.isReady = true;
  state.readAccess.mockReset().mockResolvedValue({ is_admin: false, enforced: false, access: {} }); state.readPage.mockReset();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useProductionTracking(filters, 0), { wrapper });
}
describe('report hook: no stale tenant/error data', () => {
  it('makes no reads without resolved context', () => {
    state.context.isReady = false; const hook = setup(); expect(hook.result.current.ready).toBe(false);
    expect(state.readAccess).not.toHaveBeenCalled(); expect(state.readPage).not.toHaveBeenCalled();
  });
  it('blocks page reads when sector authorization is unavailable instead of failing open', async () => {
    state.readAccess.mockRejectedValue(new Error('RPC unavailable'));
    const hook = setup(); await waitFor(() => expect(hook.result.current.error).toBeInstanceOf(Error));
    expect(state.readPage).not.toHaveBeenCalled(); expect(hook.result.current.data).toBeUndefined();
  });
  it('drops a late company-A response after switching to B and keeps exportable data scoped to B', async () => {
    let resolveA: (value: unknown) => void = () => { throw new Error('not initialized'); };
    state.readPage.mockImplementation((scope: { companyId: string }) => scope.companyId.endsWith('002')
      ? new Promise(resolve => { resolveA = resolve; })
      : Promise.resolve({ rows: [], total: 0, page: 0, hasNext: false, contextKey: trackingContextKey({ userId: state.context.userId, companyId: scope.companyId, branchId: null, channel: 'CONSOLIDADO' }), canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' }));
    const hook = setup(); await waitFor(() => expect(state.readPage).toHaveBeenCalledTimes(1));
    state.context.currentCompany = { id: '00000000-0000-4000-8000-000000000003' }; hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.data?.contextKey).toContain('000000000003'));
    await act(async () => resolveA({ rows: [{ order_number: 'COMPANY-A-PRIVATE' }], total: 1, page: 0, hasNext: false,
      contextKey: JSON.stringify([state.context.userId, '00000000-0000-4000-8000-000000000002', null, 'CONSOLIDADO']) }));
    expect(hook.result.current.data?.rows).toEqual([]); expect(JSON.stringify(hook.result.current)).not.toContain('COMPANY-A-PRIVATE');
  });
  it('uses revoked/fresh grants on refresh instead of refetching with the previous permission closure', async () => {
    state.readPage.mockImplementation(async (scope: { userId: string; companyId: string; branchId: string | null; channel: string }, _filters: unknown, grants: { enforced: boolean }) => {
      if (grants.enforced) throw new Error('Nenhum setor autorizado');
      return { rows: [], total: 0, page: 0, hasNext: false, contextKey: trackingContextKey(scope), canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' };
    });
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    const initialCalls = state.readPage.mock.calls.length;
    state.readAccess.mockResolvedValue({ is_admin: false, enforced: true, access: {} });
    await act(async () => { await hook.result.current.refresh(); });
    await waitFor(() => expect(hook.result.current.error?.message).toContain('Nenhum setor autorizado'));
    expect(hook.result.current.data).toBeUndefined();
    expect(state.readPage.mock.calls.slice(initialCalls).every(call => call[2].enforced === true)).toBe(true);
  });
  it('does not refetch data when rechecking sector access fails', async () => {
    state.readPage.mockImplementation(async (scope: { userId: string; companyId: string; branchId: string | null; channel: string }) => ({ rows: [], total: 0, page: 0, hasNext: false, contextKey: trackingContextKey(scope), canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' }));
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    const initialCalls = state.readPage.mock.calls.length;
    state.readAccess.mockRejectedValue(new Error('setor não confirmado'));
    await act(async () => { await hook.result.current.refresh(); });
    await waitFor(() => expect(hook.result.current.error?.message).toContain('setor não confirmado'));
    expect(hook.result.current.data).toBeUndefined(); expect(state.readPage).toHaveBeenCalledTimes(initialCalls);
  });
  it('hides stale successful rows after a failed refresh', async () => {
    state.readPage.mockImplementation(async (scope: { userId: string; companyId: string; branchId: string | null; channel: string }) => ({ rows: [], total: 0, page: 0, hasNext: false, contextKey: trackingContextKey(scope), canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' }));
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.readPage.mockRejectedValue(new Error('RLS read failed'));
    await act(async () => { await hook.result.current.refresh(); });
    await waitFor(() => expect(hook.result.current.error).toBeInstanceOf(Error));
    expect(hook.result.current.data).toBeUndefined();
  });
});
