import { useState } from 'react';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Button } from '@/ui/base/button';
import { Skeleton } from '@/ui/base/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { BarChart3, DollarSign, Plus, Target, TrendingUp, Trophy } from 'lucide-react';
import { useSalesFunnel, useCreateFunnelItem, useUpdateFunnelItem, type DbFunnelItem } from '@/hooks/commercial/useSalesFunnel';
import { useClients } from '@/hooks/commercial/useClients';
import { useSalesReps } from '@/hooks/commercial/useSalesReps';
import { formatBRL } from '@/lib/formatters';
import { KANBAN_STAGES, useFunnelMetrics } from './sales-funnel/useFunnelMetrics';
import { FunnelKanban } from './sales-funnel/FunnelKanban';
import { FunnelAnalytics } from './sales-funnel/FunnelAnalytics';
import { FunnelAlerts } from './sales-funnel/FunnelAlerts';
import { FunnelFormDialog } from './sales-funnel/FunnelFormDialog';
import { EMPTY_FORM, type FunnelFormData } from './sales-funnel/formDefaults';

export default function SalesFunnelPage() {
  const { data: funnel = [], isLoading } = useSalesFunnel();
  const { data: clients = [] } = useClients();
  const { data: reps = [] } = useSalesReps();
  const createItem = useCreateFunnelItem();
  const updateItem = useUpdateFunnelItem();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DbFunnelItem | null>(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [formData, setFormData] = useState<FunnelFormData>(EMPTY_FORM);

  const { stats, stageMetrics, stagnantItems, grouped, funnelChartData } = useFunnelMetrics(funnel);

  const openNew = (stage?: string) => {
    setEditingItem(null);
    setFormData({ ...EMPTY_FORM, ...(stage ? { stage } : {}) });
    setIsFormOpen(true);
  };

  const openEdit = (item: DbFunnelItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title, description: item.description || '', stage: item.stage,
      value: item.value.toString(), probability: item.probability.toString(),
      expected_close_date: item.expected_close_date ? item.expected_close_date.split('T')[0] : '',
      contact_name: item.contact_name || '', contact_email: item.contact_email || '',
      contact_phone: item.contact_phone || '', source: item.source || '',
      notes: item.notes || '', client_id: item.client_id || '', sales_rep_id: item.sales_rep_id || '',
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title) return toastError('Título obrigatório');
    const payload: any = {
      title: formData.title, description: formData.description || null, stage: formData.stage,
      value: parseFloat(formData.value) || 0, probability: parseInt(formData.probability) || 10,
      expected_close_date: formData.expected_close_date || null,
      contact_name: formData.contact_name || null, contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null, source: formData.source || null,
      notes: formData.notes || null,
      client_id: formData.client_id || null, sales_rep_id: formData.sales_rep_id || null,
    };
    if (editingItem) await updateItem.mutateAsync({ id: editingItem.id, ...payload });
    else await createItem.mutateAsync(payload);
    setIsFormOpen(false);
    setEditingItem(null);
    setFormData(EMPTY_FORM);
  };

  const markAsWon = async (item: DbFunnelItem) => {
    await updateItem.mutateAsync({ id: item.id, status: 'won', won_date: new Date().toISOString() });
    toastSuccess('🏆 Oportunidade ganha!', item.title);
  };

  const markAsLost = async (item: DbFunnelItem) => {
    await updateItem.mutateAsync({ id: item.id, status: 'lost', lost_date: new Date().toISOString() });
    toastSuccess('Oportunidade perdida', item.title);
  };

  const moveToNextStage = async (item: DbFunnelItem) => {
    const idx = KANBAN_STAGES.findIndex(s => s.value === item.stage);
    if (idx < KANBAN_STAGES.length - 1) {
      await updateItem.mutateAsync({ id: item.id, stage: KANBAN_STAGES[idx + 1].value });
    }
  };

  const moveToStage = async (item: DbFunnelItem, targetStage: string) => {
    await updateItem.mutateAsync({ id: item.id, stage: targetStage });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Funil Comercial" description="Pipeline de vendas" />
        <div className="grid gap-4 md:grid-cols-4 mt-6"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Funil Comercial" description="Pipeline visual de oportunidades — arraste cards entre etapas">
        <Button onClick={() => openNew()} size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Oportunidade</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6 mt-6">
        <KPICard index={0} title="Oportunidades Abertas" value={stats.openCount.toString()} icon={<Target className="h-5 w-5" />} accentColor="info" />
        <KPICard index={1} title="Valor Pipeline" value={formatBRL(stats.totalValue)} icon={<DollarSign className="h-5 w-5" />} accentColor="primary" />
        <KPICard index={2} title="Valor Ponderado" value={formatBRL(stats.weightedValue)} icon={<TrendingUp className="h-5 w-5" />} accentColor="accent" />
        <KPICard index={3} title="Ganhos Totais" value={formatBRL(stats.wonValue)} subtitle={`${stats.wonCount} oportunidades`} icon={<Trophy className="h-5 w-5" />} accentColor="success" />
        <KPICard index={4} title="Taxa Conversão" value={`${stats.conversionRate.toFixed(1)}%`} subtitle={`${stats.lostCount} perdidas`} icon={<BarChart3 className="h-5 w-5" />} accentColor="warning" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="analytics">Métricas por Etapa</TabsTrigger>
          <TabsTrigger value="alerts">Alertas ({stagnantItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <FunnelKanban
            grouped={grouped}
            stageMetrics={stageMetrics}
            onNew={openNew}
            onEdit={openEdit}
            onAdvance={moveToNextStage}
            onWin={markAsWon}
            onLose={markAsLost}
            onMove={moveToStage}
          />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <FunnelAnalytics stageMetrics={stageMetrics} funnelChartData={funnelChartData} />
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <FunnelAlerts items={stagnantItems} onAdvance={moveToNextStage} onEdit={openEdit} />
        </TabsContent>
      </Tabs>

      <FunnelFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        formData={formData}
        setFormData={setFormData}
        editing={!!editingItem}
        saving={createItem.isPending || updateItem.isPending}
        onSave={handleSave}
        clients={clients}
        reps={reps}
      />
    </PageContainer>
  );
}
