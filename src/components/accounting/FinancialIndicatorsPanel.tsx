import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/base/tooltip';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

const statusColors: Record<string, string> = {
  good: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning-text border-warning/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
};

const statusLabels: Record<string, string> = {
  good: 'Bom',
  warning: 'Atenção',
  critical: 'Crítico',
};

interface FinancialIndicator {
  name: string;
  value: number;
  previousValue: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  description: string;
}

// Empty data - will be populated from database
const financialIndicators: FinancialIndicator[] = [];

export function FinancialIndicatorsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Indicadores Financeiros</CardTitle>
      </CardHeader>
      <CardContent>
        {financialIndicators.length > 0 ? (
          <TooltipProvider delayDuration={200}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {financialIndicators.map((ind) => {
                const variation = ind.value - ind.previousValue;
                const isUp = variation > 0;

                return (
                  <Tooltip key={ind.name}>
                    <TooltipTrigger asChild>
                      <div className="rounded-lg border p-4 space-y-2 cursor-default">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">{ind.name}</p>
                          <div className="flex items-center gap-1.5">
                            <Info className="h-3 w-3 text-muted-foreground/50" />
                            <Badge variant="outline" className={cn('text-xs', statusColors[ind.status])}>
                              {statusLabels[ind.status]}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold">{ind.value.toFixed(ind.unit === 'x' ? 2 : 1)}</span>
                          <span className="text-sm text-muted-foreground">{ind.unit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn('flex items-center gap-0.5 text-xs', isUp ? 'text-success' : 'text-destructive')}>
                            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isUp ? '+' : ''}{variation.toFixed(ind.unit === 'x' ? 2 : 1)}
                          </div>
                          <span className="text-xs text-muted-foreground">vs anterior</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[250px] text-center">
                      <p className="text-xs">{ind.description}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Nenhum indicador disponível
          </div>
        )}
      </CardContent>
    </Card>
  );
}
