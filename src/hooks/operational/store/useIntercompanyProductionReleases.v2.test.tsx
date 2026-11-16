import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ context: { userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' },
  currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }, records: vi.fn(), roles: vi.fn() }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => state.context }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/services/production/intercompanyReleaseService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/production/intercompanyReleaseService')>(),
  readIntercompanyReleases: state.records, readReleaseRoles: state.roles,
}));
import { useIntercompanyProductionReleases } from './useIntercompanyProductionReleases';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clients: QueryClient[] = [];
beforeEach(() => {
  Object.assign(state.context, { currentCompany: { id: id(2) }, isReady: true, isSwitching: false });
  state.records.mockReset().mockResolvedValue([]);
  state.roles.mockReset().mockResolvedValue([{ company_id: id(2), role: 'manager' }]);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
function setup(ids: string[] = [id(3)]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } }); clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useIntercompanyProductionReleases(ids, id(2)), { wrapper });
}
describe('LOJ-05A v2: re-read authority, not just proof', () => {
  it('rechecks server roles together with proof on an explicit re-read', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.canManage).toBe(true));
    state.roles.mockResolvedValue([]);
    await act(async () => { await hook.result.current.refetch(); });
    expect(state.roles).toHaveBeenCalledTimes(2); expect(state.records).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(hook.result.current.canManage).toBe(false));
  });
  it('rejects a failed proof re-read so the caller can display unconfirmed feedback', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    state.records.mockRejectedValue(new Error('lastro indisponível'));
    await act(async () => { await expect(hook.result.current.refetch()).rejects.toThrow('lastro indisponível'); });
    expect(hook.result.current.records).toEqual([]);
  });
  it('rejects a failed role re-read instead of keeping old manager eligibility', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.canManage).toBe(true));
    state.roles.mockRejectedValue(new Error('empresa do servidor não confirmada'));
    await act(async () => { await expect(hook.result.current.refetch()).rejects.toThrow('servidor'); });
    await waitFor(() => expect(hook.result.current.canManage).toBe(false));
  });
  it('does not bypass enabled=false through manual refetch when context is unavailable', async () => {
    state.context.isReady = false; const hook = setup();
    await act(async () => { await expect(hook.result.current.refetch()).rejects.toThrow(/contexto/i); });
    expect(state.records).not.toHaveBeenCalled(); expect(state.roles).not.toHaveBeenCalled();
  });
  it('does not query or manually refetch an empty request set', async () => {
    const hook = setup([]);
    await act(async () => { await expect(hook.result.current.refetch()).rejects.toThrow(/solicita/i); });
    expect(state.records).not.toHaveBeenCalled(); expect(state.roles).not.toHaveBeenCalled();
  });
  it('requires fresh proof and roles after a temporary unresolved context, even for the same company', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.canManage).toBe(true));
    state.context.isSwitching = true; hook.rerender(); expect(hook.result.current.state).toBe('unavailable');
    state.roles.mockResolvedValue([]);
    state.context.isSwitching = false; hook.rerender();
    expect(hook.result.current.canManage).toBe(false); expect(hook.result.current.records).toEqual([]);
    await waitFor(() => expect(state.roles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(hook.result.current.canManage).toBe(false);
  });

  it('coalesces concurrent re-read buttons into one proof and role recheck', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.canManage).toBe(true));
    let finish: (value: unknown[]) => void = () => { throw new Error('not initialized'); };
    state.records.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => {
      const first = hook.result.current.refetch(); const second = hook.result.current.refetch();
      expect(second).toBe(first); finish([]); await first;
    });
    expect(state.records).toHaveBeenCalledTimes(2); expect(state.roles).toHaveBeenCalledTimes(2);
  });
});
