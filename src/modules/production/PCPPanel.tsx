import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { useProductionOrders, type ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { useOrders } from '@/hooks/commercial/useOrders';
import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { useTechnicalSheets } from '@/hooks/production/useTechnicalSheets';
import { useSupplyStock } from '@/hooks/inventory/useSupplyStock';
import { productionStatusConfig } from '@/config/production';
import PCPKPIPanel from '@/components/production/PCPKPIPanel';
import { usePCPIntelligence } from '@/hooks/production/usePCPIntelligence';
import { Factory, Clock, CheckCircle, Gauge, GanttChart } from 'lucide-react';
import { GanttTimeline } from './pcp/GanttTimeline';
import { OrdersTab } from './pcp/OrdersTab';
import { DemandTab } from './pcp/DemandTab';
import { CapacityTab } from './pcp/CapacityTab';
import { ProductivityTab } from './pcp/ProductivityTab';
import { AlertsTab } from './pcp/AlertsTab';
import { ManagerPanel } from './pcp/ManagerPanel';
import { GenerateOPDialog } from './pcp/GenerateOPDialog';
import { usePCPPanelState, computeDerived, handleStatusChange } from './pcp/usePCPPanel';

export default function PCPPanel() {
  const { orders: productionOrders, loading, update, refetch: refetchProductionOrders } = useProductionOrders();
  const { data: salesOrders } = useOrders();
  const { entries: timeEntries } = useTimeEntries();
  const { capacities } = useProductionCapacity();
  const { sheets } = useTechnicalSheets();
  const { supplies } = useSupplyStock();
  const pcpIntel = usePCPIntelligence();
  const { search, setSearch, statusFilter, setStatusFilter, generatingFor, setGeneratingFor } = usePCPPanelState();

  const filtered = productionOrders.filter(o => {
    const matchSearch = !search || o.order_number.toLowerCase().includes(search.toLowerCase()) || o.product_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const { statusCounts, averageProgress, progressSampleSize, ordersAwaitingProduction, workCenterData, today, delayedOPs, operatorData } =
    computeDerived(productionOrders, salesOrders || [], timeEntries);

  const statusPieData = Object.entries(statusCounts).map(([k, v]) => ({
    name: productionStatusConfig[k]?.label || k, value: v,
  }));

  const onStatusChange = (op: ProductionOrderRow, newStatus: string) => handleStatusChange(op, newStatus, update);

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Painel PCP" description="Planejamento e Controle de Produção — Visão integrada com pedidos" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard title="Total OPs" value={productionOrders.length} icon={<Factory className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Planejadas" value={statusCounts['planned'] || 0} icon={<Clock className="h-5 w-5" />} accentColor="warning" index={1} />
        <KPICard title="Em Produção" value={statusCounts['in_progress'] || 0} icon={<Factory className="h-5 w-5" />} accentColor="info" index={2} />
        <KPICard title="Finalizadas" value={statusCounts['completed'] || 0} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={3} />
        <KPICard title="Avanço médio por OP ativa" value={averageProgress === null ? "—" : `${averageProgress.toFixed(0)}%`} subtitle={`${progressSampleSize} OPs com quantidades válidas`} icon={<Gauge className="h-5 w-5" />} accentColor={averageProgress !== null && averageProgress >= 70 ? 'success' : 'warning'} index={4} />
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="flex-wrap">
          <TabsTrigger value="manager">Painel do Gerente</TabsTrigger>
          <TabsTrigger value="orders">Ordens de Produção</TabsTrigger>
          <TabsTrigger value="gantt"><GanttChart className="h-4 w-4 mr-1" /> Timeline</TabsTrigger>
          <TabsTrigger value="demand">Demanda Comercial ({ordersAwaitingProduction.length})</TabsTrigger>
          <TabsTrigger value="capacity">OPs por centro {delayedOPs.length > 0 && <Badge variant="destructive" className="ml-1 h-5 text-[10px]">{delayedOPs.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="productivity">Atividade</TabsTrigger>
          <TabsTrigger value="kpis">📊 KPIs & Sugestões</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="manager" className="mt-4">
          <ManagerPanel />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab
            filtered={filtered}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            today={today} onStatusChange={onStatusChange}
          />
        </TabsContent>

        <TabsContent value="gantt" className="mt-4">
          <GanttTimeline orders={productionOrders} />
        </TabsContent>

        <TabsContent value="demand" className="mt-4">
          <DemandTab orders={ordersAwaitingProduction} onGenerate={setGeneratingFor} />
        </TabsContent>

        <TabsContent value="capacity" className="mt-4">
          <CapacityTab workCenterData={workCenterData} delayedOPs={delayedOPs} today={today} />
        </TabsContent>

        <TabsContent value="productivity" className="mt-4">
          <ProductivityTab operatorData={operatorData} statusPieData={statusPieData} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertsTab pcpIntel={pcpIntel} delayedOPs={delayedOPs} today={today} onStatusChange={onStatusChange} />
        </TabsContent>

        <TabsContent value="kpis" className="mt-4">
          <PCPKPIPanel
            orders={productionOrders}
            timeEntries={timeEntries}
            capacities={capacities}
            sheets={sheets}
            supplies={supplies}
          />
        </TabsContent>
      </Tabs>

      <GenerateOPDialog
        order={generatingFor}
        onClose={() => setGeneratingFor(null)}
        onGenerated={refetchProductionOrders}
      />
    </PageContainer>
  );
}
