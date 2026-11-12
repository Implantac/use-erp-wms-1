import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { BackendLoadingNotice } from './BackendLoadingNotice';
import { BackendErrorBanner } from './BackendErrorBanner';

// Cache/observers reais: o SDK pode manter a promise pendente por varios
// segundos sem incrementar fetchFailureCount. Nao substituimos o QueryCache.
const clients: QueryClient[] = [];
const unsubscribers: Array<() => void> = [];
const NOTICE_DELAY = 1500;

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(c);
  return c;
}
function observe(c: QueryClient, key: string, fn: () => Promise<string>, retry = false) {
  const observer = new QueryObserver(c, {
    queryKey: [key], queryFn: fn, retry: retry ? 1 : false, retryDelay: 1000, gcTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  unsubscribers.push(unsubscribe);
  return { observer, unsubscribe };
}
function mount(c: QueryClient, withErrorBanner = false) {
  return render(<QueryClientProvider client={c}>
    <BackendLoadingNotice />
    {withErrorBanner && <BackendErrorBanner />}
  </QueryClientProvider>);
}
const notice = () => document.querySelector('[data-ux-retry-notice]');
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = async (fn: () => void) => act(async () => { fn(); await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('BackendLoadingNotice — espera longa sem alterar o transporte (QA-18)', () => {
  it('nao pisca antes de 1500ms nem acusa erro no carregamento inicial', async () => {
    const c = client(), pending = deferred();
    observe(c, 'orders', () => pending.promise);
    mount(c);
    await advance(NOTICE_DELAY - 1);
    expect(notice()).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('anuncia promise lenta mesmo com fetchFailureCount=0, sem afirmar retry ou falha', async () => {
    const c = client(), pending = deferred();
    const fn = vi.fn(() => pending.promise);
    observe(c, 'orders', fn);
    mount(c);
    await advance(NOTICE_DELAY);
    expect(c.getQueryState(['orders'])?.fetchFailureCount).toBe(0);
    expect(notice()).toHaveAttribute('data-ux-loading-phase', 'slow');
    expect(notice()).toHaveTextContent(/demorando para carregar/i);
    expect(notice()).not.toHaveTextContent(/tentando novamente|erro|falha|503|JWT|PGRST/i);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('e status polite/atomic, nao spinner, toast, alerta ou superficie interativa', async () => {
    const c = client(), pending = deferred();
    observe(c, 'products', () => pending.promise);
    mount(c);
    await advance(NOTICE_DELAY);
    expect(notice()).toHaveAttribute('role', 'status');
    expect(notice()).toHaveAttribute('aria-live', 'polite');
    expect(notice()).toHaveAttribute('aria-atomic', 'true');
    expect(notice()).toHaveClass('pointer-events-none');
    expect(notice()?.querySelector('.animate-spin,button,a,[data-sonner-toast]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('some no sucesso real e nao modifica o dado ou numero de chamadas', async () => {
    const c = client(), pending = deferred();
    const fn = vi.fn(() => pending.promise);
    observe(c, 'orders', fn);
    mount(c);
    await advance(NOTICE_DELAY);
    expect(notice()).not.toBeNull();
    await settle(() => pending.resolve('resultado real'));
    expect(notice()).toBeNull();
    expect(c.getQueryData(['orders'])).toBe('resultado real');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('carregamento rapido termina sem exibir aviso tardio', async () => {
    const c = client(), pending = deferred();
    observe(c, 'quick', () => pending.promise);
    mount(c);
    await advance(500);
    await settle(() => pending.resolve('ok'));
    await advance(10000);
    expect(notice()).toBeNull();
  });

  it('cede ao banner de erro final sem expor o texto tecnico', async () => {
    const c = client(), pending = deferred();
    observe(c, 'orders', () => pending.promise);
    mount(c, true);
    await advance(NOTICE_DELAY);
    expect(notice()).not.toBeNull();
    await settle(() => pending.reject(new Error('QA18_PRIVATE_ERROR_503 PGRST SQL')));
    expect(notice()).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível carregar/i);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/QA18_PRIVATE_ERROR|PGRST|SQL/);
  });

  it('anuncia retry conhecido imediatamente, sem aguardar o limiar de lentidao', async () => {
    const c = client(), pending = deferred();
    const fn = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockImplementation(() => pending.promise);
    observe(c, 'retry', fn, true);
    mount(c);
    await advance(0);
    expect(c.getQueryState(['retry'])?.fetchFailureCount).toBe(1);
    expect(notice()).toHaveAttribute('data-ux-loading-phase', 'retrying');
    expect(notice()).toHaveTextContent(/Estamos tentando novamente/i);
    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    await settle(() => pending.resolve('ok apos retry'));
    expect(notice()).toBeNull();
  });

  it('ignora prefetch sem observador ativo mesmo apos o limiar', async () => {
    const c = client(), pending = deferred();
    void c.prefetchQuery({ queryKey: ['prefetch'], queryFn: () => pending.promise });
    mount(c);
    await advance(10000);
    expect(notice()).toBeNull();
  });

  it('remove aviso e temporizador quando a rota perde seu ultimo observador', async () => {
    const c = client(), pending = deferred();
    const { unsubscribe } = observe(c, 'abandoned', () => pending.promise);
    mount(c);
    await advance(NOTICE_DELAY);
    expect(notice()).not.toBeNull();
    await settle(unsubscribe);
    expect(notice()).toBeNull();
    await advance(10000);
    expect(notice()).toBeNull();
  });

  it('nao considera consulta pausada/offline como uma consulta em andamento', async () => {
    onlineManager.setOnline(false);
    const c = client(), pending = deferred();
    observe(c, 'offline', () => pending.promise);
    mount(c);
    expect(c.getQueryState(['offline'])?.fetchStatus).toBe('paused');
    await advance(10000);
    expect(notice()).toBeNull();
  });

  it('eventos de outras queries nao reiniciam a idade da consulta lenta', async () => {
    const c = client(), pending = deferred();
    observe(c, 'slow', () => pending.promise);
    mount(c);
    await advance(1000);
    act(() => { c.setQueryData(['unrelated'], 'ok'); });
    await advance(499);
    expect(notice()).toBeNull();
    await advance(1);
    expect(notice()).toHaveAttribute('data-ux-loading-phase', 'slow');
  });

  it('um novo ciclo de refetch recebe seu proprio prazo, sem herdar aviso antigo', async () => {
    const c = client(), first = deferred(), second = deferred();
    const fn = vi.fn<() => Promise<string>>()
      .mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const { observer } = observe(c, 'cycles', fn);
    mount(c);
    await advance(NOTICE_DELAY);
    await settle(() => first.resolve('primeiro'));
    expect(notice()).toBeNull();
    await advance(2000);
    act(() => { void observer.refetch(); });
    expect(notice()).toBeNull();
    await advance(NOTICE_DELAY - 1);
    expect(notice()).toBeNull();
    await advance(1);
    expect(notice()).not.toBeNull();
    expect(c.getQueryData(['cycles'])).toBe('primeiro');
    await settle(() => second.resolve('segundo'));
    expect(notice()).toBeNull();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('consultas concorrentes conservam idades independentes', async () => {
    const c = client(), first = deferred(), second = deferred();
    observe(c, 'old', () => first.promise);
    mount(c);
    await advance(1000);
    act(() => { observe(c, 'new', () => second.promise); });
    await advance(600);
    expect(notice()).not.toBeNull();
    await settle(() => first.resolve('ok'));
    expect(notice()).toBeNull();
    await advance(899);
    expect(notice()).toBeNull();
    await advance(1);
    expect(notice()).not.toBeNull();
  });

  it('limpa o timer ao desmontar e e seguro com efeitos duplicados do StrictMode', async () => {
    const c = client(), pending = deferred();
    observe(c, 'strict', () => pending.promise);
    const view = render(<StrictMode><QueryClientProvider client={c}><BackendLoadingNotice /></QueryClientProvider></StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(10000);
    expect(notice()).toBeNull();
  });

  it('nao bloqueia a utilizacao dos dados ja exibidos durante refetch', async () => {
    const c = client(), pending = deferred(), click = vi.fn();
    c.setQueryData(['cached'], 'dados anteriores');
    observe(c, 'cached', () => pending.promise);
    render(<QueryClientProvider client={c}>
      <p>{c.getQueryData<string>(['cached'])}</p><button onClick={click}>Consultar dados exibidos</button>
      <BackendLoadingNotice />
    </QueryClientProvider>);
    await advance(NOTICE_DELAY);
    expect(notice()).not.toBeNull();
    expect(screen.getByText('dados anteriores')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar dados exibidos' }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});
