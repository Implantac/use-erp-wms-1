import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent } from '@/ui/base/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { TrendingUp, ShieldAlert, BarChart3, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { useMLPredictions } from './ml-predictions/useMLPredictions';
import { DemandForecastCard } from './ml-predictions/DemandForecastCard';
import { DelayRiskTable } from './ml-predictions/DelayRiskTable';
import { AnomaliesCard } from './ml-predictions/AnomaliesCard';
import { OptimizationList } from './ml-predictions/OptimizationList';
import { AIInsightsPanel } from './ml-predictions/AIInsightsPanel';

export default function MLPredictions() {
  const { demandForecast, delayRisk, anomalies, optimizations } = useMLPredictions();

  const criticalCount = delayRisk.filter(r => r.riskScore >= 70).length;
  const anomalyCount = anomalies.filter(a => a.isAnomaly).length;
  const forecastTotal = demandForecast.filter(d => d.forecast).reduce((s, d) => s + (d.forecast || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="🤖 Machine Learning — Predições Industriais"
        description="Previsão de demanda (Holt-Winters), risco de atraso multi-fator, detecção de anomalias e otimização"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Previsão Próximas 6 Semanas</p>
              <p className="text-xl font-bold">{formatNumber(forecastTotal)} un</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn('border-l-4', criticalCount > 0 ? 'border-l-destructive' : 'border-l-success')}>
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className={cn('h-8 w-8', criticalCount > 0 ? 'text-destructive' : 'text-success')} />
            <div>
              <p className="text-xs text-muted-foreground">Risco Crítico</p>
              <p className="text-xl font-bold">{criticalCount} OPs</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn('border-l-4', anomalyCount > 0 ? 'border-l-warning' : 'border-l-success')}>
          <CardContent className="p-4 flex items-center gap-3">
            <BarChart3 className={cn('h-8 w-8', anomalyCount > 0 ? 'text-warning-text' : 'text-success')} />
            <div>
              <p className="text-xs text-muted-foreground">Anomalias Detectadas</p>
              <p className="text-xl font-bold">{anomalyCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-chart-2">
          <CardContent className="p-4 flex items-center gap-3">
            <Lightbulb className="h-8 w-8 text-chart-2" />
            <div>
              <p className="text-xs text-muted-foreground">Sugestões de Otimização</p>
              <p className="text-xl font-bold">{optimizations.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="demand" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="demand">📈 Previsão Demanda</TabsTrigger>
          <TabsTrigger value="delay">⚠️ Risco de Atraso</TabsTrigger>
          <TabsTrigger value="anomalies">🔍 Anomalias</TabsTrigger>
          <TabsTrigger value="optimization">💡 Otimização</TabsTrigger>
          <TabsTrigger value="ai">🧠 IA Generativa</TabsTrigger>
        </TabsList>

        <TabsContent value="demand"><DemandForecastCard data={demandForecast} /></TabsContent>
        <TabsContent value="delay"><DelayRiskTable rows={delayRisk} /></TabsContent>
        <TabsContent value="anomalies"><AnomaliesCard anomalies={anomalies} /></TabsContent>
        <TabsContent value="optimization"><OptimizationList items={optimizations} /></TabsContent>
        <TabsContent value="ai"><AIInsightsPanel /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}
