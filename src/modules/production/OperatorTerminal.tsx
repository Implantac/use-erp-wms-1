import { useState, useMemo, useEffect } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { User } from 'lucide-react';
import { differenceInMinutes, differenceInSeconds } from 'date-fns';
import { toast } from 'sonner';

import { useTimeEntries } from '@/hooks/system/useTimeEntries';
import { useProductionOrders, type ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { useProductionSteps } from '@/hooks/production/useProductionSteps';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';

import { SuggestionCard } from './operator-terminal/SuggestionCard';
import { StartProductionCard } from './operator-terminal/StartProductionCard';
import { ActiveProductionCard } from './operator-terminal/ActiveProductionCard';
import { ProblemDialog } from './operator-terminal/ProblemDialog';
import { ShiftSummaryCard } from './operator-terminal/ShiftSummaryCard';

export default function OperatorTerminalPage() {
  const { entries, loading, create, update } = useTimeEntries();
  const { orders, update: updateOrder } = useProductionOrders();
  const { steps } = useProductionSteps();
  const { activeMachines } = useProductionMachines();

  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('operator_name') || '');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedStep, setSelectedStep] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [producedQty, setProducedQty] = useState(0);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [now, setNow] = useState(new Date());
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemDesc, setProblemDesc] = useState('');
  const [problemCategory, setProblemCategory] = useState('machine_stop');
  const [reportingProblem, setReportingProblem] = useState(false);

  useEffect(() => {
    if (operatorName) localStorage.setItem('operator_name', operatorName);
  }, [operatorName]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeOrders = useMemo(() => {
    const pMap: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return orders
      .filter((o) => ['planned', 'in_progress'].includes(o.status))
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

  const elapsedSec =
    currentEntry && currentEntry.status === 'started'
      ? differenceInSeconds(now, new Date(currentEntry.start_time)) - ((currentEntry.paused_time || 0) * 60)
      : 0;
  const elapsedMin = Math.floor(elapsedSec / 60);

  const productivity =
    currentEntry && elapsedMin > 0 ? (currentEntry.produced_quantity / (elapsedMin / 60)).toFixed(1) : '0';

  const pct =
    currentOrder && currentOrder.quantity > 0
      ? ((currentOrder.produced_quantity + (currentEntry?.produced_quantity || 0)) / currentOrder.quantity) * 100
      : 0;

  const handleStart = async () => {
    if (!operatorName || !selectedOrderId) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order) return;
    const stepName = steps.find((s) => s.id === selectedStep)?.name || order.work_center || 'Produção';
    const machine = activeMachines.find((m) => m.id === selectedMachineId);
    await create({
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
    if (order.status === 'planned') {
      await updateOrder(order.id, { status: 'in_progress', start_date: new Date().toISOString() });
    }
  };

  const handlePause = async () => {
    if (!myActiveEntry) return;
    await update(myActiveEntry.id, { status: 'paused' });
    toast.info('Produção pausada');
  };

  const handleResume = async () => {
    if (!myPausedEntry) return;
    await update(myPausedEntry.id, { status: 'started' });
    toast.success('Produção retomada');
  };

  const handleFinish = async () => {
    if (!currentEntry) return;
    if (producedQty <= 0) {
      toast.error('Informe a quantidade produzida');
      return;
    }
    await update(currentEntry.id, {
      status: 'completed',
      end_time: new Date().toISOString(),
      produced_quantity: producedQty,
      rejected_quantity: rejectedQty,
    });
    if (currentEntry.production_order_id) {
      const order = orders.find((o) => o.id === currentEntry.production_order_id);
      if (order) {
        const newProduced = order.produced_quantity + producedQty;
        const newRejected = order.rejected_quantity + rejectedQty;
        const updates: Partial<ProductionOrderRow> = {
          produced_quantity: newProduced,
          rejected_quantity: newRejected,
          realized_time_minutes: order.realized_time_minutes + elapsedMin,
        };
        // A finished time entry is not a completed OP. Quality and stock must
        // be reconciled by a separately homologated transactional workflow.
        if (newProduced >= order.quantity) {
          toast.info('Quantidade apontada; conclusão da OP pendente de qualidade e estoque.');
        }
        await updateOrder(order.id, updates);
      }
    }
    setProducedQty(0);
    setRejectedQty(0);
    toast.success('Apontamento finalizado');
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
      const { data: { user } } = await supabase.auth.getUser();
      let companyId = useEnterpriseStore.getState().activeCompanyId;
      if (!companyId && user) {
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle();
        companyId = profile?.company_id ?? null;
      }
      if (!companyId) {
        toast.error('Empresa não identificada. Selecione uma empresa.');
        return;
      }
      await supabase.from('industrial_alerts').insert({
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
      if (currentEntry && currentEntry.status === 'started') {
        await update(currentEntry.id, { status: 'paused' });
      }
      toast.success('Problema reportado com sucesso. Supervisão notificada.');
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
  const todayProduced = todayEntries.reduce((s, e) => s + e.produced_quantity, 0);
  const todayRejected = todayEntries.reduce((s, e) => s + e.rejected_quantity, 0);
  const todayMinutes = todayEntries.reduce((s, e) => {
    if (e.end_time) return s + differenceInMinutes(new Date(e.end_time), new Date(e.start_time)) - (e.paused_time || 0);
    return s;
  }, 0);
  const todayPcsH = todayMinutes > 0 ? (todayProduced / (todayMinutes / 60)).toFixed(1) : '0';
  const qualityRate =
    todayProduced + todayRejected > 0
      ? ((todayProduced / (todayProduced + todayRejected)) * 100).toFixed(0)
      : '100';

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
            <Input
              placeholder="Seu nome..."
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
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
            elapsedSec={elapsedSec}
            progressPct={pct}
            productivity={productivity}
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
          produced={todayProduced}
          rejected={todayRejected}
          piecesPerHour={todayPcsH}
          qualityRate={qualityRate}
        />
      </div>
    </PageContainer>
  );
}
