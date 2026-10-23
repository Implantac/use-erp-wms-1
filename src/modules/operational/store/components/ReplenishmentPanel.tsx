import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Skeleton } from '@/ui/base/skeleton';
import { EmptyState } from '@/shared/components/EmptyState';
import { AlertTriangle, CheckCircle2, Factory, RefreshCw, ShoppingCart, Store, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreReplenishment } from '@/hooks/operational/store/useStoreReplenishment';
import type { ReplenishmentRecommendation, SourceType } from '@/services/operational/inventory/replenishmentEngine';

const SOURCE_LABEL: Record<SourceType, string> = {
  FACTORY: 'Fábrica',
  CD: 'CD',
  STORE: 'Outra loja',
  PURCHASE: 'Compra',
};

function SourceIcon({ type }: { type: SourceType }) {
  if (type === 'FACTORY') return <Factory className="h-3.5 w-3.5" />;
  if (type === 'CD') return <Truck className="h-3.5 w-3.5" />;
  if (type === 'STORE') return <Store className="h-3.5 w-3.5" />;
  return <ShoppingCart className="h-3.5 w-3.5" />;
}

function RecommendationRow({
  rec,
  onSubmit,
  isSubmitting,
}: {
  rec: ReplenishmentRecommendation;
  onSubmit: (qty: number) => void;
  isSubmitting: boolean;
}) {
  const [qty, setQty] = useState<string>(String(rec.suggestedQty));
  const numericQty = Number(qty) || 0;

  return (
    <div className="p-4 space-y-3 hover:bg-muted/30 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold truncate">{rec.productName}</p>
            {rec.productCode && (
              <Badge variant="outline" className="text-[9px] h-4 py-0">
                {rec.productCode}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-4 py-0',
                rec.urgency === 'critical'
                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                  : 'bg-warning/10 text-warning border-warning/20',
              )}
            >
              {rec.urgency === 'critical' ? 'Ruptura' : 'Atenção'}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{rec.reason}</p>
          {rec.sourceOptions.length > 0 ? (
            <p className="text-[11px] mt-1 flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Onde há saldo:</span>
              {rec.sourceOptions.map((o) => (
                <Badge key={o.branchId} variant="secondary" className="text-[9px] h-4 py-0 gap-1">
                  <SourceIcon type={o.type} /> {SOURCE_LABEL[o.type]} · {o.branchName} ({o.availableQty} un)
                </Badge>
              ))}
            </p>
          ) : (
            <p className="text-[11px] mt-1 text-amber-600">
              Sem saldo na rede — o almoxarifado pode pedir produção à fábrica.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Disponível</p>
            <p className="text-sm font-bold">{rec.coverageResult.available}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">A caminho</p>
            <p className="text-sm font-bold text-violet-500">{rec.coverageResult.inTransitIn}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-muted-foreground">Ideal</p>
            <p className="text-sm font-bold">{rec.targetStock}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 text-xs sm:w-28"
          aria-label={`Quantidade a solicitar de ${rec.productName}`}
        />
        <Button
          size="sm"
          className="h-9 gap-2 text-xs"
          disabled={isSubmitting || numericQty <= 0}
          onClick={() => onSubmit(numericQty)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Solicitar abastecimento
        </Button>
        <span className="text-[10px] text-muted-foreground">
          Você não escolhe a origem: o almoxarifado decide (outra Loja, CD ou fábrica).
        </span>
      </div>
    </div>
  );
}

export function ReplenishmentPanel() {
  const { recommendations, isLoading, refetch, createRequest, isSubmitting } = useStoreReplenishment();
  const [filter, setFilter] = useState<'all' | 'FACTORY' | 'STORE'>('all');

  const list = useMemo(() => {
    if (filter === 'all') return recommendations;
    if (filter === 'FACTORY') return recommendations.filter((r) => r.sourceType === 'FACTORY' || r.sourceType === 'CD');
    return recommendations.filter((r) => r.sourceType === 'STORE');
  }, [recommendations, filter]);

  const criticalCount = recommendations.filter((r) => r.urgency === 'critical').length;

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" /> Reposição da Loja
            </CardTitle>
            <CardDescription>
              Fluxo único da Loja: 1) confira o estoque 2) solicite o abastecimento 3) o almoxarifado decide a origem (outra Loja, CD ou fábrica) 4) acompanhe e receba
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                {criticalCount} em ruptura
              </Badge>
            )}
            <div className="flex rounded-md border overflow-hidden">
              {(['all', 'FACTORY', 'STORE'] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-none text-[11px]"
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'Tudo' : f === 'FACTORY' ? 'Fábrica/CD' : 'Entre lojas'}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-2 text-[11px]" onClick={() => refetch()}>
              <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} /> Recalcular
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : list.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={recommendations.length === 0 ? CheckCircle2 : AlertTriangle}
              title={recommendations.length === 0 ? 'Estoque equilibrado' : 'Nenhum item neste filtro'}
              description={
                recommendations.length === 0
                  ? 'Nenhum produto desta loja está abaixo do nível ideal de estoque.'
                  : 'Troque o filtro para ver as demais sugestões de reposição.'
              }
            />
          </div>
        ) : (
          <div className="divide-y">
            {list.map((rec) => (
              <RecommendationRow
                key={`${rec.productId}-${rec.branchId}`}
                rec={rec}
                isSubmitting={isSubmitting}
                onSubmit={(quantity) => createRequest({ recommendation: rec, quantity })}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
