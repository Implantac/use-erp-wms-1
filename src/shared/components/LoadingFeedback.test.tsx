import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * QA-UX (rodada 8) — regressao de UX7-03/UX8-01/UX8-02.
 * O cache tambem e fake aqui: o que importa e o contrato observavel
 * (role, aria-live, data-ux-*, texto) sem depender de timing real de retry.
 */
type Q = {
  queryKey: readonly unknown[];
  getObserversCount: () => number;
  state: { fetchStatus: string; fetchFailureCount: number };
};
type Cache = {
  getAll: () => Q[];
  subscribe: (cb: () => void) => () => void;
};
type FakeShape = {
  client: { getQueryCache: () => Cache } | null;
  setQueries: ((next: Q[]) => void) | null;
};

const fake = vi.hoisted((): FakeShape => ({ client: null, setQueries: null }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fake.client }));

import { PageLoading } from './PageLoading';
import { BackendLoadingNotice } from './BackendLoadingNotice';

const firstLoad = (): Q => ({
  queryKey: ['pedidos'], getObserversCount: () => 1,
  state: { fetchStatus: 'fetching', fetchFailureCount: 0 },
});
const retrying = (): Q => ({
  queryKey: ['pedidos'], getObserversCount: () => 1,
  state: { fetchStatus: 'fetching', fetchFailureCount: 1 },
});
const settled = (): Q => ({
  queryKey: ['pedidos'], getObserversCount: () => 1,
  state: { fetchStatus: 'idle', fetchFailureCount: 1 },
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
  };
  fake.setQueries = (next: Q[]) => {
    list = next;
    listeners.forEach((cb) => cb());
  };
}

const setQueries = (next: Q[]) => fake.setQueries?.(next);

beforeEach(() => setup([firstLoad()]));

describe('PageLoading', () => {
  it('anuncia o carregamento a leitores de tela', () => {
    render(<PageLoading message="Carregando pedidos..." />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('data-ux-loading', 'true');
    expect(status).toHaveTextContent('Carregando pedidos...');
  });

  it('nao menciona retentativa no primeiro carregamento', () => {
    render(<PageLoading message="Carregando pedidos..." />);
    expect(screen.queryByText(/Tentando novamente/i)).toBeNull();
    expect(document.querySelector('[data-ux-retry-message]')).toBeNull();
  });

  it('informa a retentativa quando retrying e verdadeiro', () => {
    render(<PageLoading message="Carregando pedidos..." retrying />);
    expect(screen.getByText(/Tentando novamente/i)).toBeInTheDocument();
    expect(document.querySelector('[data-ux-retry-message]')).toBeInTheDocument();
  });
});

describe('BackendLoadingNotice', () => {
  it('fica invisivel no primeiro carregamento (sem falha previa)', () => {
    render(<BackendLoadingNotice />);
    expect(document.querySelector('[data-ux-retry-notice]')).toBeNull();
  });

  it('aparece durante retentativa real, sem vazamento tecnico, e some ao consolidar', () => {
    setup([retrying()]);
    render(<BackendLoadingNotice />);
    const notice = document.querySelector('[data-ux-retry-notice]');
    expect(notice).not.toBeNull();
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice?.textContent).toMatch(/Estamos tentando novamente/i);
    expect(notice?.textContent).not.toMatch(/PGRST|503|JWT|SQL|Failed to fetch/i);
    expect(notice?.querySelector('.animate-spin')).toBeNull();

    act(() => setQueries([settled()]));
    expect(document.querySelector('[data-ux-retry-notice]')).toBeNull();
  });
});
