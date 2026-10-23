import { useState, useMemo, useEffect } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { User } from 'lucide-react';
import { toast } from 'sonner';

import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useProductionOrderSteps, useProductionSteps } from '@/hooks/production/useProductionSteps';
import { recordProductionStepProgress } from '@/services/production/textilePcpService';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

import { SuggestionCard } from './operator-terminal/SuggestionCard';
import { StartProductionCard } from './operator-terminal/StartProductionCard';
import { ActiveProductionCard } from './operator-terminal/ActiveProductionCard';
import { ProblemDialog } from './operator-terminal/ProblemDialog';
import { ShiftSummaryCard } from './operator-terminal/ShiftSummaryCard';

export default function OperatorTerminalPage() {
  const { company } = useActiveTenant();
  const { entries, loading, create, update } = useTimeEntries();
  const { orders } = useProductionOrders();
  const { steps } = useProductionSteps();
  const { activeMachines } = useProductionMachines();

  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('operator_name') || '');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedStep, setSelectedStep] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [producedQty, setProducedQty] = useState(0);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemDesc, setProblemDesc] = useState('');
  const [problemCategory, setProblemCategory] = useState('machine_stop');
  const [reportingProblem, setReportingProblem] = useState(false);

  useEffect(() => {
    if (operatorName) localStorage.setItem('operator_name', operatorName);
  }, [operatorName]);

  const activeOrders = useMemo(() => {
    const pMap: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return orders
      .filter((o) => ['planned', 'in_progress', 'paused', 'waiting_material'].includes(o.status))
      .sort((a, b) => {
        const pDiff = (pMap[a.priority] ?? 9) - (pMap[b.priority] ?? 9);
        if (pDiff !== 0) return pDiff;
        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        return 0;
      });
  }, [orders]);

  const myActiveEntry = entries.find((e) => e.operator === operatorName && e.status === 'started');
  const myPausedEntry = entries.find((e) => e.operator === operatorName && e.status === 'paused');
  const currentEntry = myActiveEntry || myPausedEntry;

  const currentOrder = currentEntry
    ? orders.find((o) => o.id === currentEntry.production_order_id)
    : selectedOrderId
    ? orders.find((o) => o.id === selectedOrderId)
    : null;
  const { orderSteps } = useProductionOrderSteps(currentOrder?.id);

  // Pauses have no persisted start/end events. Do not present elapsed time
  // or an hourly productivity as measured until that lifecycle is implemented.
  const pct =
    currentOrder && currentOrder.quantity > 0
      ? ((currentOrder.produced_quantity + (currentEntry?.produced_quantity || 0)) / currentOrder.quantity) * 100
      : 0;

  const handleStart = async () => {
    if (!company?.id || !operatorName.trim() || !selectedOrderId || currentEntry) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order) return;
    if (!selectedStep) {
      toast.error('Selecione a operação do roteiro da OP antes de iniciar.');
      return;
    }
    const matchingOrderStep = orderSteps.find((orderStep) => orderStep.step_id === selectedStep);
    if (!matchingOrderStep) {
      toast.error('A operação selecionada não faz parte das etapas geradas para esta OP; gere pelo roteiro antes de apontar.');
      return;
    }
    const stepName = steps.find((s) => s.id === selectedStep)?.name || order.work_center || 'Produção';
    const machine = activeMachines.find((m) => m.id === selectedMachineId && m.status === 'available');
    if (selectedMachineId && !machine) {
      toast.error('Equipamento não disponível na empresa selecionada. Atualize a seleção.');
      return;
    }
    try {
      await recordProductionStepProgress({
        productionOrderStepId: matchingOrderStep.id,
        action: 'start',
        operatorName,
        machineId: machine?.id ?? null,
        workCenter: order.work_center || order.sector,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao iniciar a etapa da OP');
      return;
    }
    const created = await create({
      production_order_id: selectedOrderId,
      order_number: order.order_number,
      operation_id: selectedStep || null,
      operation_name: stepName,
      operator: operatorName,
      start_time: new Date().toISOString(),
      end_time: null,
      paused_time: 0,
      produced_quantity: 0,
      rejected_quantity: 0,
      status: 'started',
      notes: null,
      work_center: order.work_center || order.sector,
      machine_id: machine?.id || null,
      machine_name: machine?.name || null,
    });
    if (!created) {
      toast.error('Etapa iniciada no PCP, mas o registro de tempo do terminal não foi criado; avise a supervisão.');
      return;
    }
  };

  const syncStepPauseState = async (entry: typeof currentEntry, action: 'pause' | 'start') => {
    if (!entry) return true;
    const matchingOrderStep = orderSteps.find((orderStep) => orderStep.step_id === entry.operation_id);
    if (!matchingOrderStep) return true;
    try {
      await recordProductionStepProgress({
        productionOrderStepId: matchingOrderStep.id,
        action,
        operatorName,
        machineId: entry.machine_id,
        workCenter: entry.work_center,
      });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar a pausa/retomada da etapa');
      return false;
    }
  };

  const handlePause = async () => {
    if (!myActiveEntry) return;
    if (!await syncStepPauseState(myActiveEntry, 'pause')) return;
    if (!await update(myActiveEntry.id, { status: 'paused' }, 'started')) return;
    toast.info('Produção e etapa pausadas');
  };

  const handleResume = async () => {
    if (!myPausedEntry) return;
    if (!await syncStepPauseState(myPausedEntry, 'start')) return;
    if (!await update(myPausedEntry.id, { status: 'started' }, 'paused')) return;
    toast.success('Produção e etapa retomadas');
  };

  const handleFinish = async () => {
    if (!currentEntry) return;
    if (!Number.isFinite(producedQty) || producedQty < 0 || !Number.isFinite(rejectedQty) || rejectedQty < 0 || producedQty + rejectedQty <= 0) {
      toast.error('Informe quantidades válidas, com produção ou rejeito maior que zero');
      return;
    }
    const matchingOrderStep = orderSteps.find((orderStep) => orderStep.step_id === currentEntry.operation_id);
    if (!matchingOrderStep) {
      toast.error('Este apontamento não está vinculado a uma etapa da OP; não feche pelo terminal antes de corrigir o vínculo.');
      return;
    }
    try {
      await recordProductionStepProgress({
        productionOrderStepId: matchingOrderStep.id,
        action: 'progress',
        producedQuantity: producedQty,
        rejectedQuantity: rejectedQty,
        operatorName,
        machineId: currentEntry.machine_id,
        workCenter: currentEntry.work_center,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reconciliar o apontamento com a etapa da OP');
      return;
    }
    const finished = await update(currentEntry.id, {
      status: 'completed',
      end_time: new Date().toISOString(),
      produced_quantity: producedQty,
      rejected_quantity: rejectedQty,
    }, currentEntry.status === 'paused' ? 'paused' : 'started');
    if (!finished) {
      toast.error('Etapa atualizada no PCP, mas o registro de tempo não fechou; avise a supervisão.');
      return;
    }
    toast.success('Apontamento reconciliado com a etapa e a OP. Qualidade, reserva e estoque são concluídos na transação da OP.');
    setProducedQty(0);
    setRejectedQty(0);
  };

  const handleReportProblem = async () => {
    if (!problemDesc.trim()) {
      toast.error('Descreva o problema');
      return;
    }
    setReportingProblem(true);
    try {
      const titles: Record<string, string> = {
        machine_stop: 'Parada de Máquina',
        quality_issue: 'Problema de Qualidade',
        material_shortage: 'Falta de Material',
        safety: 'Segurança',
      };
      // Never fall back to a profile company when the selected tenant is absent.
      // A profile can belong to a different company than the active operation.
      const companyId = company?.id;
      if (!companyId) {
        toast.error('Empresa ativa não identificada. Selecione uma empresa antes de reportar.');
        return;
      }
      const { error: alertError } = await supabase.from('industrial_alerts').insert({
        company_id: companyId,
        alert_type: problemCategory,
        severity: problemCategory === 'machine_stop' ? 'critical' : 'high',
        title: `Problema reportado: ${titles[problemCategory] || problemCategory}`,
        description: `Operador: ${operatorName}. ${currentEntry ? `OP: ${currentEntry.order_number}.` : ''} ${problemDesc}`,
        entity_type: 'operator_report',
        entity_name: operatorName,
        entity_id: currentEntry?.production_order_id || null,
        status: 'active',
      });
      if (alertError) {
        toast.error('Falha ao registrar alerta; problema não confirmado. Tente novamente ou avise a supervisão.');
        return;
      }
      if (currentEntry && currentEntry.status === 'started') {
        if (!await update(currentEntry.id, { status: 'paused' }, 'started')) {
          toast.error('Alerta registrado, mas o apontamento NÃO foi pausado. Avise a supervisão.');
          return;
        }
      }
      toast.success('Alerta registrado e apontamento pausado. Registre a parada estruturada na Central de Tecelagem ou na Execução PCP da OP.');
      setProblemOpen(false);
      setProblemDesc('');
    } catch {
      toast.error('Erro ao reportar problema');
    } finally {
      setReportingProblem(false);
    }
  };

  // Shift summary
  const today = new Date().toDateString();
  const todayEntries = entries.filter(
    (e) => e.operator === operatorName && e.status === 'completed' && new Date(e.start_time).toDateString() === today
  );

  return (
    <PageContainer loading={loading}>
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" /> Terminal do Operador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">Nome informado manualmente; não confirma identidade nem autorização. Durante um apontamento, o nome fica bloqueado nesta tela.</p>
            <Input
              placeholder="Seu nome..."
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              disabled={!!currentEntry || reportingProblem}
              className="text-lg h-14 text-center font-semibold"
            />
          </CardContent>
        </Card>

        {!currentEntry && operatorName && activeOrders.length > 0 && (
          <SuggestionCard activeOrders={activeOrders} onSelect={setSelectedOrderId} />
        )}

        {!currentEntry ? (
          <StartProductionCard
            operatorName={operatorName}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            selectedStep={selectedStep}
            onSelectStep={setSelectedStep}
            selectedMachineId={selectedMachineId}
            onSelectMachine={setSelectedMachineId}
            activeOrders={activeOrders}
            steps={steps}
            activeMachines={activeMachines}
            currentOrder={currentOrder}
            onStart={handleStart}
          />
        ) : (
          <ActiveProductionCard
            entry={currentEntry}
            order={currentOrder}
            progressPct={pct}
            producedQty={producedQty}
            rejectedQty={rejectedQty}
            onChangeProduced={setProducedQty}
            onChangeRejected={setRejectedQty}
            onPause={handlePause}
            onResume={handleResume}
            onFinish={handleFinish}
            onReportProblem={() => setProblemOpen(true)}
          />
        )}

        <ProblemDialog
          open={problemOpen}
          onOpenChange={setProblemOpen}
          category={problemCategory}
          onCategoryChange={setProblemCategory}
          description={problemDesc}
          onDescriptionChange={setProblemDesc}
          hasActiveEntry={!!currentEntry}
          submitting={reportingProblem}
          onSubmit={handleReportProblem}
        />

        <ShiftSummaryCard
          activities={todayEntries.length}
        />
      </div>
    </PageContainer>
  );
}
