import { useMemo, useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Skeleton } from '@/ui/base/skeleton';
import { useProductionSteps, useProductionOrderSteps, type ProductionStep } from '@/hooks/production/useProductionSteps';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { ArrowRight, CheckCircle, Clock, Factory, Layers, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { StepsCatalogTab } from '@/modules/production/productionSteps/StepsCatalogTab';
import { OrderStepsTrackingTab } from '@/modules/production/productionSteps/OrderStepsTrackingTab';
import { StepFormDialog, type StepFormState } from '@/modules/production/productionSteps/StepFormDialog';
import { GenerateStepsDialog } from '@/modules/production/productionSteps/GenerateStepsDialog';

const emptyForm: StepFormState = {
  name: '',
  code: '',
  description: '',
  sequence: 0,
  estimated_time_minutes: 0,
  sector: '',
  is_active: true,
};

export default function ProductionStepsPage() {
  const { steps, loading, createStep, updateStep, deleteStep } = useProductionSteps();
  const { orders, refetch: refetchOrders } = useProductionOrders();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<ProductionStep | null>(null);
  const [form, setForm] = useState<StepFormState>(emptyForm);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const { orderSteps, loading: orderStepsLoading, refetch: refetchOrderSteps, generateStepsForOrder } =
    useProductionOrderSteps(selectedOrderId || undefined);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [generateOrderId, setGenerateOrderId] = useState('');

  // Acompanhamento não pode perder a OP quando a última etapa a leva a
  // finishing/quality_check: todos os estados não finais continuam visíveis.
  const activeOrders = useMemo(
    () => orders.filter((o) => !['completed', 'cancelled'].includes(o.status)),
    [orders]
  );

  const totalEstimatedTime = steps.reduce((s, st) => s + st.estimated_time_minutes, 0);
  const activeStepsCount = steps.filter((s) => s.is_active).length;
  const sectors = [...new Set(steps.map((s) => s.sector).filter(Boolean))];

  const openNew = () => {
    setEditingStep(null);
    setForm({ ...emptyForm, sequence: (steps.length + 1) * 10, estimated_time_minutes: 30 });
    setDialogOpen(true);
  };

  const openEdit = (step: ProductionStep) => {
    setEditingStep(step);
    setForm({
      name: step.name,
      code: step.code,
      description: step.description || '',
      sequence: step.sequence,
      estimated_time_minutes: step.estimated_time_minutes,
      sector: step.sector || '',
      is_active: step.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return;
    if (editingStep) await updateStep(editingStep.id, form);
    else await createStep(form);
    setDialogOpen(false);
  };

  const openGenerate = () => {
    setSelectedStepIds(steps.filter((s) => s.is_active).map((s) => s.id));
    setGenerateOrderId('');
    setGenerateDialogOpen(true);
  };

  const openGenerateForCurrentOrder = () => {
    setGenerateOrderId(selectedOrderId);
    setSelectedStepIds(steps.filter((s) => s.is_active).map((s) => s.id));
    setGenerateDialogOpen(true);
  };

  const handleGenerate = async () => {
    if (!generateOrderId || selectedStepIds.length === 0) {
      toast.error('Selecione a OP e pelo menos uma etapa');
      return;
    }
    const order = orders.find((o) => o.id === generateOrderId);
    if (!order) return;
    if (!await generateStepsForOrder(generateOrderId, order.quantity, selectedStepIds)) return;
    setGenerateDialogOpen(false);
    setSelectedOrderId(generateOrderId);
  };

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-64" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Etapas de Produção" description="Defina o fluxo produtivo e acompanhe a execução por OP">
        <Button variant="outline" onClick={openGenerate}>
          <ArrowRight className="h-4 w-4 mr-2" /> Gerar Etapas p/ OP
        </Button>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Nova Etapa
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Etapas Cadastradas" value={steps.length} icon={<Layers className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Ativas" value={activeStepsCount} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Setores" value={sectors.length} icon={<Factory className="h-5 w-5" />} accentColor="info" index={2} />
        <KPICard title="Tempo Total" value={`${totalEstimatedTime} min`} icon={<Clock className="h-5 w-5" />} accentColor="warning" index={3} />
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">📋 Catálogo de Etapas</TabsTrigger>
          <TabsTrigger value="tracking">🔄 Acompanhar Etapas da OP</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          <StepsCatalogTab steps={steps} onNew={openNew} onEdit={openEdit} onDelete={deleteStep} />
        </TabsContent>

        <TabsContent value="tracking" className="mt-4 space-y-4">
          <OrderStepsTrackingTab
            activeOrders={activeOrders}
            selectedOrder={activeOrders.find((order) => order.id === selectedOrderId) ?? null}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            orderSteps={orderSteps}
            orderStepsLoading={orderStepsLoading}
            onOpenGenerateForOrder={openGenerateForCurrentOrder}
            onChanged={async () => { await Promise.all([refetchOrderSteps(), refetchOrders()]); }}
          />
        </TabsContent>
      </Tabs>

      <StepFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={!!editingStep}
        form={form}
        setForm={setForm}
        onSave={handleSave}
      />

      <GenerateStepsDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        activeOrders={activeOrders}
        activeSteps={steps.filter((s) => s.is_active)}
        generateOrderId={generateOrderId}
        setGenerateOrderId={setGenerateOrderId}
        selectedStepIds={selectedStepIds}
        setSelectedStepIds={setSelectedStepIds}
        onGenerate={handleGenerate}
      />
    </PageContainer>
  );
}
