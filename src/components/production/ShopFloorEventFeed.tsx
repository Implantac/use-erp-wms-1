import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { ProductionEvent } from '@/hooks/production/useProductionEvents';

const eventTypeLabels: Record<string, { label: string; color: string }> = {
  op_created: { label: 'OP Criada', color: 'bg-primary/15 text-primary' },
  op_started: { label: 'OP Iniciada', color: 'bg-success/15 text-success' },
  op_completed: { label: 'OP Concluída', color: 'bg-success/20 text-success' },
  op_cancelled: { label: 'OP Cancelada', color: 'bg-destructive/15 text-destructive' },
  op_status_changed: { label: 'Status OP', color: 'bg-muted text-muted-foreground' },
  step_started: { label: 'Etapa Iniciada', color: 'bg-primary/10 text-primary' },
  step_paused: { label: 'Etapa Pausada', color: 'bg-warning/15 text-warning-text' },
  step_completed: { label: 'Etapa Concluída', color: 'bg-success/10 text-success' },
  step_updated: { label: 'Etapa Atualizada', color: 'bg-muted text-muted-foreground' },
  iot_threshold_exceeded: { label: 'IoT Alerta', color: 'bg-destructive/15 text-destructive' },
  iot_anomaly: { label: 'IoT Anomalia', color: 'bg-warning/15 text-warning-text' },
};

interface Props {
  events: ProductionEvent[];
}

export default function ShopFloorEventFeed({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4 animate-pulse text-primary" /> Feed de Eventos — Tempo Real
          <Badge variant="outline" className="text-xs ml-auto">{events.length} hoje</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {events.slice(0, 20).map(e => {
            const meta = eventTypeLabels[e.event_type] || { label: e.event_type, color: 'bg-muted text-muted-foreground' };
            return (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm">
                <span className="text-xs text-muted-foreground font-mono w-14 shrink-0">
                  {format(new Date(e.created_at), 'HH:mm:ss')}
                </span>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', meta.color)}>
                  {meta.label}
                </Badge>
                <span className="font-medium truncate">{e.entity_name || '-'}</span>
                {e.operator && <span className="text-muted-foreground text-xs truncate">• {e.operator}</span>}
                {e.sector && <span className="text-muted-foreground text-xs truncate hidden md:inline">• {e.sector}</span>}
                {e.severity !== 'info' && (
                  <Badge variant={e.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[10px] ml-auto shrink-0">
                    {e.severity}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
