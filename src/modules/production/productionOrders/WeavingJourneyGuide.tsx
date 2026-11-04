import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Progress } from '@/ui/base/progress';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { getWeavingNextStage, type WeavingJourneyStage } from '@/lib/pcp/weavingManagerGuide';
import { productionOrderStatusLabel } from './orderPresentation';
import { cn } from '@/lib/utils';

interface Props {
  order: ProductionOrderRow;
  stages: WeavingJourneyStage[];
  onNavigate: (targetId: string) => void;
}

/**
 * Rota visual da OP selecionada. Em vez de obrigar o gerente a interpretar
 * seis painéis técnicos, mostra onde a OP está, o que já foi feito e qual é
 * a única próxima ação. Cada etapa leva ao painel correspondente.
 */
export function WeavingJourneyGuide({ order, stages, onNavigate }: Props) {
  const next = getWeavingNextStage(stages);
  const done = stages.filter((stage) => stage.state === 'done').length;
  const progress = stages.length > 0 ? (done / stages.length) * 100 : 0;
  const cancelled = ['cancelled', 'canceled'].includes(order.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rota desta OP — do tear ao estoque</CardTitle>
            <CardDescription>
              {order.order_number} · {order.product_name} · {productionOrderStatusLabel(order.status)}
            </CardDescription>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{done}/{stages.length} etapas concluídas</span>
        </div>
        <Progress value={progress} className="mt-3" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-5">
          {stages.map((stage, index) => (
            <button
              key={stage.key}
              type="button"
              onClick={() => onNavigate(stage.targetId)}
              className={cn(
                'min-h-28 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                stage.state === 'done' && 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/10',
                stage.state === 'current' && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                stage.state === 'blocked' && 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/10',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-muted-foreground">{index + 1}</span>
                {stage.state === 'done'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : stage.state === 'blocked'
                    ? <AlertTriangle className="h-4 w-4 text-red-600" />
                    : stage.state === 'current'
                      ? <CircleDot className="h-4 w-4 text-primary" />
                      : <Circle className="h-4 w-4 text-muted-foreground" />}
              </span>
              <span className="mt-2 block text-sm font-bold leading-tight">{stage.label}</span>
              <span className="mt-1 line-clamp-3 block text-[11px] leading-relaxed text-muted-foreground">{stage.detail}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Atalhos desta OP:</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate('pcp-perfil-tear')}>Montagem do tear</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate('pcp-paradas')}>Paradas e rupturas</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onNavigate('pcp-programacao')}>Fila dos teares</Button>
        </div>

        {order.status === 'completed' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> <strong>OP concluída.</strong> O tecido já entrou em estoque; confira o lote no painel final.</p>
            <Button size="sm" variant="outline" onClick={() => onNavigate('pcp-estoque')}>Ver entrada em estoque</Button>
          </div>
        ) : cancelled ? (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Esta OP está cancelada. A rota fica apenas para consulta; nenhuma ação de produção deve ser feita nela.</p>
        ) : next ? (
          <div className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm',
            next.state === 'blocked'
              ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/20 dark:text-red-100'
              : 'border-primary/30 bg-primary/5',
          )}>
            <p className="flex min-w-0 items-start gap-2">
              {next.state === 'blocked' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleDot className="mt-0.5 h-4 w-4 shrink-0" />}
              <span><strong>Próxima ação: {next.label}.</strong> <span className="opacity-80">{next.detail}</span></span>
            </p>
            <Button size="sm" onClick={() => onNavigate(next.targetId)}>
              Fazer agora <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
