import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { 
  Brain, 
  CheckCircle, 
  AlertCircle, 
  Activity, 
  TrendingUp, 
  ShieldAlert, 
  Info,
  Clock,
  ShieldCheck,
  Zap,
  Package,
  FileText,
  Users,
  DollarSign,
  RefreshCw
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/base/tooltip";

type ModuleStatus = 'healthy' | 'warning' | 'critical' | 'syncing';

interface AIConsensusModule {
  id: string;
  name: string;
  icon: LucideIcon;
  status: ModuleStatus;
  explanation: string;
  lastUpdate: string;
  integrity: number;
}

const modules: AIConsensusModule[] = [
  {
    id: 'fin',
    name: 'Financeiro',
    icon: DollarSign,
    status: 'healthy',
    explanation: 'Fluxo de caixa otimizado com projeção de EBITDA 2% acima do forecast. Riscos de inadimplência sob controle.',
    lastUpdate: '2 min atrás',
    integrity: 99.8
  },
  {
    id: 'fiscal',
    name: 'Fiscal & Tributário',
    icon: FileText,
    status: 'warning',
    explanation: 'Atenção necessária: Nova alíquota de ICMS ST em 15 dias. Preparando atualização automática de tabelas.',
    lastUpdate: '10 min atrás',
    integrity: 94.5
  },
  {
    id: 'prod',
    name: 'Produção (PCP)',
    icon: Activity,
    status: 'critical',
    explanation: 'Gargalo detectado no setor de acabamento. IA sugere redistribuição imediata de ordens de produção.',
    lastUpdate: 'Agora',
    integrity: 82.1
  },
  {
    id: 'compras',
    name: 'Compras & Suprimentos',
    icon: Package,
    status: 'healthy',
    explanation: 'Reposição inteligente ativa. Lead time médio reduzido em 12% via negociação automatizada com fornecedores.',
    lastUpdate: '15 min atrás',
    integrity: 98.2
  },
  {
    id: 'hr',
    name: 'RH & Clima',
    icon: Users,
    status: 'healthy',
    explanation: 'Índice de turnover em queda. Clima organizacional e produtividade acima da meta setorial.',
    lastUpdate: '1h atrás',
    integrity: 96.7
  },
  {
    id: 'log',
    name: 'Logística & WMS',
    icon: Package,
    status: 'healthy',
    explanation: 'Rotas otimizadas. Redução de 15% no custo de frete via consolidação de cargas por IA.',
    lastUpdate: '30 min atrás',
    integrity: 97.4
  },
  {
    id: 'qualidade',
    name: 'Qualidade & Compliance',
    icon: CheckCircle,
    status: 'healthy',
    explanation: 'Padrões AQL em conformidade total. Rastreabilidade ponta-a-ponta validada.',
    lastUpdate: '2h atrás',
    integrity: 100
  }
];

const statusConfig: Record<ModuleStatus, { label: string; color: string; icon: LucideIcon }> = {
  healthy: { label: 'Saudável', color: 'text-success bg-success/10 border-success/20', icon: ShieldCheck },
  warning: { label: 'Atenção', color: 'text-warning-text bg-warning/10 border-warning/20', icon: AlertCircle },
  critical: { label: 'Crítico', color: 'text-destructive bg-destructive/10 border-destructive/20', icon: ShieldAlert },
  syncing: { label: 'Sincronizando', color: 'text-primary bg-primary/10 border-primary/20', icon: RefreshCw }
};

export function AIConsensusPanel() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-sidebar via-background to-sidebar/50 shadow-xl overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-sidebar-border/50">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold">Consenso de IA por Módulo</CardTitle>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Análise Multidimensional em Tempo Real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex gap-1.5 items-center">
              <Zap className="h-3 w-3 fill-primary" />
              Processamento Neural Ativo
            </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 px-0 pb-0">
        <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-0">
            {modules.map((module) => {
              const config = statusConfig[module.status];
              return (
                <div 
                  key={module.id} 
                  className="group flex items-center gap-4 p-4 transition-all duration-300 hover:bg-primary/5 border-b border-sidebar-border/30 last:border-0"
                >
                  <div className={`p-3 rounded-xl ${config.color.split(' ')[1]} transition-transform group-hover:scale-110 duration-300`}>
                    <module.icon className={`h-5 w-5 ${config.color.split(' ')[0]}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-bold text-sidebar-foreground flex items-center gap-2">
                        {module.name}
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs p-3">
                            <p className="text-xs leading-relaxed">{module.explanation}</p>
                          </TooltipContent>
                        </Tooltip>
                      </h4>
                      <Badge variant="outline" className={`text-[10px] uppercase font-bold px-1.5 py-0 ${config.color}`}>
                        {config.label}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {module.lastUpdate}
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3 text-primary" />
                        <span className="font-mono font-bold text-primary">{module.integrity}% Integridade</span>
                      </div>
                    </div>
                    
                    <div className="mt-2 h-1 w-full bg-sidebar-border/30 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${config.color.split(' ')[0].replace('text-', 'bg-')}`} 
                        style={{ width: `${module.integrity}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
        
        <div className="p-4 bg-primary/5 border-t border-sidebar-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Status Global do Cérebro</span>
            <span className="text-[10px] font-bold text-success uppercase">Otimizado</span>
          </div>
          <div className="flex gap-1 h-1.5">
            <div className="flex-1 bg-success rounded-full opacity-80" />
            <div className="flex-1 bg-success rounded-full opacity-80" />
            <div className="flex-1 bg-warning rounded-full opacity-80" />
            <div className="flex-1 bg-success rounded-full opacity-80" />
            <div className="flex-1 bg-success rounded-full opacity-80" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
