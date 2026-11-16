import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ finalize: vi.fn() }));
vi.mock('@/services/production/intercompanyReleaseService', () => ({ finalizeIntercompanyProduction: mocks.finalize }));
import { IntercompanyReleaseSummary } from './IntercompanyReleaseSummary';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); mocks.finalize.mockClear(); });
function show(onRefresh: () => Promise<unknown>) {
  const client = new QueryClient(); clients.push(client);
  const node = (scope: string) => <QueryClientProvider client={client}><IntercompanyReleaseSummary requestId={id(1)} productionOrderId={id(2)}
    productionStatus="completed" readState="ready" canManage scopeToken={scope} onRefresh={onRefresh} /></QueryClientProvider>;
  const view = render(node('scope-a')); return { ...view, node };
}
describe('LOJ-05A v2: visible non-mutating re-read feedback', () => {
  it('shows successful read feedback outside a closed manager dialog, without claiming release', async () => {
    const reread = vi.fn().mockResolvedValue(undefined); show(reread);
    fireEvent.click(screen.getByRole('button', { name: 'Reconsultar lastro (sem reenviar)' }));
    await waitFor(() => expect(screen.getByText(/Leitura do lastro atualizada/)).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it('shows failed read feedback even when the manager dialog was never opened', async () => {
    show(vi.fn().mockRejectedValue(new Error('read failed')));
    fireEvent.click(screen.getByRole('button', { name: 'Reconsultar lastro (sem reenviar)' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Reconsulta não confirmada'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it('announces an in-flight re-read and does not dispatch a second one', async () => {
    let finish: () => void = () => { throw new Error('not initialized'); };
    const reread = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })); show(reread);
    fireEvent.click(screen.getByRole('button', { name: 'Reconsultar lastro (sem reenviar)' }));
    const busy = screen.getByRole('button', { name: 'Reconsultando lastro…' });
    expect(busy).toBeDisabled(); fireEvent.click(busy); expect(reread).toHaveBeenCalledTimes(1);
    await act(async () => finish()); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it('does not show an old-context refresh outcome after the scope changes', async () => {
    let reject: (reason: Error) => void = () => { throw new Error('not initialized'); };
    const view = show(() => new Promise((_resolve, no) => { reject = no; }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconsultar lastro (sem reenviar)' }));
    view.rerender(view.node('scope-b'));
    await act(async () => reject(new Error('old-context failure')));
    expect(screen.queryByText(/Reconsulta não confirmada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Leitura do lastro atualizada/)).not.toBeInTheDocument();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('does not resurface an old read outcome after A → B → A', async () => {
    let finish: () => void = () => { throw new Error('not initialized'); };
    const view = show(() => new Promise<void>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconsultar lastro (sem reenviar)' }));
    view.rerender(view.node('scope-b')); view.rerender(view.node('scope-a'));
    await act(async () => finish());
    expect(screen.queryByText(/Leitura do lastro atualizada/)).not.toBeInTheDocument();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
