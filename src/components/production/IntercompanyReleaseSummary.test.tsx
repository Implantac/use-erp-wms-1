import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ finalize: vi.fn() }));
vi.mock('@/services/production/intercompanyReleaseService', () => ({ finalizeIntercompanyProduction: mocks.finalize }));
import { IntercompanyReleaseSummary } from './IntercompanyReleaseSummary';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function show(props: Partial<React.ComponentProps<typeof IntercompanyReleaseSummary>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><IntercompanyReleaseSummary requestId={id(1)} productionOrderId={id(2)}
    productionStatus="completed" readState="ready" canManage scopeToken="context-a" {...props} /></QueryClientProvider>);
}
afterEach(() => { cleanup(); mocks.finalize.mockClear(); });
describe('release UI remains non-mutating in candidate', () => {
  it('never calls the RPC on render or while reviewing the confirmation', () => {
    show(); expect(mocks.finalize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver disponibilização gerencial' }));
    const confirm = screen.getByRole('button', { name: 'Criar pedido pendente e reserva' });
    expect(confirm).toBeDisabled(); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(mocks.finalize).not.toHaveBeenCalled(); expect(screen.getByText(/Ação preparada, mas não ativada operacionalmente/)).toBeInTheDocument();
  });
  it.each(['loading', 'error', 'incompatible', 'inconsistent', 'unavailable'] as const)('does not offer review in state %s', readState => {
    show({ readState }); expect(screen.queryByRole('button', { name: 'Ver disponibilização gerencial' })).not.toBeInTheDocument();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it('does not offer manager review to store/wrong-role users or for incomplete OP', () => {
    const { unmount } = show({ canManage: false }); expect(screen.queryByRole('button')).not.toBeInTheDocument(); unmount();
    show({ productionStatus: 'in_progress' }); expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('closes the review dialog immediately after scope changes', () => {
    const client = new QueryClient();
    const node = (scope: string) => <QueryClientProvider client={client}><IntercompanyReleaseSummary requestId={id(1)} productionOrderId={id(2)} productionStatus="completed" readState="ready" canManage scopeToken={scope} /></QueryClientProvider>;
    const view = render(node('company-a')); fireEvent.click(screen.getByRole('button', { name: 'Ver disponibilização gerencial' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument(); view.rerender(node('company-b'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
