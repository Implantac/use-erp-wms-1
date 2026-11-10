import { Card, CardContent } from '@/ui/base/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, FileText, Package, type LucideIcon } from 'lucide-react';

interface Props {
  totalOrders: number;
  statusCounts: Record<string, number>;
}

type Kpi = { label: string; value: number; icon: LucideIcon; color: string };

export function OrderTrackingKPIs({ totalOrders, statusCounts }: Props) {
  const kpis: Kpi[] = [
    { label: 'Total Pedidos', value: totalOrders, icon: FileText, color: 'text-primary' },
    {
      label: 'Aguardando Aprovação',
      value:
        (statusCounts['awaiting_commercial_approval'] || 0) +
        (statusCounts['awaiting_financial_approval'] || 0) +
        (statusCounts['pending'] || 0),
      icon: Clock,
      color: 'text-warning-text',
    },
    {
      label: 'Em Andamento',
      value:
        (statusCounts['in_separation'] || 0) +
        (statusCounts['in_production'] || 0) +
        (statusCounts['awaiting_billing'] || 0),
      icon: Package,
      color: 'text-info',
    },
    { label: 'Bloqueados', value: statusCounts['blocked'] || 0, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {kpis.map((k) => (
        <Card key={k.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <k.icon className={cn('h-8 w-8', k.color)} />
            <div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
