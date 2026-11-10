import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Badge } from '@/ui/base/badge';
import { Skeleton } from '@/ui/base/skeleton';
import { cn } from '@/lib/utils';
import {
  Brain, Lightbulb, ShieldAlert, BarChart3, DollarSign,
  Bot, Layers, Flame, AlertTriangle, Calendar, Activity,
} from 'lucide-react';
import { Slider } from '@/ui/base/slider';
import { useExecutiveDashboard, useGenerateInsights, useGenerateScenarios, useUnifiedChat, useDailySummary } from '@/hooks/ai/useExecutiveAI';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { ExecutiveSWOT } from '@/components/executive/ExecutiveSWOT';
import { ExecutiveIntelligenceStatus } from '@/components/executive/ExecutiveIntelligenceStatus';
import { PrimaryKPICards, SecondaryKPICards, TargetAttainmentBar } from '@/components/executive/ExecutiveKPICards';
import { ExecutiveChat } from '@/components/executive/ExecutiveChat';
import { CEOStrategicChat } from '@/components/executive/CEOStrategicChat';
import { ExecutiveChartsTab } from '@/components/executive/ExecutiveChartsTab';
import { ExecutiveMarginsTab } from '@/components/executive/ExecutiveMarginsTab';
import { ExecutiveAlertsTab } from '@/components/executive/ExecutiveAlertsTab';
import { ExecutiveScenariosTab } from '@/components/executive/ExecutiveScenariosTab';
import { CEOBriefPanel } from '@/components/executive/CEOBriefPanel';
import { ExecutiveActionsPanel } from '@/components/executive/ExecutiveActionsPanel';
import { BrainSummaryWidget } from '@/components/executive/BrainSummaryWidget';
import { ExecutiveCouncilPanel } from '@/components/executive/ExecutiveCouncilPanel';
import { ExecutiveConsensus } from '@/components/executive/ExecutiveConsensus';

const severityColor: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  medium: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  low: 'bg-muted text-muted-foreground',
};

const alertSeverityBorder: Record<string, string> = {
  critical: 'border-l-destructive',
  high: 'border-l-orange-500',
  medium: 'border-l-blue-500',
  low: 'border-l-muted-foreground',
};

const insightIcon: Record<string, any> = {
  revenue: Lightbulb,
  profit: DollarSign,
  cost: DollarSign,
  risk: ShieldAlert,
  operational: Lightbulb,
  commercial: Lightbulb,
};

export default function ExecutiveDashboard() {
  const { segment } = useEnterprise();
  const [tempPeriod, setTempPeriod] = useState<number>(12);
  const [period, setPeriod] = useState<number>(12);
  const { data, isLoading } = useExecutiveDashboard(period, segment);
  const generateInsights = useGenerateInsights();
  const generateScenarios = useGenerateScenarios();
  const { messages, isLoading: chatLoading, sendMessage, clearChat } = useUnifiedChat();
  const dailySummary = useDailySummary();

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="IA Executiva" description="Carregando análise..." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" role="status" aria-live="polite" aria-label="Carregando análise executiva">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          <span className="sr-only">Carregando indicadores executivos...</span>
        </div>
      </PageContainer>
    );
  }

  const kpis = data?.kpis;
  const insights = data?.insights || [];
  const alerts = data?.alerts || [];
  const scenarios = data?.scenarios || [];
  const autoAlerts = data?.autoAlerts ?? [];
  const productMargins = data?.productMargins ?? [];
  const lowMarginProducts = data?.lowMarginProducts ?? [];
  const dataStatus = data?.data_status;
  const isInsufficient = dataStatus === 'insufficient';

  return (
    <PageContainer>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
        <PageHeader 
          title={`🧠 Conselho Executivo (IA) - ${segment?.toUpperCase() || 'GERAL'}`} 
          description="Plataforma ERP Enterprise Evolution Engine (EEE) — Inteligência adaptativa sênior"
        />
        <ExecutiveIntelligenceStatus qualityScore={isInsufficient ? 15 : 94} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => generateInsights.mutate()} disabled={generateInsights.isPending} variant="outline" size="sm" className="gap-2" aria-label="Gerar insights da IA executiva">
            <Brain className={cn('h-4 w-4', generateInsights.isPending && 'animate-spin')} aria-hidden="true" />
            Gerar Insights
          </Button>
          <Button onClick={() => generateScenarios.mutate()} disabled={generateScenarios.isPending} variant="outline" size="sm" className="gap-2" aria-label="Gerar cenários da IA executiva">
            <Layers className={cn('h-4 w-4', generateScenarios.isPending && 'animate-spin')} aria-hidden="true" />
            Cenários
          </Button>
          <div className="flex flex-col lg:flex-row items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 ml-2 border border-border/50">
            <div className="flex items-center gap-4 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">Período: <span className="text-foreground font-bold">{tempPeriod}m</span></span>
              </div>
              <Slider
                value={[tempPeriod]}
                onValueChange={(val) => setTempPeriod(val[0])}
                min={3}
                max={36}
                step={1}
                className="w-24 lg:w-32"
                aria-label={`Selecionar período de análise em meses, valor atual ${tempPeriod} meses`}
              />
            </div>
            <div className="h-4 w-px bg-border hidden lg:block mx-1" />
            <div className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">
              {[3, 6, 12, 18, 24, 36].map((m) => (
                <Button
                  key={m}
                  variant={tempPeriod === m ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    "h-6 px-1.5 text-[9px] font-bold transition-all",
                    tempPeriod === m ? "bg-background shadow-sm scale-105" : "hover:bg-background/50"
                  )}
                  onClick={() => setTempPeriod(m)}
                >
                  {m}m
                </Button>
              ))}
            </div>
            <Button 
              size="sm" 
              className="h-7 text-[10px] px-3 font-bold ml-1 bg-primary hover:bg-primary/90 transition-all shrink-0"
              onClick={() => setPeriod(tempPeriod)}
              disabled={period === tempPeriod}
            >
              Aplicar período
            </Button>
          </div>
        </div>
      </div>

      {isInsufficient && (
        <Card className="border-l-4 border-l-warning bg-warning/5" role="alert">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning-text shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Dados insuficientes para análise confiável</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre vendas, pedidos, contas a pagar ou receber para que a IA Executiva gere diagnóstico, insights e cenários baseados em dados reais. Nenhum número será inventado.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExecutiveCouncilPanel />
        </div>
        <div>
          <ExecutiveConsensus consensus={data?.consensus} />
        </div>
      </div>
      <div className="mt-4">
        <BrainSummaryWidget />
      </div>



      {insights.length > 0 && (
        <ExecutiveActionsPanel 
          actions={insights.slice(0, 3).map((ins) => ({
            title: ins.title,
            description: ins.description,
            impact: ins.impact_estimate,
            priority: (ins.severity as 'critical' | 'high' | 'medium' | 'low'),
            module: ins.module
          }))}
          onExecute={sendMessage}
        />
      )}

      <PrimaryKPICards kpis={kpis} />
      <SecondaryKPICards kpis={kpis} />
      <TargetAttainmentBar kpis={kpis} />

      {/* Proactive Auto-Alerts */}
      {autoAlerts.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Alertas automáticos">
          {autoAlerts.map((alert, i) => (
            <Card key={i} className={cn('border-l-4', alertSeverityBorder[alert.severity] || 'border-l-muted')} role="listitem">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-destructive" aria-hidden="true" />
                    <p className="text-sm font-medium">{alert.title}</p>
                  </div>
                  <Badge className={cn('text-[10px]', severityColor[alert.severity])} aria-label={`Severidade ${alert.severity}`}>{alert.severity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Atalho rápido — Auditoria de Segurança */}
      <Card className="border-l-4 border-l-primary hover-lift">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Auditoria de Segurança</p>
              <p className="text-xs text-muted-foreground">
                Eventos críticos: exclusões, mudanças de permissão, falhas de login e operações financeiras
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/seguranca/auditoria">Abrir</Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="assistant" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="assistant" className="gap-1.5"><Bot className="h-3.5 w-3.5" />Diretor Digital</TabsTrigger>
          <TabsTrigger value="ceo" className="gap-1.5"><Brain className="h-3.5 w-3.5" />IA CEO</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5"><Lightbulb className="h-3.5 w-3.5" />Insights</TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Análises</TabsTrigger>
          <TabsTrigger value="margins" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />Margens</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />Alertas & Riscos</TabsTrigger>
          <TabsTrigger value="swot" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Radar SWOT</TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-1.5"><Layers className="h-3.5 w-3.5" />Cenários</TabsTrigger>
        </TabsList>

        <TabsContent value="assistant">
          <ExecutiveChat
            messages={messages}
            isLoading={chatLoading}
            sendMessage={sendMessage}
            clearChat={clearChat}
            onDailySummary={() => dailySummary.mutateAsync().then(r => r?.resumo_executivo && sendMessage('Gere o resumo executivo diário.'))}
            dailySummaryPending={dailySummary.isPending}
          />
        </TabsContent>

        <TabsContent value="ceo" className="space-y-4">
          <CEOBriefPanel />
          <CEOStrategicChat
            messages={messages}
            isLoading={chatLoading}
            sendMessage={sendMessage}
            clearChat={clearChat}
          />
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          {insights.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Brain className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground mb-2">Clique em "Gerar Insights" para a IA analisar seus dados</p>
              <p className="text-xs text-muted-foreground">A IA irá analisar receita, lucro, custos, riscos, operação e performance comercial</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {insights.map((ins) => {
                const Icon = insightIcon[ins.insight_type] || Lightbulb;
                return (
                  <Card key={ins.id} className="hover-lift">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm">{ins.title}</CardTitle>
                        </div>
                        <Badge className={cn('text-[10px]', severityColor[ins.severity] || severityColor.medium)}>{ins.severity}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground">{ins.description}</p>
                      {ins.explanation && (
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-xs font-medium text-foreground/80">💡 {ins.explanation}</p>
                        </div>
                      )}
                      {ins.impact_estimate && <p className="text-xs text-primary font-medium">📊 Impacto: {ins.impact_estimate}</p>}
                      {ins.recommended_actions?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Ações recomendadas:</p>
                          {(Array.isArray(ins.recommended_actions) ? ins.recommended_actions : []).map((a: string, i: number) => (
                            <p key={i} className="text-xs text-muted-foreground">• {a}</p>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="charts">
          <ExecutiveChartsTab data={data} />
        </TabsContent>

        <TabsContent value="margins">
          <ExecutiveMarginsTab productMargins={productMargins} lowMarginProducts={lowMarginProducts} />
        </TabsContent>

        <TabsContent value="alerts">
          <ExecutiveAlertsTab kpis={kpis} alerts={alerts} />
        </TabsContent>

        <TabsContent value="swot">
          <ExecutiveSWOT 
            data={data?.swot} 
            isLoading={isLoading} 
          />
        </TabsContent>

        <TabsContent value="scenarios">
          <ExecutiveScenariosTab scenarios={scenarios} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
