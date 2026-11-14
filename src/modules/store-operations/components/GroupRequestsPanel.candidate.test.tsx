import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ error: false, rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, from: vi.fn(() => { throw new Error('Unexpected product query'); }) } }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => ({ userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' }, currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }) }));
vi.mock('@/hooks/operational/store/useGroupReplenishment', () => ({
  useGroupRequests: () => ({ data: state.error ? undefined : [{ id: 'r1', product_code: 'TEC-1', product_name: 'Tecido', quantity: 5, unit: 'm', created_at: '2026-11-04T10:00:00Z', status: 'aprovada', received_quantity: null }], isPending: false, isError: state.error, error: new Error('consulta negada') }),
  useCreateGroupRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/operational/store/useIntercompanyProductionReleases', () => ({ useIntercompanyProductionReleases: () => ({ state: 'ready', records: [], scopeToken: 'test' }) }));
vi.mock('@/components/production/IntercompanyReleaseSummary', () => ({ IntercompanyReleaseSummary: () => null }));
import { GroupRequestsPanel } from './GroupRequestsPanel';
afterEach(() => { cleanup(); state.error = false; state.rpc.mockClear(); });
function show() { return render(<QueryClientProvider client={new QueryClient()}><GroupRequestsPanel /></QueryClientProvider>); }
describe('store request UI without unsafe receipt action', () => {
  it('does not offer receive for approved requests and does not auto-query products while dialog closed', () => {
    show(); expect(screen.getByText(/exige entrega identificada e conciliação/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar recebimento/i })).not.toBeInTheDocument(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('displays a failed read instead of the empty-request success message', () => {
    state.error = true; show(); expect(screen.getByRole('alert')).toHaveTextContent('Não é um resultado vazio');
    expect(screen.queryByText(/Nenhuma solicitação ao grupo/)).not.toBeInTheDocument();
  });
});
