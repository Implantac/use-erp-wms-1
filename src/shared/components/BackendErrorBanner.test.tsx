import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * QA-UX (rodada 7) — regressao de UX7-01/02: erros de `useQuery` nao
 * chegam ao `ModuleErrorBoundary`, entao precisam de observador do
 * `QueryCache`. O cache e substituido por um fake deterministico: testa-se
 * o contrato de apresentacao do banner, sem depender de rede nem de timing
 * do React Query.
 */
type Q = {
  queryKey: readonly unknown[];
  getObserversCount: () => number;
  state: { status: string; error?: unknown };
};
type Cache = {
  getAll: () => Q[];
  subscribe: (cb: () => void) => () => void;
};
type FakeClient = {
  getQueryCache: () => Cache;
  refetchQueries: ReturnType<typeof vi.fn>;
};
type FakeShape = {
  client: FakeClient | null;
  setQueries: ((next: Q[]) => void) | null;
};

const fake = vi.hoisted((): FakeShape => ({ client: null, setQueries: null }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fake.client }));

import { BackendErrorBanner } from './BackendErrorBanner';

const ok = (): Q => ({ queryKey: ['clientes'], getObserversCount: () => 1, state: { status: 'success' } });
const broken = (): Q => ({
  queryKey: ['clientes'], getObserversCount: () => 1,
  state: { status: 'error', error: new Error('PGRST123 relation "clients" violates RLS') },
});

function setup(initial: Q[]) {
  let list = initial;
  const listeners = new Set<() => void>();
  fake.client = {
    getQueryCache: () => ({
      getAll: () => list,
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => { listeners.delete(cb); };
      },
    }),
    refetchQueries: vi.fn(async () => {}) as ReturnType<typeof vi.fn>,
  };
  fake.setQueries = (next: Q[]) => {
    list = next;
    listeners.forEach((cb) => cb());
  };
}

const setQueries = (next: Q[]) => fake.setQueries?.(next);

beforeEach(() => setup([ok()]));

describe('BackendErrorBanner', () => {
  it('fica invisivel quando nao ha falha com observador ativo', () => {
    render(<BackendErrorBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mostra mensagem acionavel, retry e nenhum detalhe tecnico', () => {
    setup([broken()]);
    render(<BackendErrorBanner />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-ux-backend-error', 'true');
    expect(alert.textContent).toMatch(/Não foi possível carregar alguns dados do servidor/i);
    expect(alert.textContent).toMatch(/Verifique sua conexão e tente novamente/i);
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    expect(alert.textContent).not.toMatch(/PGRST|violates|RLS|JWT|400/i);
  });

  it('empilha texto e acao no mobile sem mudar o alerta nem o retry', () => {
    setup([broken()]);
    render(<BackendErrorBanner />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('flex-col', 'sm:flex-row');
    expect(alert.querySelector('p')).toHaveClass('min-w-0');
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toHaveClass('self-start', 'sm:shrink-0');
    // JSDOM nao mede geometria. A altura e o clique real em 320px sao
    // verificados pelo Chromium no audit ux:users:error.
  });

  it('refaz somente as queries com erro e desaparece apos consolidar', async () => {
    setup([broken()]);
    fake.client?.refetchQueries.mockImplementation(async () => {
      act(() => setQueries([ok()]));
    });
    render(<BackendErrorBanner />);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(fake.client?.refetchQueries).toHaveBeenCalledTimes(1);
    expect(fake.client?.refetchQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['clientes'], type: 'active' }),
    );
  });
});
