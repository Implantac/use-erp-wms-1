import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ context: { userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' },
  currentBranch: null as { id: string } | null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }, records: vi.fn(), roles: vi.fn() }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => state.context }));
vi.mock('@/services/production/intercompanyReleaseService', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/production/intercompanyReleaseService')>();
  return { ...original, readIntercompanyReleases: state.records, readReleaseRoles: state.roles };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { IntercompanyReleaseReadError } from '@/lib/store/intercompanyRelease';
import { useIntercompanyProductionReleases } from './useIntercompanyProductionReleases';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
afterEach(cleanup);
beforeEach(() => {
  Object.assign(state.context, { userId: id(1), currentCompany: { id: id(2) }, currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false });
  state.records.mockReset().mockResolvedValue([]); state.roles.mockReset().mockResolvedValue([{ company_id: id(2), role: 'manager' }]);
});
function setup(root: string | null = id(2)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useIntercompanyProductionReleases([id(3)], root), { wrapper });
}
describe('release reads and eligibility are context-bound', () => {
  it('performs no reads and exposes no roles or proof while context is unresolved', () => {
    state.context.isReady = false; const hook = setup();
    expect(hook.result.current.state).toBe('unavailable'); expect(hook.result.current.canManage).toBe(false);
    expect(state.records).not.toHaveBeenCalled(); expect(state.roles).not.toHaveBeenCalled();
  });
  it('distinguishes loading from a successful empty visible proof list', async () => {
    const hook = setup(); expect(hook.result.current.state).toBe('loading');
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(hook.result.current.records).toEqual([]); await waitFor(() => expect(hook.result.current.canManage).toBe(true));
    state.context.isSwitching = true; hook.rerender();
    expect(hook.result.current.state).toBe('unavailable'); expect(hook.result.current.canManage).toBe(false); expect(hook.result.current.records).toEqual([]);
  });
  it.each(['error', 'incompatible', 'inconsistent'] as const)('does not translate %s into an empty-ready result', async kind => {
    state.records.mockRejectedValue(new IntercompanyReleaseReadError(kind, 'mock failure'));
    const hook = setup(); await waitFor(() => expect(hook.result.current.state).toBe(kind));
    expect(hook.result.current.records).toEqual([]);
  });
  it('requires confirmed actual admin/manager roles, not visual matrix/system access', async () => {
    state.roles.mockResolvedValue([{ company_id: id(2), role: 'admin_matriz' }]);
    const hook = setup(); await waitFor(() => expect(hook.result.current.state).toBe('ready')); expect(hook.result.current.canManage).toBe(false);
    hook.unmount(); state.roles.mockRejectedValue(new Error('backend company mismatch'));
    const denied = setup(); await waitFor(() => expect(denied.result.current.authorizationError).toBeInstanceOf(Error));
    expect(denied.result.current.canManage).toBe(false);
  });
  it('does not even query manager roles when active company is not the industry root', async () => {
    const hook = setup(id(99)); await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    expect(state.roles).not.toHaveBeenCalled(); expect(hook.result.current.canManage).toBe(false);
  });
  it('drops a late company-A response after switching company, unit and channel', async () => {
    let resolveA: (value: unknown) => void = () => { throw new Error('not initialized'); };
    state.records.mockImplementation((scope: { companyId: string }) => scope.companyId === id(2)
      ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve([]));
    const hook = setup(); await waitFor(() => expect(state.records).toHaveBeenCalledTimes(1));
    Object.assign(state.context, { currentCompany: { id: id(4) }, currentBranch: { id: id(5) }, activeChannel: 'ATACADO_INDUSTRIA' }); hook.rerender();
    expect(hook.result.current.records).toEqual([]); expect(hook.result.current.canManage).toBe(false);
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    await act(async () => resolveA([{ request_id: id(3), sales_order_id: 'COMPANY-A-PRIVATE' }]));
    expect(hook.result.current.records).toEqual([]); expect(hook.result.current.scopeToken).toContain(id(4));
    expect(hook.result.current.scopeToken).toContain(id(5)); expect(hook.result.current.scopeToken).toContain('ATACADO_INDUSTRIA');
    expect(JSON.stringify(hook.result.current)).not.toContain('COMPANY-A-PRIVATE');
  });
});
