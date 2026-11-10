import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/ui/base/card';
import type { KPICard as KPICardType } from '@/types';
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Truck,
  Package,
  Activity,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Truck,
  Package,
  Activity,
};

const colorClasses: Record<string, { bg: string; icon: string; badge: string }> = {
  primary: {
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/10 text-primary',
  },
  success: {
    bg: 'bg-success/10',
    icon: 'text-success',
    badge: 'bg-success/10 text-success',
  },
  warning: {
    bg: 'bg-warning/10',
    icon: 'text-warning-text',
    badge: 'bg-warning/10 text-warning-text',
  },
  destructive: {
    bg: 'bg-destructive/10',
    icon: 'text-destructive',
    badge: 'bg-destructive/10 text-destructive',
  },
  info: {
    bg: 'bg-info/10',
    icon: 'text-info',
    badge: 'bg-info/10 text-info',
  },
};

interface Props {
  kpi: KPICardType;
}

export function KPICard({ kpi }: Props) {
  const Icon = iconMap[kpi.icon];
  const colors = colorClasses[kpi.color] || colorClasses.primary;

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            {kpi.change !== undefined && (
              <div
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  kpi.changeType === 'increase' && 'bg-success/10 text-success',
                  kpi.changeType === 'decrease' && 'bg-destructive/10 text-destructive',
                  kpi.changeType === 'neutral' && 'bg-muted text-muted-foreground'
                )}
              >
                {kpi.changeType === 'increase' && <ArrowUpRight className="h-3 w-3" />}
                {kpi.changeType === 'decrease' && <ArrowDownRight className="h-3 w-3" />}
                {kpi.changeType === 'neutral' && <Minus className="h-3 w-3" />}
                {Math.abs(kpi.change)}%
              </div>
            )}
          </div>
          <div className={cn('rounded-xl p-3', colors.bg)}>
            {Icon && <Icon className={cn('h-6 w-6', colors.icon)} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
