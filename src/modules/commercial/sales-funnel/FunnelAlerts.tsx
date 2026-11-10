import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { AlertTriangle, ArrowRight, CheckCircle2, Pencil } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { formatBRL } from '@/lib/formatters';
import { EmptyState } from '@/shared/components/EmptyState';
import { FUNNEL_STAGES, type DbFunnelItem } from '@/hooks/commercial/useSalesFunnel';

export function FunnelAlerts({
  items, onAdvance, onEdit,
}: { items: DbFunnelItem[]; onAdvance: (i: DbFunnelItem) => void; onEdit: (i: DbFunnelItem) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-text" />
          Oportunidades Estagnadas ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map(item => {
              const days = differenceInDays(new Date(), new Date(item.updated_at || item.created_at));
              const stage = FUNNEL_STAGES.find(s => s.value === item.stage);
              return (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage?.color || 'bg-muted'}`} />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {stage?.label} • {formatBRL(item.value)} • Parado há <span className="font-semibold text-warning-text">{days} dias</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onAdvance(item)}>
                      <ArrowRight className="h-3 w-3 mr-1" />Avançar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => onEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState compact icon={CheckCircle2} title="Nenhuma oportunidade estagnada 🎉" description="Seu funil está saudável. Continue avançando as negociações." />
        )}
      </CardContent>
    </Card>
  );
}
