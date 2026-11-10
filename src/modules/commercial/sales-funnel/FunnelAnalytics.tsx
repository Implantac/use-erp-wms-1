import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { BarChart3, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBRL } from '@/lib/formatters';
import { EmptyState } from '@/shared/components/EmptyState';

type StageMetric = { value: string; label: string; color: string; count: number; totalValue: number; avgDays: number; stageConversion: number };

export function FunnelAnalytics({
  stageMetrics, funnelChartData,
}: {
  stageMetrics: StageMetric[];
  funnelChartData: Array<{ name: string; count: number; value: number }>;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Métricas por Etapa do Funil</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Etapa</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Qtd</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo Médio</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {stageMetrics.map((m, idx) => (
                  <tr key={m.value} className={idx < stageMetrics.length - 1 ? 'border-b' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${m.color}`} />
                        <span className="font-medium">{m.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center"><Badge variant="secondary" className="font-mono">{m.count}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatBRL(m.totalValue)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className={m.avgDays > 14 ? 'text-warning-text font-semibold' : ''}>{m.avgDays} dias</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-center">
                        <Progress value={m.stageConversion} className="h-1.5 w-16" />
                        <span className="text-xs font-medium w-10 text-right">{m.stageConversion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Distribuição do Pipeline</CardTitle></CardHeader>
        <CardContent>
          {funnelChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnelChartData}>
                <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number, name: string) => [name === 'value' ? formatBRL(v) : v, name === 'value' ? 'Valor' : 'Quantidade']} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Quantidade" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState compact icon={BarChart3} title="Sem dados" description="Cadastre oportunidades para visualizar o gráfico de conversão." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
