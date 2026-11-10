import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Brain, Cpu, Scale, BarChart3, Factory, Warehouse, Cog, Truck, Users, Activity, Zap, ShieldAlert, Rocket, Building, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrainRuns, useBrainLearning } from '@/hooks/ai/useAIBrain';
import { Link } from 'react-router-dom';
import { Button } from '@/ui/base/button';
import { ExecutiveIntelligenceStatus } from './ExecutiveIntelligenceStatus';
import { SpecialistDialog, type SpecialistProfile } from './SpecialistDialog';

const specialists: SpecialistProfile[] = [
  { role: 'Global CTO', icon: Cpu, color: 'text-primary',
    focus: 'Arquitetura, stack, performance e roadmap tecnológico do ERP.',
    suggestions: ['Avaliar saúde da arquitetura', 'Riscos técnicos abertos', 'Próximos passos do roadmap'] },
  { role: 'SAP S/4HANA', icon: Building, color: 'text-blue-600',
    focus: 'Benchmarks SAP: governança, compliance e processos enterprise.',
    suggestions: ['Gaps vs. SAP', 'Controles financeiros faltantes', 'Maturidade de processos'] },
  { role: 'Oracle NetSuite', icon: Database, color: 'text-orange-600',
    focus: 'Multi-subsidiária, consolidação financeira e operação cloud.',
    suggestions: ['Consolidação multi-empresa', 'Cloud readiness', 'Relatórios financeiros'] },
  { role: 'TOTVS/Sankhya', icon: Cog, color: 'text-red-500',
    focus: 'Aderência ao mercado brasileiro: fiscal, folha, regimes tributários.',
    suggestions: ['Aderência fiscal BR', 'Integrações nacionais', 'Riscos regulatórios'] },
  { role: 'Industrial/PCP', icon: Factory, color: 'text-purple-600',
    focus: 'Produção, OEE, MRP, ordens de fabricação e capacidade fabril.',
    suggestions: ['Analisar OEE atual', 'Gargalos de capacidade', 'Ordens em atraso'] },
  { role: 'WMS/TMS', icon: Warehouse, color: 'text-green-500',
    focus: 'Armazém e transporte: acuracidade, picking, rotas e fretes.',
    suggestions: ['Acuracidade de estoque', 'Eficiência de picking', 'Otimização de rotas'] },
  { role: 'Fiscal/Contábil', icon: Scale, color: 'text-red-600',
    focus: 'NF-e/NFC-e, SPED, apuração de impostos e conciliações.',
    suggestions: ['Status SPED do mês', 'Apuração de impostos', 'Divergências fiscais'] },
  { role: 'Supply Chain', icon: Truck, color: 'text-cyan-600',
    focus: 'Compras, fornecedores, lead time, ruptura e demanda.',
    suggestions: ['Risco de ruptura', 'Top fornecedores', 'Lead time crítico'] },
  { role: 'HR Strategy', icon: Users, color: 'text-pink-500',
    focus: 'Headcount, custo de folha, produtividade e indicadores de RH.',
    suggestions: ['Custo de folha atual', 'Headcount por área', 'Produtividade'] },
  { role: 'Market Intel', icon: BarChart3, color: 'text-indigo-500',
    focus: 'Inteligência de mercado, concorrência e oportunidades comerciais.',
    suggestions: ['Oportunidades abertas', 'Tendências do setor', 'Posição competitiva'] },
  { role: 'IA Specialist', icon: Brain, color: 'text-yellow-500',
    focus: 'Memória, decisões e guardrails do Cérebro Nativo.',
    suggestions: ['Decisões pendentes', 'Aprendizado recente', 'Confiança média'] },
];

export function ExecutiveCouncilPanel() {
  const { executiveCouncil } = useEnterprise();
  const { data: runs = [] } = useBrainRuns();
  const { data: learning } = useBrainLearning();
  const [active, setActive] = useState<SpecialistProfile | null>(null);

  const lastRun = runs[0];
  const saude = lastRun?.structured?.saude_geral;
  const veredicto = lastRun?.structured?.veredicto;

  return (
    <Card className="border-primary/20 bg-primary/5 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="h-5 w-5 text-primary animate-pulse shrink-0" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider truncate">Cérebro ERP Enterprise</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExecutiveIntelligenceStatus qualityScore={saude === 'critico' ? 15 : saude === 'alerta' ? 65 : 94} />
            <Badge variant="outline" className={cn(
              "text-[10px] border-primary/20 whitespace-nowrap",
              saude === 'critico' ? 'bg-destructive/10 text-destructive border-destructive/20' :
              saude === 'alerta' ? 'bg-warning/10 text-warning-text border-warning/20' :
              'text-primary'
            )}>
              {saude === 'critico' ? '🔴 Estado Crítico' : saude === 'alerta' ? '⚠️ Alerta Ativo' : '✅ Sistema Saudável'}
            </Badge>
            <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
              <Link to="/executive/brain/comando">
                <Zap className="h-3 w-3" /> Dashboard IA
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Veredicto real do Brain se disponível */}
        {veredicto && (
          <div className="p-3 rounded-lg bg-background/40 border border-primary/10 relative group">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <ShieldAlert className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-primary uppercase tracking-tight flex items-center gap-1">
                  <Activity className="h-3 w-3" /> Veredicto da Diretoria
                </p>
                <p className="text-xs leading-relaxed font-medium">
                  {veredicto}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {specialists.map((specialist) => {
            const Icon = specialist.icon;
            return (
              <button
                type="button"
                key={specialist.role}
                onClick={() => setActive(specialist)}
                aria-label={`Consultar especialista ${specialist.role}`}
                title={specialist.role}
                className="flex flex-col items-center text-center p-2 rounded-lg bg-background/40 border border-primary/10 hover:border-primary/40 hover:bg-background/60 hover:shadow-lg transition-all cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-w-0"
              >
                <div className={cn("mb-1.5 p-1.5 rounded-full bg-background ring-1 ring-primary/20 group-hover:ring-primary/40 group-hover:scale-110 transition-all shadow-sm", specialist.color)}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="w-full text-[10px] font-bold leading-tight uppercase tracking-tight text-foreground/80 group-hover:text-primary transition-colors break-words hyphens-auto">
                  {specialist.role}
                </span>
                <div className="mt-1 h-1 w-0 bg-primary/40 rounded-full group-hover:w-full transition-all duration-300" />
              </button>
            );
          })}
        </div>

        <SpecialistDialog
          specialist={active}
          open={!!active}
          onOpenChange={(o) => { if (!o) setActive(null); }}
        />

        {!veredicto && (
          <div className="p-2 rounded bg-primary/10 border border-primary/10 flex items-center justify-center gap-3">
            <Rocket className="h-3 w-3 text-primary/60" />
            <p className="text-[10px] font-medium text-primary/80 italic text-center">
              "{executiveCouncil?.mission || 'Orquestração autônoma de dados para decisões estratégicas em tempo real.'}"
            </p>
          </div>
        )}

        {learning && (
          <div className="flex items-center justify-between px-1 pt-1 border-t border-primary/10">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                <span className="text-[9px] text-muted-foreground uppercase font-semibold">Consenso Ativo</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground uppercase">Precisão:</span>
                <span className="text-[9px] font-bold text-primary">{(learning.approvalRate * 100).toFixed(0)}%</span>
              </div>
            </div>
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest">Enterprise AI Architecture v2.5</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
