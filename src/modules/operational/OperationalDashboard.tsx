import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { EmptyState } from '@/shared/components/EmptyState';
import { useOrders } from '@/hooks/commercial/useOrders';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useBillingQueue, useShipmentOrders, useConferenceRecords, getOrderFlowStatus } from '@/hooks/commercial/useOrderFlow';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FileText, Factory, Package, Truck, ClipboardCheck, DollarSign, AlertTriangle, Clock, TrendingUp, Timer, Target, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInHours, parseISO } from 'date-fns';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

import { DailyTaskBoard } from './components/DailyTaskBoard';

export default function OperationalDashboard() {
  const { data: orders } = useOrders();
  const { orders: productionOrders } = useProductionOrders();
  const { data: billingItems } = useBillingQueue();
  const { data: shipments } = useShipmentOrders();
  const { data: conferences } = useConferenceRecords();

  const allOrders = orders || [];

  // Status distribution
  const ordersByStatus = allOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const orderStatusData = Object.entries(ordersByStatus).map(([status, count]) => ({
    name: getOrderFlowStatus(status).label,
    value: count,
  }));

  const prodByStatus = productionOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const prodStatusData = Object.entries(prodByStatus).map(([status, count]) => ({
    name: status === 'planned' ? 'Planejada' : status === 'in_progress' ? 'Em Andamento' : status === 'completed' ? 'Concluída' : status === 'paused' ? 'Pausada' : status,
    value: count,
  }));

  // KPI calculations
  const blockedOrders = allOrders.filter(o => o.status === 'blocked').length;
  const awaitingProduction = allOrders.filter(o => o.status === 'awaiting_production' || o.status === 'in_production').length;
  const awaitingSeparation = allOrders.filter(o => o.status === 'awaiting_separation' || o.status === 'in_separation').length;
  const awaitingBilling = billingItems?.filter((i) => i.status === 'awaiting_billing').length || 0;
  const pendingConference = conferences?.filter((c) => c.status === 'pending').length || 0;
  const inTransit = shipments?.filter((s) => s.status === 'in_transit' || s.status === 'dispatched').length || 0;

  // Delayed orders (past delivery_date and not delivered/cancelled)
  const today = new Date();
  const delayedOrders = allOrders.filter(o => {
    if (!o.delivery_date || o.status === 'delivered' || o.status === 'cancelled') return false;
    return differenceInDays(today, parseISO(o.delivery_date)) > 0;
  });

  // OTIF (On Time In Full) - delivered within delivery_date
  const deliveredOrders = allOrders.filter(o => o.status === 'delivered');
  const onTimeDelivered = deliveredOrders.filter(o => {
    if (!o.delivery_date) return true;
    return differenceInDays(parseISO(o.updated_at), parseISO(o.delivery_date)) <= 0;
  });
  const otifRate = deliveredOrders.length > 0 ? (onTimeDelivered.length / deliveredOrders.length * 100) : 0;

  // Average time per stage (hours from created_at to updated_at for completed)
  const completedOrders = allOrders.filter(o => o.status === 'delivered' || o.status === 'invoiced');
  const avgLeadTime = completedOrders.length > 0
    ? completedOrders.reduce((s, o) => s + differenceInHours(parseISO(o.updated_at), parseISO(o.created_at)), 0) / completedOrders.length
    : 0;

  // Production efficiency
  const activeProduction = productionOrders.filter(o => o.status === 'in_progress' || o.status === 'completed');
  const prodEfficiency = activeProduction.length > 0
    ? activeProduction.reduce((s, o) => s + (o.produced_quantity / Math.max(o.quantity, 1)), 0) / activeProduction.length * 100
    : 0;

  // Workload by work center
  const workCenterLoad = productionOrders
    .filter(o => o.status === 'in_progress' || o.status === 'planned')
    .reduce((acc: Record<string, number>, o) => {
      const wc = o.work_center || 'Sem setor';
      acc[wc] = (acc[wc] || 0) + 1;
      return acc;
    }, {});
  const workCenterData = Object.entries(workCenterLoad).map(([name, value]) => ({ name, value }));

  const kpis = [
    { label: 'Pedidos Ativos', value: allOrders.length, icon: FileText, color: 'text-primary' },
    { label: 'Ordens Produção', value: productionOrders.length, icon: Factory, color: 'text-info' },
    { label: 'Bloqueados', value: blockedOrders, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Aguard. Separação', value: awaitingSeparation, icon: Package, color: 'text-warning-text' },
    { label: 'Aguard. Produção', value: awaitingProduction, icon: Factory, color: 'text-warning-text' },
    { label: 'Conferência Pend.', value: pendingConference, icon: ClipboardCheck, color: 'text-accent-foreground' },
    { label: 'Aguard. Faturamento', value: awaitingBilling, icon: DollarSign, color: 'text-warning-text' },
    { label: 'Em Trânsito', value: inTransit, icon: Truck, color: 'text-info' },
  ];

  const advancedKpis = [
    { label: 'Pedidos Atrasados', value: delayedOrders.length, icon: Clock, color: delayedOrders.length > 0 ? 'text-destructive' : 'text-success' },
    { label: 'OTIF', value: `${otifRate.toFixed(0)}%`, icon: Target, color: otifRate >= 90 ? 'text-success' : otifRate >= 70 ? 'text-warning-text' : 'text-destructive' },
    { label: 'Lead Time Médio', value: `${avgLeadTime.toFixed(0)}h`, icon: Timer, color: 'text-muted-foreground' },
    { label: 'Efic. Produção', value: `${prodEfficiency.toFixed(0)}%`, icon: TrendingUp, color: prodEfficiency >= 80 ? 'text-success' : 'text-warning-text' },
  ];

  return (
    <PageContainer>
      <PageHeader title="Dashboard Operacional" description="Visão integrada do fluxo comercial → produção → expedição → faturamento" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={cn('h-7 w-7 flex-shrink-0', k.color)} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Advanced KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {advancedKpis.map(k => (
          <Card key={k.label} className="border-dashed">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={cn('h-7 w-7 flex-shrink-0', k.color)} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>

    <div className="lg:col-span-1">
      <DailyTaskBoard />
    </div>
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Pedidos por Status</CardTitle></CardHeader>
          <CardContent>
            {orderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={orderStatusData} layout="vertical" margin={{ left: 100 }}>
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={BarChart3} title="Sem pedidos no período" description="Cadastre pedidos para acompanhar a distribuição por status." compact />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ordens de Produção</CardTitle></CardHeader>
          <CardContent>
            {prodStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={prodStatusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {prodStatusData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState icon={PieChartIcon} title="Sem ordens de produção" description="Ordens ativas aparecerão distribuídas por status." compact />}
          </CardContent>
        </Card>
      </div>

      {/* Workload by sector */}
      {workCenterData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Carga Produtiva por Setor</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={workCenterData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Delayed orders alert */}
      {delayedOrders.length > 0 && (
        <Card className="mt-6 border-destructive/30">
          <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Pedidos Atrasados</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {delayedOrders.slice(0, 10).map(o => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">{o.number}</span>
                    <span className="text-muted-foreground">{o.client_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('font-medium border', getOrderFlowStatus(o.status).color)}>
                      {getOrderFlowStatus(o.status).label}
                    </Badge>
                    <Badge variant="destructive" className="text-xs">
                      {differenceInDays(today, parseISO(o.delivery_date!))} dias
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
