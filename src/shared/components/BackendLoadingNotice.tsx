import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';

/**
 * QA-UX (rodada 8, UX8-01): o `BackendErrorBanner` da r7 so aparece quando
 * o erro CONSOLIDA. Entre a 1a falha e esse momento o React Query refaz a
 * consulta em silencio — o usuario via apenas "Carregando..." por ~2,8 s.
 *
 * Este aviso cobre exatamente essa janela: `fetchFailureCount > 0` E
 * `fetchStatus === 'fetching'` E observadores ativos. Nao e um spinner:
 * `ux:resilience` conta `.animate-spin` como possivel tela travada, entao
 * aqui se usa apenas `role="status"` com texto.
 *
 * Some automaticamente quando a consulta consolida — em sucesso, ou em erro
 * quando o banner da r7 assume.
 */
const MESSAGE = 'Alguns dados estão demorando para carregar. Estamos tentando novamente…';

type CachedQuery = {
  getObserversCount: () => number;
  state: { fetchStatus: string; fetchFailureCount: number };
};

function isRetrying(cache: { getAll: () => CachedQuery[] }): boolean {
  return cache.getAll().some(
    (q) =>
      q.getObserversCount() > 0 &&
      q.state.fetchStatus === 'fetching' &&
      q.state.fetchFailureCount > 0,
  );
}

export function BackendLoadingNotice() {
  const client = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const cache = client.getQueryCache();
    const sync = () => setRetrying(isRetrying(cache));
    sync();
    return cache.subscribe(sync);
  }, [client]);

  if (!retrying) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-ux-retry-notice="true"
      className="fixed bottom-3 left-1/2 z-[99] flex w-[min(calc(100vw-2rem),560px)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground shadow-md"
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{MESSAGE}</span>
    </div>
  );
}
