import type { LucideIcon } from 'lucide-react';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { ModuleKPISection } from '@/components/dashboard/ModuleKPISection';
import { ConsolidatedCharts } from '@/components/dashboard/ConsolidatedCharts';
import { GlobalAlerts } from '@/components/dashboard/GlobalAlerts';
import { CanalFilter } from '@/components/shared/CanalFilter';
import { UsagePanel } from '@/components/plan/UsagePanel';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { RecentActivities } from '@/components/dashboard/RecentActivities';
import { ExecutiveConsensus } from '@/components/executive/ExecutiveConsensus';
import { ExecutiveCouncilPanel } from '@/components/executive/ExecutiveCouncilPanel';
import { ExecutiveActionsPanel } from '@/components/executive/ExecutiveActionsPanel';
import { useDashboardData } from '@/hooks/system/useDashboardData';
import { AttentionCenter } from '@/shared/components/AttentionCenter';
import { QuickActions } from '@/shared/components/QuickActions';
import { SetupChecklist } from '@/shared/components/SetupChecklist';
import { useExecutiveDashboard, useUnifiedChat } from '@/hooks/ai/useExecutiveAI';
import {
  ShoppingCart, Wallet, Package, Factory, Truck, Warehouse,
  DollarSign, TrendingUp, ArrowDownCircle, ArrowUpCircle,
  RefreshCw, ShieldCheck, Scissors, Building, Database,
  Users, Target, Navigation, LayoutDashboard, Boxes, Brain, BarChart3, Heart,
} from 'lucide-react';
import { Card, CardContent } from '@/ui/base/card';
import { Skeleton } from '@/ui/base/skeleton';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const iconMap = [DollarSign, TrendingUp, ArrowDownCircle, ArrowUpCircle];

const colorClasses: Record<string, { bg: string; icon: string; ring: string }> = {
  primary: { bg: 'bg-primary/10', icon: 'text-primary', ring: 'ring-primary/20' },
  success: { bg: 'bg-success/10', icon: 'text-success', ring: 'ring-success/20' },
  warning: { bg: 'bg-warning/10', icon: 'text-warning-text', ring: 'ring-warning/20' },
  info: { bg: 'bg-info/10', icon: 'text-info', ring: 'ring-info/20' },
};

const emptyModulePerformance = [
  { name: 'Comercial', value: 0, color: 'hsl(var(--primary))' },
  { name: 'Financeiro', value: 0, color: 'hsl(var(--success))' },
  { name: 'Estoque', value: 0, color: 'hsl(var(--info))' },
  { name: 'WMS', value: 0, color: 'hsl(var(--warning))' },
  { name: 'Produção', value: 0, color: 'hsl(142, 76%, 36%)' },
  { name: 'Compras', value: 0, color: 'hsl(262, 83%, 58%)' },
];

const verticalMap: Record<string, { label: string; icon: LucideIcon; color: string; path: string; cta: string }> = {
  textile:      { label: 'Indústria Têxtil',       icon: Factory,     color: 'purple',   path: '/vertical/textile',      cta: 'Acessar Dashboard Especializado →' },
  apparel:      { label: 'Confecção & Moda',       icon: Scissors,    color: 'orange',   path: '/vertical/apparel',      cta: 'Acessar Dashboard Especializado →' },
  pharma:       { label: 'Farmacêutico',           icon: ShieldCheck, color: 'blue',     path: '/vertical/pharma',       cta: 'Acessar Dashboard Especializado →' },
  retail:       { label: 'Varejo & Redes',         icon: ShoppingCart,color: 'pink',     path: '/vertical/retail',       cta: 'Acessar Dashboard Especializado →' },
  distribution: { label: 'Distribuição & Atacado', icon: Truck,       color: 'green',    path: '/vertical/distribution', cta: 'Acessar Dashboard Especializado →' },
  wholesaler:   { label: 'Atacadista',             icon: Database,    color: 'emerald',  path: '/vertical/wholesaler',   cta: 'Acessar Dashboard Especializado →' },
  holding:      { label: 'Holding & Grupos',       icon: Building,    color: 'slate',    path: '/vertical/holding',      cta: 'Acessar Consolidação →' },
};

const verticalStyles: Record<string, { border: string; bg: string; bgHover: string; iconBg: string; iconText: string; cta: string }> = {
  purple:  { border: 'border-l-purple-500',  bg: 'bg-purple-500/5',  bgHover: 'hover:bg-purple-500/10',  iconBg: 'bg-purple-500/10',  iconText: 'text-purple-600',  cta: 'text-purple-600' },
  orange:  { border: 'border-l-orange-500',  bg: 'bg-orange-500/5',  bgHover: 'hover:bg-orange-500/10',  iconBg: 'bg-orange-500/10',  iconText: 'text-orange-600',  cta: 'text-orange-600' },
  blue:    { border: 'border-l-blue-500',    bg: 'bg-blue-500/5',    bgHover: 'hover:bg-blue-500/10',    iconBg: 'bg-blue-500/10',    iconText: 'text-blue-600',    cta: 'text-blue-600' },
  pink:    { border: 'border-l-pink-500',    bg: 'bg-pink-500/5',    bgHover: 'hover:bg-pink-500/10',    iconBg: 'bg-pink-500/10',    iconText: 'text-pink-600',    cta: 'text-pink-600' },
  green:   { border: 'border-l-green-500',   bg: 'bg-green-500/5',   bgHover: 'hover:bg-green-500/10',   iconBg: 'bg-green-500/10',   iconText: 'text-green-600',   cta: 'text-green-600' },
  emerald: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5', bgHover: 'hover:bg-emerald-500/10', iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-600', cta: 'text-emerald-600' },
  slate:   { border: 'border-l-slate-500',   bg: 'bg-slate-500/5',   bgHover: 'hover:bg-slate-500/10',   iconBg: 'bg-slate-500/10',   iconText: 'text-slate-600',   cta: 'text-slate-600' },
};

export default function Dashboard() {
  const { currentCompany, currentBranch, segment } = useEnterprise();
  const { data, isLoading } = useDashboardData();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: executiveData } = useExecutiveDashboard(1, segment);
  const { sendMessage } = useUnifiedChat();

  const insights = executiveData?.insights || [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['dashboard-consolidated'] });
    setTimeout(() => setIsRefreshing(false), 600);
  };

  if (isLoading) {
    return (
      <main className="space-y-6" role="status" aria-live="polite" aria-label="Carregando dashboard">
        <div>
          <Skeleton className="h-8 w-72 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
        <span className="sr-only">Carregando indicadores do dashboard…</span>
      </main>
    );
  }

  const {
    mainKPIs = [], commercialKPIs = [], financialKPIs = [], inventoryKPIs = [],
    productionKPIs = [], purchasingKPIs = [], wmsKPIs = [],
    hrKPIs = [], crmKPIs = [], logisticKPIs = [], npsKPIs = [],
    statusDistribution = [], alerts = [],
  } = data || {};

  const vertical = verticalMap[segment as string];
  const vStyle = vertical ? verticalStyles[vertical.color] : null;

  return (
    <main className="space-y-6" aria-label="Dashboard consolidado">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard Consolidado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral • {currentCompany?.name}{currentBranch ? ` - ${currentBranch.name}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CanalFilter />
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20 gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Auto-refresh 60s
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2 text-xs"
              aria-label={isRefreshing ? 'Atualizando dashboard' : 'Atualizar dashboard'}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} aria-hidden="true" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {/* O que precisa da atenção + atalhos por tarefa */}
      <section aria-label="Pendências e ações rápidas" className="grid gap-4 lg:grid-cols-3">
        <AttentionCenter limit={4} showAllLink className="lg:col-span-2" />
        <QuickActions />
      </section>

      {/* Guia de primeira configuração — some quando tudo está feito */}
      <SetupChecklist />



      {/* KPIs Principais — sempre visíveis */}
      <section aria-label="Indicadores principais" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mainKPIs.map((kpi, idx) => {
          const Icon = iconMap[idx] || DollarSign;
          const colors = colorClasses[kpi.color] || colorClasses.primary;
          return (
            <Card key={kpi.title} className="hover-lift group cursor-default" style={{ animationDelay: `${idx * 80}ms` }}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{kpi.title}</p>
                    <p className="text-2xl font-bold text-foreground tabular-nums animate-count-up">{kpi.value}</p>
                    <div className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                      kpi.change >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                    )}>
                      {kpi.change >= 0 ? '↑' : '↓'} {Math.abs(kpi.change).toFixed(1)}%
                    </div>
                  </div>
                  <div className={cn('rounded-xl p-2.5 ring-1 transition-transform duration-200 group-hover:scale-110 shrink-0', colors.bg, colors.ring)}>
                    <Icon className={cn('h-5 w-5', colors.icon)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Ações Recomendadas — destaque quando existir */}
      {insights.length > 0 && (
        <ExecutiveActionsPanel
          actions={insights.slice(0, 3).map((ins) => ({
            title: ins.title,
            description: ins.description,
            impact: ins.impact_estimate,
            priority: ins.severity as 'critical' | 'high' | 'medium' | 'low',
            module: ins.module,
          }))}
          onExecute={sendMessage}
        />
      )}

      {/* Conteúdo organizado em abas */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="overview" className="gap-2 text-xs sm:text-sm">
            <LayoutDashboard className="h-3.5 w-3.5" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2 text-xs sm:text-sm">
            <Boxes className="h-3.5 w-3.5" /> Módulos
          </TabsTrigger>
          <TabsTrigger value="strategic" className="gap-2 text-xs sm:text-sm">
            <Brain className="h-3.5 w-3.5" /> Estratégico IA
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5" /> Análises
          </TabsTrigger>
        </TabsList>

        {/* Aba: Visão Geral — Alertas + Faturamento + Atividades + Plano */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid gap-6 lg:grid-cols-4">
            <aside className="lg:col-span-1 space-y-4" aria-label="Alertas e integridade">
              <GlobalAlerts alerts={alerts} />
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" /> Integridade do Core
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Sincronização</span>
                    <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/20">Real-time</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Motor de Regras</span>
                    <span className="text-[10px] font-bold">L4 Enterprise</span>
                  </div>
                </div>
              </div>
            </aside>
            <div className="lg:col-span-3 space-y-6">
              <UsagePanel />
              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2">
                  <RevenueChart />
                </div>
                <RecentActivities />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Aba: Módulos — KPIs de cada área */}
        <TabsContent value="modules" className="space-y-6 mt-4">
          {vertical && vStyle && (
            <Card
              className={cn('border-l-4 transition-all cursor-pointer', vStyle.border, vStyle.bg, vStyle.bgHover)}
              onClick={() => window.location.href = vertical.path}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={cn('p-3 rounded-xl', vStyle.iconBg)}>
                  <vertical.icon className={cn('h-6 w-6', vStyle.iconText)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Vertical Ativa</p>
                  <p className="font-bold">{vertical.label}</p>
                  <p className={cn('text-[10px] font-medium', vStyle.cta)}>{vertical.cta}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ModuleKPISection title="Comercial" icon={ShoppingCart} kpis={commercialKPIs} accentColor="bg-primary" />
            <ModuleKPISection title="Financeiro" icon={Wallet} kpis={financialKPIs} accentColor="bg-success" />
            <ModuleKPISection title="CRM & Marketing" icon={Target} kpis={crmKPIs} accentColor="bg-indigo-500" />
            <ModuleKPISection title="Compras" icon={Truck} kpis={purchasingKPIs} accentColor="bg-[hsl(262,83%,58%)]" />
            {segment !== 'services' && <ModuleKPISection title="Estoque" icon={Package} kpis={inventoryKPIs} accentColor="bg-info" />}
            {segment !== 'services' && <ModuleKPISection title="WMS" icon={Warehouse} kpis={wmsKPIs} accentColor="bg-warning" />}
            {segment === 'textile' && <ModuleKPISection title="Produção" icon={Factory} kpis={productionKPIs} accentColor="bg-[hsl(142,76%,36%)]" />}
            <ModuleKPISection title="Logística & TMS" icon={Navigation} kpis={logisticKPIs} accentColor="bg-cyan-500" />
            <ModuleKPISection title="RH & Capital Humano" icon={Users} kpis={hrKPIs} accentColor="bg-pink-500" />
            <ModuleKPISection title="Relacionamento & CX (NPS)" icon={Heart} kpis={npsKPIs} accentColor="bg-rose-500" />
          </div>
        </TabsContent>

        {/* Aba: Estratégico IA — Conselho + Consenso */}
        <TabsContent value="strategic" className="space-y-6 mt-4">
          <ExecutiveCouncilPanel />
          <ExecutiveConsensus />
        </TabsContent>

        {/* Aba: Análises — Gráficos consolidados */}
        <TabsContent value="analytics" className="space-y-6 mt-4">
          <ConsolidatedCharts
            modulePerformance={data?.modulePerformance || emptyModulePerformance}
            statusDistribution={statusDistribution}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
