import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { BackendErrorBanner } from './BackendErrorBanner';

// QA-19: QueryClient/QueryObserver reais. O fake antigo de apresentacao
// nao reproduz partialMatchKey nem cancelRefetch, que causavam fan-out.
const clients: QueryClient[] = [];
const unsubscribers: Array<() => void> = [];
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  clients.push(c);
  return c;
}
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function watch(c: QueryClient, key: QueryKey, fn: () => Promise<string>) {
  c.setQueryData(key, 'dados em cache');
  const observer = new QueryObserver(c, { queryKey: key, queryFn: fn, retry: false, staleTime: Infinity, gcTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  unsubscribers.push(unsubscribe);
  return { observer, unsubscribe };
}
async function refetch(observer: { refetch: () => Promise<unknown> }) {
  await act(async () => { await observer.refetch(); });
}
function mount(c: QueryClient, click = vi.fn()) {
  return render(<QueryClientProvider client={c}>
    <BackendErrorBanner />
    <button onClick={click}>Consultar dados já exibidos</button>
  </QueryClientProvider>);
}
const retryButton = () => screen.getByRole('button', { name: 'Tentar novamente' });
const error = () => new Error('QA19_PRIVATE_SQL_PGRST');

afterEach(() => {
  cleanup();
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  clients.splice(0).forEach((c) => c.clear());
});

describe('BackendErrorBanner — recuperacao seletiva real (QA-19)', () => {
  it('nao refaz um descendente saudavel da chave que falhou', async () => {
    const c = client();
    const failed = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockResolvedValue('recuperado');
    const healthy = vi.fn<() => Promise<string>>().mockResolvedValue('saudavel');
    const parent = watch(c, ['orders'], failed), child = watch(c, ['orders', 'summary'], healthy);
    await refetch(child.observer);
    await refetch(parent.observer);
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(failed).toHaveBeenCalledTimes(2);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(c.getQueryData(['orders', 'summary'])).toBe('saudavel');
  });

  it('usa correspondencia exata tambem em objetos parcialmente coincidentes', async () => {
    const c = client();
    const failed = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockResolvedValue('recuperado');
    const healthy = vi.fn<() => Promise<string>>().mockResolvedValue('filtro saudavel');
    const parent = watch(c, ['orders', { branch: 'A' }], failed);
    const child = watch(c, ['orders', { branch: 'A', status: 'open' }], healthy);
    await refetch(child.observer);
    await refetch(parent.observer);
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(2);
  });

  it('chaves com erro sobrepostas recebem so uma nova execucao cada', async () => {
    const c = client(), parentPending = deferred(), childPending = deferred();
    const parentFn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => parentPending.promise);
    const childFn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => childPending.promise);
    const parent = watch(c, ['orders'], parentFn), child = watch(c, ['orders', 'detail'], childFn);
    await refetch(parent.observer);
    await refetch(child.observer);
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(parentFn).toHaveBeenCalledTimes(2));
    expect(childFn).toHaveBeenCalledTimes(2);
    await act(async () => { parentPending.resolve('parent'); childPending.resolve('child'); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('adere ao refetch ja em voo sem cancela-lo nem iniciar outro', async () => {
    const c = client(), pending = deferred(), abort = vi.fn();
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => pending.promise);
    c.setQueryData(['cached'], 'dados em cache');
    const observer = new QueryObserver(c, {
      queryKey: ['cached'], retry: false, staleTime: Infinity, gcTime: Infinity,
      queryFn: ({ signal }) => { signal.addEventListener('abort', abort); return fn(); },
    });
    unsubscribers.push(observer.subscribe(() => {}));
    await refetch(observer);
    const click = vi.fn();
    mount(c, click);
    act(() => { void observer.refetch(); });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    fireEvent.click(retryButton());
    expect(retryButton()).toBeDisabled();
    expect(retryButton()).toHaveAttribute('aria-busy', 'true');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(abort).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar dados já exibidos' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(c.getQueryData(['cached'])).toBe('dados em cache');
    await act(async () => { pending.resolve('dado recuperado'); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(c.getQueryData(['cached'])).toBe('dado recuperado');
  });

  it('nao reinicia um descendente saudavel que ja estava refazendo sua leitura', async () => {
    const c = client(), pending = deferred();
    const failed = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockResolvedValue('recuperado');
    const healthy = vi.fn<() => Promise<string>>().mockImplementation(() => pending.promise);
    const parent = watch(c, ['orders'], failed), child = watch(c, ['orders', 'summary'], healthy);
    await refetch(parent.observer);
    mount(c);
    act(() => { void child.observer.refetch(); });
    await waitFor(() => expect(healthy).toHaveBeenCalledTimes(1));
    fireEvent.click(retryButton());
    await waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
    expect(healthy).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve('summary'); });
  });

  it('nao refaz consulta saudavel sem prefixo comum', async () => {
    const c = client();
    const failed = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockResolvedValue('ok');
    const healthy = vi.fn<() => Promise<string>>().mockResolvedValue('products');
    const parent = watch(c, ['orders'], failed), other = watch(c, ['products'], healthy);
    await refetch(parent.observer);
    await refetch(other.observer);
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('ignora erros de uma rota sem observadores, mesmo com prefixo comum', async () => {
    const c = client();
    const activeFn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockResolvedValue('ok');
    const inactiveFn = vi.fn<() => Promise<string>>().mockRejectedValue(error());
    const active = watch(c, ['orders'], activeFn), abandoned = watch(c, ['orders', 'abandoned'], inactiveFn);
    await refetch(active.observer);
    await refetch(abandoned.observer);
    abandoned.unsubscribe();
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(activeFn).toHaveBeenCalledTimes(2);
    expect(inactiveFn).toHaveBeenCalledTimes(1);
  });

  it('mantem o alerta e libera outra tentativa se a recuperacao falhar', async () => {
    const c = client();
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error());
    const query = watch(c, ['orders'], fn);
    await refetch(query.observer);
    mount(c);
    fireEvent.click(retryButton());
    await waitFor(() => expect(retryButton()).toBeEnabled());
    expect(fn).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Os dados já exibidos permanecem disponíveis.');
    expect(document.body).not.toHaveTextContent(/QA19_PRIVATE_SQL_PGRST/);
    fireEvent.click(retryButton());
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(retryButton()).toBeEnabled());
  });

  it('aguarda todos os alvos com erro antes de liberar o botao', async () => {
    const c = client(), first = deferred(), second = deferred();
    const a = watch(c, ['orders'], vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => first.promise));
    const b = watch(c, ['purchases'], vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => second.promise));
    await refetch(a.observer);
    await refetch(b.observer);
    mount(c);
    fireEvent.click(retryButton());
    expect(retryButton()).toBeDisabled();
    await act(async () => { first.resolve('ok a'); });
    expect(retryButton()).toBeDisabled();
    await act(async () => { second.resolve('ok b'); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('cliques repetidos enquanto desabilitado nao criam tentativas extras', async () => {
    const c = client(), pending = deferred();
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(error()).mockImplementation(() => pending.promise);
    const query = watch(c, ['orders'], fn);
    await refetch(query.observer);
    mount(c);
    const button = retryButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();
    await act(async () => { pending.resolve('ok'); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
