import { useState } from 'react';
import { ExportButton } from '@/shared/components/ExportButton';
import { Button } from '@/ui/base/button';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { useTimeEntries, TimeEntryRow } from '@/hooks/system/useTimeEntries';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { EMPTY_ENTRY, type NewEntryForm } from './timeEntries/constants';
import { TimeEntriesKPIs } from './timeEntries/TimeEntriesKPIs';
import { TimeEntriesFilters } from './timeEntries/TimeEntriesFilters';
import { TimeEntriesTable } from './timeEntries/TimeEntriesTable';
import { TimeEntryDetailsDialog } from './timeEntries/TimeEntryDetailsDialog';
import { NewTimeEntryDialog } from './timeEntries/NewTimeEntryDialog';

export default function TimeEntriesPage() {
  const { entries, loading, create, update } = useTimeEntries();
  const { orders, update: updateOrder } = useProductionOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workCenterFilter, setWorkCenterFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [newEntry, setNewEntry] = useState<NewEntryForm>(EMPTY_ENTRY);

  const activeOrders = orders.filter(o => ['planned', 'in_progress'].includes(o.status));
  const workCenters = [...new Set(entries.map(e => e.work_center).filter(Boolean))];

  const filteredEntries = entries.filter(entry => {
    const matchesSearch =
      entry.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.operation_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.operator.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
    const matchesWorkCenter = workCenterFilter === 'all' || entry.work_center === workCenterFilter;
    return matchesSearch && matchesStatus && matchesWorkCenter;
  });

  const today = new Date().toDateString();
  const activeCount = entries.filter(e => e.status === 'started').length;
  const pausedCount = entries.filter(e => e.status === 'paused').length;
  const completedToday = entries.filter(e => e.status === 'completed' && e.end_time && new Date(e.end_time).toDateString() === today).length;

  const handlePause = async (entry: TimeEntryRow) => {
    if (!await update(entry.id, { status: 'paused' }, 'started')) return;
    toast.info(`Apontamento pausado: ${entry.operation_name}`);
  };

  const handleResume = async (entry: TimeEntryRow) => {
    if (!await update(entry.id, { status: 'started' }, 'paused')) return;
    toast.success(`Apontamento retomado: ${entry.operation_name}`);
  };

  const handleComplete = async (entry: TimeEntryRow) => {
    if (entry.status !== 'started' && entry.status !== 'paused') return;
    if (!await update(entry.id, { status: 'completed', end_time: new Date().toISOString() }, entry.status)) return;
    toast.info(`Apontamento concluído: ${entry.operation_name}. Quantidade da OP pendente de conciliação.`);
  };

  const handleStartNew = async () => {
    if (!newEntry.orderId || !newEntry.operationName || !newEntry.operator) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const order = orders.find(o => o.id === newEntry.orderId);
    if (!order) return;

    const created = await create({
      production_order_id: newEntry.orderId,
      order_number: order.order_number,
      operation_id: null,
      operation_name: newEntry.operationName,
      operator: newEntry.operator,
      start_time: new Date().toISOString(),
      end_time: null,
      paused_time: 0,
      produced_quantity: 0,
      rejected_quantity: 0,
      status: 'started',
      notes: null,
      work_center: newEntry.workCenter || null,
    });

    if (!created) return;
    if (order.status === 'planned') {
      await updateOrder(order.id, { status: 'in_progress', start_date: new Date().toISOString() });
    }

    setStartOpen(false);
    setNewEntry(EMPTY_ENTRY);
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Apontamentos" description="Registro de tempo e produção por operação">
        <ExportButton
          data={filteredEntries as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'order_number', label: 'Ordem' },
            { key: 'operation_name', label: 'Operação' },
            { key: 'operator', label: 'Operador' },
            { key: 'work_center', label: 'Centro de Trabalho' },
            { key: 'produced_quantity', label: 'Produzido' },
            { key: 'rejected_quantity', label: 'Rejeitado' },
            { key: 'status', label: 'Status' },
          ]}
          filename="apontamentos"
        />
        <Button onClick={() => setStartOpen(true)}>
          <Play className="h-4 w-4 mr-2" />Novo Apontamento
        </Button>
      </PageHeader>

      <TimeEntriesKPIs
        activeCount={activeCount}
        pausedCount={pausedCount}
        completedToday={completedToday}
      />

      <TimeEntriesFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        workCenterFilter={workCenterFilter}
        setWorkCenterFilter={setWorkCenterFilter}
        workCenters={workCenters}
      />

      <TimeEntriesTable
        entries={entries}
        filteredEntries={filteredEntries}
        onView={(e) => { setSelectedEntry(e); setDetailsOpen(true); }}
        onPause={handlePause}
        onResume={handleResume}
        onComplete={handleComplete}
        onNew={() => setStartOpen(true)}
        onClearFilters={() => { setSearchTerm(''); setStatusFilter('all'); setWorkCenterFilter('all'); }}
      />

      <TimeEntryDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} entry={selectedEntry} />

      <NewTimeEntryDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        activeOrders={activeOrders}
        form={newEntry}
        setForm={setNewEntry}
        onSubmit={handleStartNew}
      />
    </PageContainer>
  );
}
