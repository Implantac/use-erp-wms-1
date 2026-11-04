import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { ExportButton } from '@/shared/components/ExportButton';
import { Package, Clock, PlayCircle, CheckCircle, PackagePlus } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { useWMSReceiving, type ReceivingOrderView } from '@/hooks/wms/useWMSOperations';
import { FiberReceiptDialog } from './FiberReceiptDialog';
import { formatDate } from './receiving/constants';
import { ReceivingFilters } from './receiving/ReceivingFilters';
import { ReceivingTable } from './receiving/ReceivingTable';
import { ReceivingDetailsDialog } from './receiving/ReceivingDetailsDialog';

export default function ReceivingPage() {
  const { orders, loading, refetch, update } = useWMSReceiving();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<ReceivingOrderView | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [fiberReceiptOpen, setFiberReceiptOpen] = useState(false);

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const inProgressCount = orders.filter(o => o.status === 'in_progress').length;
  const completedCount = orders.filter(o => o.status === 'completed').length;

  const handleStart = async (id: string) => {
    await update(id, { status: 'in_progress', received_date: null });
    refetch();
  };

  const handleComplete = async (id: string) => {
    await update(id, { status: 'completed', received_date: new Date().toISOString() });
    setIsDetailsOpen(false);
    refetch();
  };

  const openDetails = (order: ReceivingOrderView) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader title="Recebimento" description="Gerenciamento de recebimento de mercadorias">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setFiberReceiptOpen(true)} className="gap-2">
            <PackagePlus className="h-4 w-4" /> Receber pluma/fibra
          </Button>
          <ExportButton
          data={filteredOrders as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'orderNumber', label: 'Nº Ordem' },
            { key: 'supplier', label: 'Fornecedor' },
            { key: 'dock', label: 'Doca' },
            { key: 'status', label: 'Status' },
            { key: 'expectedDate', label: 'Data Prevista', format: (v) => formatDate(v as string) },
          ]}
            filename="recebimento_wms"
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Pendentes" value={pendingCount} subtitle="Aguardando recebimento" icon={<Clock className="h-5 w-5" />} accentColor="warning" index={0} />
        <KPICard title="Em Andamento" value={inProgressCount} subtitle="Sendo recebidos" icon={<PlayCircle className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Concluídos" value={completedCount} subtitle="Finalizados" icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="Total Ordens" value={orders.length} subtitle="Ordens cadastradas" icon={<Package className="h-5 w-5" />} accentColor="primary" index={3} />
      </div>

      <ReceivingFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <ReceivingTable
        loading={loading}
        orders={filteredOrders}
        onStart={handleStart}
        onComplete={handleComplete}
        onOpenDetails={openDetails}
      />

      <ReceivingDetailsDialog
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        order={selectedOrder}
        setOrder={setSelectedOrder}
        onStart={handleStart}
        onComplete={handleComplete}
      />

      <FiberReceiptDialog open={fiberReceiptOpen} onOpenChange={setFiberReceiptOpen} />
    </PageContainer>
  );
}
