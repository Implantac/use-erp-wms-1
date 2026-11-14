import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ rpc: vi.fn(), finalize: vi.fn(), produce: vi.fn(), decide: vi.fn(), canManage: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => ({ userId: '00000000-0000-4000-8000-000000000001', currentCompany: { id: '00000000-0000-4000-8000-000000000002' }, currentBranch: null, activeChannel: 'CONSOLIDADO', isReady: true, isSwitching: false }) }));
vi.mock('@/hooks/operational/store/useSupplyAccess', () => ({ useSupplyAccess: () => ({ canManage: true, isLoading: false }) }));
vi.mock('@/hooks/operational/store/useGroupReplenishment', () => ({ useDecideGroupRequest: () => ({ mutate: state.decide, isPending: false }) }));
vi.mock('@/hooks/operational/store/useIntercompanyProductionReleases', () => ({ useIntercompanyProductionReleases: () => ({ state: 'ready', records: [], scopeToken: 'company-a', canManage: state.canManage, authorizationError: null, refetch: vi.fn().mockResolvedValue({}) }) }));
vi.mock('@/services/production/intercompanyReleaseService', () => ({ finalizeIntercompanyProduction: state.finalize }));
vi.mock('@/services/production/textilePcpService', () => ({ produceIntercompanyRequest: state.produce }));
vi.mock('@/services/operational/store/supplyService', () => ({ decideSupplyRequest: vi.fn(), getSupplyCandidates: vi.fn() }));
import { FactoryInboxPanel } from './FactoryInboxPanel';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payload = { supply: [], intercompany: [], group_root_company_id: id(2), production: [{ id: id(3), product_name: 'Tecido da OP vinculada', product_code: 'TEC-1', quantity: 5, company_name: 'Loja teste', branch_name: null,
  created_at: '2026-11-04T10:00:00Z', decided_at: null, production_order_id: id(4), order_number: 'OP-TEC-1', production_order_status: 'completed' }] };
beforeEach(() => { state.rpc.mockReset().mockResolvedValue({ data: payload, error: null }); state.finalize.mockReset(); state.produce.mockReset(); state.decide.mockReset(); state.canManage = false; });
afterEach(cleanup);
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter><FactoryInboxPanel /></MemoryRouter></QueryClientProvider>); return client;
}
describe('factory presentation of linked production', () => {
  it('does not treat visual supply management access as release authorization', async () => {
    show(); await screen.findByText('Tecido da OP vinculada');
    expect(screen.queryByRole('button', { name: 'Ver disponibilização gerencial' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ação restrita a admin\/manager/)).toBeInTheDocument();
    expect(screen.getByText('Solicitado: 5 (unidade não informada)')).toBeInTheDocument();
    expect(state.finalize).not.toHaveBeenCalled(); expect(state.produce).not.toHaveBeenCalled(); expect(state.decide).not.toHaveBeenCalled();
  });
  it('integrates the prepared review but never enables creation for an eligible manager', async () => {
    state.canManage = true; show(); await screen.findByText('Tecido da OP vinculada');
    expect(screen.getByRole('link', { name: 'Abrir no PCP' })).toHaveAttribute('href', '/producao/ordens?q=OP-TEC-1');
    fireEvent.click(screen.getByRole('button', { name: 'Ver disponibilização gerencial' }));
    expect(screen.getByRole('button', { name: 'Criar pedido pendente e reserva' })).toBeDisabled(); expect(state.finalize).not.toHaveBeenCalled();
  });
  it('hides previously successful OPs after inbox refresh failure instead of displaying them as current', async () => {
    const client = show(); await screen.findByText('Tecido da OP vinculada');
    state.rpc.mockResolvedValue({ data: null, error: { message: 'RLS read unavailable' } });
    await act(async () => { await client.invalidateQueries({ queryKey: ['factory-inbox'] }); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('RLS read unavailable'));
    expect(screen.queryByText('Tecido da OP vinculada')).not.toBeInTheDocument(); expect(state.finalize).not.toHaveBeenCalled();
  });
  it('does not infer an empty production list when an older backend omits the production contract', async () => {
    state.rpc.mockResolvedValue({ data: { supply: [], intercompany: [], group_root_company_id: id(2) }, error: null }); show();
    expect(await screen.findByText(/backend não confirmou a seção de OPs vinculadas/)).toBeInTheDocument();
    expect(screen.queryByText(/OPs vinculadas às solicitações \(até 20/)).not.toBeInTheDocument();
  });
});
