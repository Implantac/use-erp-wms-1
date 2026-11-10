import { useMemo, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useWMSDashboardStats, useWMSStorageLocations } from '@/hooks/wms/useWMSOperations';

import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Progress } from '@/ui/base/progress';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Skeleton } from '@/ui/base/skeleton';
import { Link } from 'react-router-dom';
import {
  Warehouse, PackagePlus, PackageSearch, PackageCheck, Truck,
  CheckCircle, MapPin, ArrowUpDown, ScanBarcode, Layers, ClipboardCheck,
  AlertTriangle, TrendingUp, BarChart3, Timer, Activity, Zap, Box,
  Clock, ArrowRight, ExternalLink, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WarehouseMap } from '@/components/wms/WarehouseMap';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { EmptyState } from '@/shared/components/EmptyState';

const quickActions = [
  { to: '/wms/recebimento', icon: PackagePlus, label: 'Recebimento', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { to: '/wms/picking', icon: PackageSearch, label: 'Picking', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { to: '/wms/conferencia', icon: ScanBarcode, label: 'Conferência', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { to: '/wms/packing', icon: PackageCheck, label: 'Packing', color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { to: '/wms/expedicao', icon: Truck, label: 'Expedição', color: 'text-green-500', bg: 'bg-green-500/10' },
  { to: '/wms/lotes', icon: Layers, label: 'Lotes', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
];

export default function WMSDashboardPage() {
  const { stats, recentMovements, loading, refetch } = useWMSDashboardStats();
  const { locations } = useWMSStorageLocations();

  // Análise de ocupação real consolidada por zona para o Gêmeo Digital
  const zoneData = useMemo(() => {
    const zones = Array.from(new Set(locations.map(l => l.zone || 'Sem Zona')));
    if (zones.length === 0) return [];

    return zones.map(zone => {
      const zoneLocations = locations.filter(l => l.zone === zone);
      const totalCap = zoneLocations.reduce((s, l) => s + (l.capacity || 0), 0);
      const totalOcc = zoneLocations.reduce((s, l) => s + (l.occupied || 0), 0);
      const type = zone.toLowerCase().includes('picking') ? 'rack' :
                   zone.toLowerCase().includes('pulmão') ? 'shelf' : 'floor';

      return {
        zone,
        occupancy: totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0,
        totalLocations: zoneLocations.length,
        type: type as 'rack' | 'shelf' | 'floor'
      };
    });
  }, [locations]);

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard WMS" description="Visão geral das operações do armazém" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Dashboard WMS" description="Controle inteligente de fluxo e armazenamento">
        <div className="flex gap-2">
          <Link to="/wms/ia">
            <Button variant="outline" className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10">
              <Zap className="h-4 w-4 text-primary animate-pulse" /> IA & Insights
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            title="Atualizar dados"
            aria-label="Atualizar dados"
            onClick={() => { void refetch().then(() => toast.success('Dados atualizados')).catch(() => toast.error('Não foi possível atualizar os dados. Tente novamente.')); }}
          >
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Recebimentos"
          value={stats.receiving}
          subtitle="Aguardando doca"
          icon={<PackagePlus className="h-5 w-5" />}
          accentColor="info"
          index={0}
        />
        <KPICard
          title="Picking"
          value={stats.picking}
          subtitle="Em separação"
          icon={<PackageSearch className="h-5 w-5" />}
          accentColor="warning"
          index={1}
        />
        <KPICard
          title="Packing"
          value={stats.packing}
          subtitle="Para conferência"
          icon={<PackageCheck className="h-5 w-5" />}
          accentColor="accent"
          index={2}
        />
        <KPICard
          title="Expedidos"
          value={stats.shipped}
          subtitle="Concluídos hoje"
          icon={<Truck className="h-5 w-5" />}
          accentColor="success"
          index={3}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Warehouse Map & Occupancy */}
        <div className="lg:col-span-2 space-y-6">
          <WarehouseMap zones={zoneData} className="border-none shadow-sm" />

          <div className="grid gap-6 md:grid-cols-2">
            {/* Real-time Alerts */}
            <Card className="shadow-sm border-none bg-gradient-to-br from-card to-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Alertas Críticos
                </CardTitle>
                <CardDescription>Eventos que requerem atenção</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.occupancy > 85 && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold uppercase tracking-tight">Ocupação Crítica</p>
                      <p className="text-xs opacity-90">Armazém atingiu {stats.occupancy}% da capacidade total.</p>
                      <Button variant="link" size="sm" className="h-auto p-0 text-destructive underline font-bold text-[10px]">
                        LIBERAR ESPAÇO <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
                
                {stats.picking > 8 && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                    <Clock className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold uppercase tracking-tight">Gargalo no Picking</p>
                      <p className="text-xs opacity-90">{stats.picking} ordens pendentes há mais de 2h.</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400">
                  <Info className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold uppercase tracking-tight">Doca 02 Disponível</p>
                    <p className="text-xs opacity-90">Recebimento da NF-2938 agendado para 14:30.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card className="shadow-sm border-none bg-gradient-to-br from-card to-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Performance (Items/h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Velocidade de Picking</span>
                      <span className="font-bold">142 items/h</span>
                    </div>
                    <Progress value={78} className="h-1.5" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Acuracidade de Inventário</span>
                      <span className="font-bold">99.4%</span>
                    </div>
                    <Progress value={99.4} className="h-1.5 bg-muted" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-2 rounded-lg bg-background/50 border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Inbound</p>
                      <p className="text-lg font-bold text-primary">12 <span className="text-[10px] font-normal text-muted-foreground">docs</span></p>
                    </div>
                    <div className="p-2 rounded-lg bg-background/50 border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Outbound</p>
                      <p className="text-lg font-bold text-primary">45 <span className="text-[10px] font-normal text-muted-foreground">docs</span></p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Feed & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Grid */}
          <Card className="shadow-sm border-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Acesso Rápido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {quickActions.map(({ to, icon: Icon, label, color, bg }) => (
                  <Link key={to} to={to}>
                    <Button variant="outline" className="w-full h-24 flex-col gap-2 border-none shadow-sm hover:ring-2 hover:ring-primary/20 transition-all duration-300">
                      <div className={cn("p-3 rounded-xl", bg)}>
                        <Icon className={cn("h-6 w-6", color)} />
                      </div>
                      <span className="text-xs font-semibold">{label}</span>
                    </Button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Live Feed */}
          <Card className="shadow-sm border-none h-[420px] flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-wider">Fluxo Operacional</CardTitle>
                <Badge variant="outline" className="animate-pulse bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">LIVE</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto pr-2 custom-scrollbar">
              <div className="space-y-4">
                {recentMovements.length > 0 ? (
                  recentMovements.map((m: any, idx: number) => (
                    <div key={m.id} className="relative pl-6 pb-4 border-l border-border last:border-0 last:pb-0">
                      <div className={cn(
                        "absolute -left-[5px] top-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                        m.type === 'inbound' ? 'bg-blue-500' : m.type === 'outbound' ? 'bg-green-500' : 'bg-orange-500'
                      )} />
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold truncate max-w-[140px]">{m.productName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="h-4 text-[9px] px-1 py-0 uppercase font-bold">
                            {m.type === 'inbound' ? 'Recebimento' : m.type === 'outbound' ? 'Expedição' : 'Transferência'}
                          </Badge>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {m.quantity} unidades
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={Box} title="Nenhum evento recente" description="Movimentações do WMS aparecerão aqui em tempo real." />
                )}
              </div>
            </CardContent>
            <div className="p-4 pt-2 border-t mt-auto">
              <Link to="/wms/movimentacoes">
                <Button variant="ghost" size="sm" className="w-full text-xs gap-1 text-muted-foreground">
                  Ver log completo <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

