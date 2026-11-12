import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/base/button';

/**
 * QA-UX (rodada 7, UX7-01/02): erros de `useQuery` NAO passam pelo
 * `ModuleErrorBoundary` (que cobre apenas crashes de render). Quatro de
 * cinco rotas com HTTP 400 ficavam silenciosas: nenhum feedback, nenhum
 * retry. Este banner observa o `QueryCache` global e cobre qualquer tela
 * futura sem exigir alteracao por pagina.
 *
 * Regras:
 * - so considera consultas com observadores ativos (ignora rotas abandonadas);
 * - texto generico em PT-BR, sem PGRST/400/JWT/SQL/stack;
 * - retry refaz SOMENTE as consultas que falharam;
 * - desaparece assim que o cache volta ao normal.
 */
const MESSAGE =
  'Não foi possível carregar alguns dados do servidor. ' +
  'Verifique sua conexão e tente novamente. ' +
  'Os dados já exibidos permanecem disponíveis.';

type FailedQuery = { queryKey: readonly unknown[] };

function failedQueries(cache: {
  getAll: () => Array<{ getObserversCount: () => number; state: { status: string }; queryKey: readonly unknown[] }>;
}): FailedQuery[] {
  return cache.getAll().filter(
    (q) => q.getObserversCount() > 0 && q.state.status === 'error',
  );
}

export function BackendErrorBanner() {
  const client = useQueryClient();
  const [failed, setFailed] = useState<FailedQuery[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const cache = client.getQueryCache();
    const sync = () => setFailed(failedQueries(cache));
    sync();
    return cache.subscribe(sync);
  }, [client]);

  const handleRetry = async () => {
    setRetrying(true);
    const keys = failedQueries(client.getQueryCache()).map((q) => q.queryKey);
    try {
      await Promise.all(
        keys.map((queryKey) =>
          client.refetchQueries({ queryKey, type: 'active' }),
        ),
      );
    } finally {
      setRetrying(false);
    }
  };

  if (failed.length === 0) return null;

  return (
    <div
      role="alert"
      data-ux-backend-error="true"
      className="fixed left-1/2 top-3 z-[100] flex w-[min(calc(100vw-2rem),640px)] -translate-x-1/2 flex-col gap-3 rounded-lg border border-destructive/40 bg-background p-3 text-sm shadow-lg sm:flex-row sm:items-start"
    >
      {/* QA-UX r16: em 320px, icone + texto + botao na mesma linha
          comprimiam o texto e o banner chegava a 873px de altura. */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-snug text-foreground">{MESSAGE}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start sm:shrink-0"
        onClick={handleRetry}
        disabled={retrying}
        aria-busy={retrying}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Tentar novamente
      </Button>
    </div>
  );
}
