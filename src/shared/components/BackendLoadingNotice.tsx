import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';

/**
 * QA-UX r18: o SDK pode fazer retries internos sem incrementar o contador
 * do React Query. Observar so fetchFailureCount deixava essa janela muda.
 *
 * Uma consulta observada ainda em andamento recebe aviso neutro apos 1,5s.
 * So afirmamos retry quando o React Query o confirmou. Nao mudamos fetch,
 * timeout, retry, dados, erro ou cancelamento: isto e apenas apresentacao.
 * Cada consulta/ciclo tem sua idade; rotas abandonadas e queries pausadas
 * nao contam. Um unico timer agenda o proximo limiar, sem polling continuo.
 */
const SLOW_NOTICE_DELAY_MS = 1500;
const MESSAGES = {
  slow: 'Alguns dados estão demorando para carregar. A consulta continua em andamento.',
  retrying: 'Alguns dados estão demorando para carregar. Estamos tentando novamente…',
};
type NoticePhase = keyof typeof MESSAGES;
type CachedQuery = {
  getObserversCount: () => number;
  state: { fetchStatus: string; fetchFailureCount: number };
};

export function BackendLoadingNotice() {
  const client = useQueryClient();
  const [phase, setPhase] = useState<NoticePhase | null>(null);

  useEffect(() => {
    const cache = client.getQueryCache();
    const pendingSince = new Map<CachedQuery, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const sync = () => {
      if (disposed) return;
      clearTimeout(timer);
      timer = undefined;
      const now = Date.now();
      const fetching = new Set<CachedQuery>();
      let slow = false, retrying = false, nextDelay = Infinity;
      for (const query of cache.getAll()) {
        if (query.getObserversCount() === 0 || query.state.fetchStatus !== 'fetching') continue;
        fetching.add(query);
        const since = pendingSince.get(query) ?? now;
        pendingSince.set(query, since);
        const remaining = SLOW_NOTICE_DELAY_MS - (now - since);
        if (remaining <= 0) slow = true;
        else nextDelay = Math.min(nextDelay, remaining);
        if (query.state.fetchFailureCount > 0) retrying = true;
      }
      for (const query of pendingSince.keys()) {
        if (!fetching.has(query)) pendingSince.delete(query);
      }
      const nextPhase = retrying ? 'retrying' : slow ? 'slow' : null;
      setPhase(nextPhase);
      if (!nextPhase && Number.isFinite(nextDelay)) timer = setTimeout(sync, nextDelay);
    };

    const unsubscribe = cache.subscribe(sync);
    sync();
    return () => {
      disposed = true;
      unsubscribe();
      clearTimeout(timer);
      pendingSince.clear();
    };
  }, [client]);

  if (!phase) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-ux-retry-notice="true"
      data-ux-loading-phase={phase}
      className="pointer-events-none fixed bottom-3 left-1/2 z-[99] flex w-[min(calc(100vw-2rem),560px)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-md"
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{MESSAGES[phase]}</span>
    </div>
  );
}
