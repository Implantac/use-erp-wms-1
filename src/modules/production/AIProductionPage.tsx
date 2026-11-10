import type { LucideIcon } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { useAIProductionInsights } from '@/hooks/production/useAIProductionInsights';
import { useDecisionEngine } from '@/hooks/ai/useDecisionEngine';
import { Brain, Sparkles, CheckCircle, AlertTriangle, TrendingDown, Zap, Loader2, ArrowRight, Package, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const severityConfig: Record<string, { color: string; icon: LucideIcon }> = {
  low: { color: 'bg-info/15 text-info', icon: Zap },
  medium: { color: 'bg-warning/15 text-warning-text', icon: AlertTriangle },
  high: { color: 'bg-warning/15 text-warning-text', icon: AlertTriangle },
  critical: { color: 'bg-destructive/15 text-destructive', icon: TrendingDown },
};

const typeLabels: Record<string, string> = {
  bottleneck: '🔴 Gargalo', delay_risk: '⏰ Risco de Atraso', low_productivity: '📉 Baixa Produtividade',
  capacity_optimization: '⚡ Otimização', material_shortage: '📦 Falta de Material', rebalance: '🔄 Redistribuição',
};

export default function AIProductionPage() {
  const { insights, loading, generating, generateInsights, resolveInsight } = useAIProductionInsights();
  const { decisions, loading: decisionLoading, runDecisionEngine } = useDecisionEngine();
  const active = insights.filter(i => i.status === 'active');
  const resolved = insights.filter(i => i.status === 'resolved');

  return (
    <PageContainer loading={loading}>
      <PageHeader title="🧠 IA de Produção" description="Inteligência artificial para otimização da fábrica">
        <div className="flex gap-2">
          <Button onClick={generateInsights} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Gerar Insights
          </Button>
          <Button variant="outline" onClick={runDecisionEngine} disabled={decisionLoading}>
            {decisionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
            Motor de Decisão
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard title="Insights Total" value={insights.length} icon={<Brain className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Ativos" value={active.length} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={1} />
        <KPICard title="Resolvidos" value={resolved.length} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="Decisões" value={decisions ? (decisions.priority_sequence?.length || 0) : 0} icon={<Zap className="h-5 w-5" />} accentColor="info" index={3} />
      </div>

      <Tabs defaultValue="insights">
        <TabsList>
          <TabsTrigger value="insights">Insights IA ({active.length})</TabsTrigger>
          <TabsTrigger value="decisions">Motor de Decisão</TabsTrigger>
          <TabsTrigger value="history">Histórico ({resolved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4">
          {active.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Nenhum insight ativo</p>
                <p className="text-sm text-muted-foreground mb-4">Clique em "Gerar Insights" para analisar a produção</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {active.map(insight => {
              const sev = severityConfig[insight.severity] || severityConfig.medium;
              const SevIcon = sev.icon;
              return (
                <Card key={insight.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SevIcon className="h-5 w-5" />
                          <span className="font-semibold">{insight.title}</span>
                          <Badge className={sev.color}>{insight.severity}</Badge>
                          <Badge variant="outline">{typeLabels[insight.insight_type] || insight.insight_type}</Badge>
                        </div>
                        {insight.description && <p className="text-sm text-muted-foreground">{insight.description}</p>}
                        {insight.recommended_action && (
                          <div className="bg-muted p-3 rounded-md">
                            <p className="text-sm font-medium">💡 Ação Recomendada:</p>
                            <p className="text-sm">{insight.recommended_action}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {insight.affected_sector && <span>Setor: {insight.affected_sector}</span>}
                          {insight.impact_estimate && <span>Impacto: {insight.impact_estimate}</span>}
                          <span>{format(parseISO(insight.created_at), 'dd/MM HH:mm')}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => resolveInsight(insight.id)}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Resolver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          {!decisions ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Motor de Decisão</p>
                <p className="text-sm text-muted-foreground mb-4">Clique em "Motor de Decisão" para analisar e receber recomendações estratégicas</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary */}
              {decisions.summary && (
                <Card className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">📊 Resumo Executivo</p>
                    <p className="text-base">{decisions.summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Priority Sequence */}
              {decisions.priority_sequence?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" /> Sequência Recomendada de Priorização
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {decisions.priority_sequence.map((p, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-mono font-semibold">{p.order_number}</p>
                            <p className="text-sm text-muted-foreground">{p.reason}</p>
                            {p.suggested_action && (
                              <p className="text-sm mt-1">💡 {p.suggested_action}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rebalancing */}
              {decisions.rebalancing?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" /> Redistribuição Sugerida
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {decisions.rebalancing.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                          <Badge variant="outline">{r.from_sector}</Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline">{r.to_sector}</Badge>
                          <span className="text-sm text-muted-foreground flex-1">{r.reason}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Material Alerts */}
              {decisions.material_alerts?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" /> Alertas de Material
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {decisions.material_alerts.map((m, i) => (
                        <div key={i} className={cn(
                          'p-3 rounded-lg border',
                          m.urgency === 'high' ? 'bg-destructive/5 border-destructive/20' : 'bg-warning/5 border-warning/20'
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{m.material}</span>
                            <Badge className={m.urgency === 'high' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning-text'}>
                              {m.urgency}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{m.action}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          {resolved.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">Nenhum insight resolvido</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-2 pt-4">
                {resolved.slice(0, 20).map(i => (
                  <div key={i.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{typeLabels[i.insight_type] || i.insight_type}</Badge>
                      <span>{i.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{i.resolved_at ? format(parseISO(i.resolved_at), 'dd/MM HH:mm') : ''}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
