import { Loader2 } from 'lucide-react';

interface PageLoadingProps {
  message?: string;
  /** Verdadeiro quando o React Query ja esta na 2a tentativa. */
  retrying?: boolean;
}

/**
 * QA-UX (rodada 8, UX8-02): o carregamento era uma `<div>` muda. Agora e
 * anunciado a leitores de tela e informa quando ha retentativa em curso.
 */
export function PageLoading({ message = 'Carregando...', retrying = false }: PageLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-ux-loading="true"
      className="flex h-64 items-center justify-center gap-3 animate-fade-in"
    >
      <div className="relative">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div className="absolute inset-0 h-6 w-6 animate-ping rounded-full bg-primary/20" />
      </div>
      <span className="text-sm text-muted-foreground">
        {message}
        {retrying && (
          <span data-ux-retry-message="true"> Tentando novamente…</span>
        )}
      </span>
    </div>
  );
}
