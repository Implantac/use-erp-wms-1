import { useState, useMemo } from 'react';
import { ProductionDailyQueue } from './ProductionDailyQueue';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { ExportButton } from '@/shared/components/ExportButton';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { PlayCircle, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { isOrderOverdue } from './productionOrders/orderPresentation';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { OrdersFilters } from './productionOrders/OrdersFilters';
import { OrdersTable } from './productionOrders/OrdersTable';
import { OrderDetailDialog } from './productionOrders/OrderDetailDialog';
import { CreateTextileOrderDialog } from './productionOrders/CreateTextileOrderDialog';

export default function ProductionOrdersPage() {
  const { orders, loading, loadError, hasCompany, update: updateOrder } = useProductionOrders();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') || '');

  useEffect(() => { setSearchTerm(searchParams.get('q') || ''); }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrderRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const filteredOrders = useMemo(() => orders.filter(order => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      order.order_number.toLowerCase().includes(q) ||
      order.product_name.toLowerCase().includes(q) ||
      order.product_code.toLowerCase().includes(q) ||
      (order.client_name || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [orders, searchTerm, statusFilter, priorityFilter]);

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const inProgressCount = orders.filter(o => o.status === 'in_progress').length;
  const lateCount = orders.filter(o => isOrderOverdue(o)).length;

  const handleView = (order: ProductionOrderRow) => { setSelectedOrder(order); setDetailsOpen(true); };
  const setStatus = (order: ProductionOrderRow, status: string) => updateOrder(order.id, { status,
    ...(status === 'in_progress' && !order.start_date ? { start_date: new Date().toISOString() } : {}),
  });

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Ordens de Produção" description="Consulta e acompanhamento de OPs. Conclusão e rastreabilidade integral ainda não homologadas.">
        <ExportButton
          data={filteredOrders as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'order_number', label: 'Nº Ordem' }, { key: 'product_name', label: 'Produto' },
            { key: 'quantity', label: 'Qtd' }, { key: 'produced_quantity', label: 'Produzido' },
            { key: 'status', label: 'Status' }, { key: 'priority', label: 'Prioridade' },
          ]}
          filename="ordens_producao"
        />
      </PageHeader>
      <ProductionDailyQueue />

      {!hasCompany && <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar OPs.</p>}
      {loadError && <p role="alert" className="text-sm text-destructive">Falha na consulta de OPs; não é possível confirmar os totais.</p>}
      {hasCompany && !loadError && <>
      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Em Produção" value={inProgressCount} icon={<PlayCircle className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Na Fila" value={orders.filter(o => o.status === 'planned').length} icon={<Calendar className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Atrasadas" value={lateCount} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" index={2} />
        <KPICard title="OPs concluídas" value={completedCount} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={3} />
      </div>

      <OrdersFilters
        searchTerm={searchTerm} onSearchChange={setSearchTerm}
        statusFilter={statusFilter} onStatusChange={setStatusFilter}
        priorityFilter={priorityFilter} onPriorityChange={setPriorityFilter}
      />

      <OrdersTable
        orders={filteredOrders}
        onView={handleView}
        onStart={(o) => setStatus(o, 'in_progress')}
        onPause={(o) => setStatus(o, 'paused')}
        onResume={(o) => setStatus(o, 'in_progress')}
      />

      </>}

      <OrderDetailDialog order={selectedOrder} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </PageContainer>
  );
}
