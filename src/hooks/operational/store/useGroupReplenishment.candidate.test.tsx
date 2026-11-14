import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toastError: vi.fn(), context: {
  userId: null as string | null, currentCompany: null as { id: string } | null, currentBranch: null as { id: string } | null,
  activeChannel: 'CONSOLIDADO', isReady: false, isSwitching: false,
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: state.from } }));
vi.mock('@/lib/toastHelpers', () => ({ toastError: state.toastError, toastSuccess: vi.fn() }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => state.context }));
import { useGroupRequests, useReceiveGroupDelivery } from './useGroupReplenishment';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
afterEach(cleanup);
beforeEach(() => {
  state.rpc.mockReset(); state.from.mockReset(); state.toastError.mockReset();
  Object.assign(state.context, { userId: null, currentCompany: null, currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: false, isSwitching: false });
});
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function ready() { Object.assign(state.context, { userId: id(1), currentCompany: { id: id(2) }, isReady: true }); }
function resultQuery(data: unknown) {
  const calls: [string, ...unknown[]][] = [];
  const query = { select: (x: string) => { calls.push(['select', x]); return query; },
    eq: (x: string, y: string) => { calls.push(['eq', x, y]); return query; },
    or: (x: string) => { calls.push(['or', x]); return query; },
    order: (x: string) => { calls.push(['order', x]); return query; }, abortSignal: () => query,
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  return { query, calls };
}
describe('legacy receipt client containment', () => {
  it('keeps compatibility export but refuses before any backend call', async () => {
    const hook = renderHook(() => useReceiveGroupDelivery(), { wrapper: provider() });
    await act(async () => {
      await expect(hook.result.current.mutateAsync({ requestId: id(3), quantity: 10 })).rejects.toThrow('entrega identificada');
    });
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.toastError).toHaveBeenCalledTimes(1);
  });
});
describe('request reads bound to active context', () => {
  it('does not read while identity is unresolved', () => {
    renderHook(() => useGroupRequests('requester'), { wrapper: provider() }); expect(state.from).not.toHaveBeenCalled();
  });
  it('uses exact requester company/branch filters, not only a scoped cache key', async () => {
    ready(); state.context.currentBranch = { id: id(4) };
    const fake = resultQuery([{ id: id(3), requesting_company_id: id(2), requesting_branch_id: id(4) }]); state.from.mockReturnValue(fake.query);
    const hook = renderHook(() => useGroupRequests('requester'), { wrapper: provider() });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(fake.calls).toContainEqual(['eq', 'requesting_company_id', id(2)]); expect(fake.calls).toContainEqual(['eq', 'requesting_branch_id', id(4)]);
    expect(state.rpc).not.toHaveBeenCalled();
    state.context.isSwitching = true; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
  });
  it('rejects foreign returned rows instead of filtering away a backend inconsistency', async () => {
    ready(); state.from.mockReturnValue(resultQuery([{ requesting_company_id: id(99) }]).query);
    const hook = renderHook(() => useGroupRequests('requester'), { wrapper: provider() });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.error?.message).toContain('fora do contexto');
  });
  it('preserves group inbox mode with an explicit active-root/requester constraint', async () => {
    ready(); const fake = resultQuery([{ requesting_company_id: id(99), group_root_company_id: id(2) }]); state.from.mockReturnValue(fake.query);
    const hook = renderHook(() => useGroupRequests(), { wrapper: provider() });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(fake.calls).toContainEqual(['or', `group_root_company_id.eq.${id(2)},requesting_company_id.eq.${id(2)}`]);
  });
});
