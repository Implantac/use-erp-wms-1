import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import {
  Brain,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  ChevronRight,
  Info
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrainRuns } from '@/hooks/ai/useAIBrain';
import { useExecutiveDashboard } from '@/hooks/ai/useExecutiveAI';
import { ScrollArea } from '@/ui/base/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/base/tooltip';

const moduleStatusMap: Record<string, { label: string; color: string; explanation: string; icon: LucideIcon }> = {
  commercial: {
    label: 'Otimizado',
    color: 'text-success',
    explanation: 'Motor de conversão operando com 94% de eficiência preditiva. Lead score calibrado.',

    icon: TrendingUp
  },
  financial: {
    label: 'Estável',
    color: 'text-primary',
    explanation: 'Fluxo de caixa projetado sem rupturas nos próximos 45 dias. DRE em conformidade.',

    icon: CheckCircle2
  },
  production: {
    label: 'Atenção',
    color: 'text-warning-text',
    explanation: 'Gargalo identificado na linha de tecelagem 04. IA sugerindo re-balanceamento de turnos.',

    icon: AlertCircle
  },
  inventory: {
    label: 'Crítico',
    color: 'text-destructive',
    explanation: 'Ruptura de estoque iminente em 12 SKUs de alta rotatividade. Necessário ressuprimento urgente.',

    icon: AlertCircle
  },
  rh: {
    label: 'Saudável',
    color: 'text-success',
    explanation: 'Clima organizacional e produtividade acima da meta setorial. Turnover reduzido em 12%.',
    icon: CheckCircle2
  },
  purchasing: {
    label: 'Eficiente',
    color: 'text-success',
    explanation: 'SLA de fornecedores em 98%. IA negociando condições otimizadas automaticamente.',
    icon: TrendingUp
  },
  fiscal: {
    label: 'Compliance',
    color: 'text-info',
    explanation: 'Nenhuma pendência detectada. SPED e obrigações acessórias geradas com 100% de precisão.',
    icon: CheckCircle2
  },
  operational: {
    label: 'Fluidez',
    color: 'text-success',
    explanation: 'Entregas 12% mais rápidas com roteirização dinâmica. Custo por km reduzido.',
    icon: TrendingUp
  },
  qualidade: {
    label: 'Certificado',
    color: 'text-success',
    explanation: 'Zero não-conformidades críticas nos últimos 30 dias. Auditoria contínua ativa.',
    icon: CheckCircle2
  }
};

const fallbackConsensus = [
  {
    specialist: 'IA CFO',
    insight: 'Recomendo antecipação de recebíveis para garantir liquidez diante do aumento sazonal de compras.',
    status: 'recommendation',
    module: 'financial'
  },
  {
    specialist: 'Especialista PCP',
    insight: 'Gargalo detectado na linha de tecelagem 04. Sugestão: Re-alocação de ordens para teares tipo B.',
    status: 'alert',
    module: 'production'

  },
  {
    specialist: 'Market Intelligence',
    insight: 'Nova normativa de ICMS-ST para o setor têxtil integrada com sucesso ao motor de regras.',
    status: 'success',
    module: 'financial'

  }
];

type ConsensusItem = { specialist: string; insight: string; status: string; module?: string };
type BrainItem = { titulo?: string; acao?: string; modulo?: string };

export function ExecutiveConsensus({ consensus = [] }: { consensus?: ConsensusItem[] }) {
  const { data: runs = [] } = useBrainRuns();
  const lastRun = runs[0];

  const structured = (lastRun?.structured ?? {}) as { riscos?: BrainItem[]; oportunidades?: BrainItem[] };
  const brainRisks: BrainItem[] = structured.riscos ?? [];
  const brainOpps: BrainItem[] = structured.oportunidades ?? [];

  const { data: dashboardData } = useExecutiveDashboard();

  const brainConsensus: ConsensusItem[] = [
    ...brainRisks.map((r) => ({
      specialist: 'Risk Advisor',
      insight: `${r.titulo}: ${r.acao}`,
      status: 'alert',
      module: r.modulo || 'geral'
    })),
    ...brainOpps.map((o) => ({
      specialist: 'Growth Strategist',
      insight: `${o.titulo}: ${o.acao}`,
      status: 'recommendation',
      module: o.modulo || 'geral'
    }))
  ];

  const dashboardConsensus: ConsensusItem[] = dashboardData?.consensus ?? [];

  const items: ConsensusItem[] = [
    ...brainConsensus,
    ...dashboardConsensus
  ];

  if (items.length === 0) {
    items.push(...(consensus.length > 0 ? consensus : fallbackConsensus));
  }

  return (
    <Card className="border-primary/20 bg-background/50 backdrop-blur-sm shadow-xl flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/50 bg-primary/5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Brain className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary/80">Consenso AI</CardTitle>
              <p className="text-[10px] text-muted-foreground font-medium">Orquestração Multi-Agente</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px] bg-background font-mono border-primary/30 text-primary">
            LIVE
          </Badge>
        </div>
      </CardHeader>

      <div className="flex flex-col h-[500px]">
        {/* Status por Módulo */}
        <div className="p-3 border-b border-border/30 bg-muted/20 space-y-2 shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground mb-2">Status por Módulo (Consenso IA)</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(moduleStatusMap).map(([key, status]) => {
              const Icon = status.icon;
              return (
                <TooltipProvider key={key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-between p-1.5 rounded bg-background/40 border border-border/50 hover:border-primary/30 transition-all cursor-help group">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className={cn("h-3 w-3 shrink-0", status.color)} />
                          <span className="text-[9px] font-bold uppercase truncate">{key}</span>
                        </div>
                        <span className={cn("text-[9px] font-black shrink-0", status.color)}>{status.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-popover border-primary/20 shadow-2xl p-3 max-w-[200px] z-50">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-1.5 w-1.5 rounded-full", status.color.replace('text-', 'bg-'))} />
                          <p className="text-[10px] font-bold uppercase">{key}</p>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground italic">
                          "{status.explanation}"
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/30">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="group flex items-start gap-3 p-4 hover:bg-primary/5 transition-all cursor-default relative overflow-hidden"
              >
                <div className={cn(
                  "mt-1 p-2 rounded-xl shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm",
                  item.status === 'success' ? "bg-success/10 text-success" :
                  item.status === 'alert' ? "bg-destructive/10 text-destructive shadow-[0_0_15px_rgba(239,68,68,0.15)]" :
                  item.status === 'recommendation' ? "bg-info/10 text-info" :
                  "bg-muted text-muted-foreground"
                )}>
                  {item.status === 'success' ? <CheckCircle2 className="h-4 w-4" /> :
                   item.status === 'alert' ? <AlertCircle className="h-4 w-4" /> :
                   item.status === 'recommendation' ? <Lightbulb className="h-4 w-4" /> :
                   <MessageSquare className="h-4 w-4" />}
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[10px] font-black uppercase text-primary/70 tracking-tight truncate">
                        {item.specialist}
                      </p>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                      <span className="text-[9px] font-bold text-muted-foreground uppercase shrink-0">
                        {item.module || 'Global'}
                      </span>
                    </div>
                    {item.status === 'recommendation' && <TrendingUp className="h-3 w-3 text-info animate-pulse shrink-0" />}
                  </div>
                  <p className="text-xs font-medium leading-relaxed text-foreground/90 group-hover:text-foreground transition-colors">
                    {item.insight}
                  </p>
                  <div className="flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-bold text-primary flex items-center gap-0.5">
                      Ver análise completa <ChevronRight className="h-2 w-2" />
                    </span>
                  </div>
                </div>
                {item.status === 'alert' && (
                  <div className="absolute top-0 right-0 h-full w-1 bg-destructive/50 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 bg-muted/30 border-t border-border/50 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">
              Latência Analítica
            </p>
            <span className="text-[10px] font-mono text-primary font-bold">
              {lastRun?.duration_ms ? `${(lastRun.duration_ms/1000).toFixed(2)}s` : '0.84s'}
            </span>
          </div>
          <div className="w-full bg-border/50 h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full w-[85%] animate-pulse" />
          </div>
        </div>
      </div>
    </Card>
  );
}
