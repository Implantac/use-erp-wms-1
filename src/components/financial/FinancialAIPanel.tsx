import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { Skeleton } from '@/ui/base/skeleton';
import { useFinancialInsights } from '@/hooks/financial/useFinancialInsights';
import { Brain, AlertTriangle, TrendingUp, Lightbulb, ShieldCheck } from 'lucide-react';

import { formatBRL, formatDateTime, formatNumber } from '@/lib/formatters';
const severityColor: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-warning/10 text-warning-text border-warning/30',
  medium: 'bg-warning/5 text-warning-foreground border-warning/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const typeIcon = {
  alert: AlertTriangle,
  recommendation: Lightbulb,
  opportunity: TrendingUp,
};

export function FinancialAIPanel() {
  const { data, isLoading } = useFinancialInsights();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> IA Financeira</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const gradeColor =
    data.scoreGrade === 'A' ? 'text-success' :
    data.scoreGrade === 'B' ? 'text-primary' :
    data.scoreGrade === 'C' ? 'text-warning-text' : 'text-destructive';

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> IA Financeira — Análise Inteligente</span>
          <Badge variant="outline" className="font-mono">Score: <span className={`ml-1 font-bold ${gradeColor}`}>{data.score}/100 ({data.scoreGrade})</span></Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Saúde Financeira</span>
            <span>{data.score}%</span>
          </div>
          <Progress value={data.score} className="h-2" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Projeção 30d</p>
            <p className={`text-lg font-bold ${data.metrics.projectedBalance30d >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatBRL(data.metrics.projectedBalance30d)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Projeção 60d</p>
            <p className={`text-lg font-bold ${data.metrics.projectedBalance60d >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatBRL(data.metrics.projectedBalance60d)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Projeção 90d</p>
            <p className={`text-lg font-bold ${data.metrics.projectedBalance90d >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatBRL(data.metrics.projectedBalance90d)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {data.insights.map((insight, i) => {
            const Icon = typeIcon[insight.type] ?? ShieldCheck;
            return (
              <div key={i} className={`rounded-lg border p-3 ${severityColor[insight.severity]}`}>
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">{insight.title}</p>
                      <Badge variant="outline" className="text-[10px] uppercase">{insight.severity}</Badge>
                    </div>
                    <p className="text-xs mt-1 opacity-90">{insight.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground text-right">
          Análise gerada com base em dados reais do sistema · {formatDateTime(data.computedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
