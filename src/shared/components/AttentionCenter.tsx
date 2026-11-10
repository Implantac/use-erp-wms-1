import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Clock, Info, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Skeleton } from '@/ui/base/skeleton';
import { EmptyState } from '@/shared/components/EmptyState';
import { usePendingWork, type PendingSeverity } from '@/hooks/system/usePendingWork';
import { cn } from '@/lib/utils';

const severityConfig: Record<
  PendingSeverity,
  { label: string; icon: typeof AlertTriangle; dot: string; text: string; ring: string }
> = {
  critical: { label: 'Crítico', icon: AlertTriangle, dot: 'bg-destructive', text: 'text-destructive', ring: 'ring-destructive/20' },
  attention: { label: 'Atenção', icon: AlertCircle, dot: 'bg-warning', text: 'text-warning-text', ring: 'ring-warning/20' },
  pending: { label: 'Pendência', icon: Clock, dot: 'bg-info', text: 'text-info', ring: 'ring-info/20' },
  info: { label: 'Informação', icon: Info, dot: 'bg-muted-foreground', text: 'text-muted-foreground', ring: 'ring-border' },
};

interface AttentionCenterProps {
  /** Mostra apenas os primeiros itens e um link para a central completa. */
  limit?: number;
  showAllLink?: boolean;
  className?: string;
}

export function AttentionCenter({ limit, showAllLink = false, className }: AttentionCenterProps) {
  const navigate = useNavigate();
  const { items, isLoading, hasCompany, error, refetch } = usePendingWork();

  const visible = typeof limit === 'number' ? items.slice(0, limit) : items;

  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base font-semibold">O que precisa da sua atenção?</CardTitle>
        {showAllLink && items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => navigate('/pendencias')} className="gap-1">
            Ver todas <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!isLoading && hasCompany && error && (
          <div role="alert" className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">Não foi possível consultar as pendências agora.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        )}

        {!isLoading && !hasCompany && (
          <EmptyState
            compact
            icon={Info}
            title="Sem empresa selecionada"
            description="Escolha uma empresa no topo da tela para ver as pendências da operação."
          />
        )}

        {!isLoading && hasCompany && !error && visible.length === 0 && (
          <EmptyState
            compact
            icon={CheckCircle2}
            title="Nada pendente por agora"
            description="Nenhuma falta de estoque, aprovação, recebimento ou divergência em aberto."
          />
        )}

        {!isLoading && !error &&
          visible.map((item) => {
            const cfg = severityConfig[item.severity];
            const Icon = cfg.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3 ring-1 ring-inset sm:flex-row sm:items-center sm:justify-between',
                  cfg.ring
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn('mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted', cfg.text)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', cfg.text)}>
                        <span className={cn('h-2 w-2 rounded-full', cfg.dot)} aria-hidden="true" />
                        {cfg.label}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{item.title}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Button size="sm" className="shrink-0 gap-1" onClick={() => navigate(item.href)}>
                  {item.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
