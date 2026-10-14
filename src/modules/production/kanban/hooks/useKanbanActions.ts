import type { SequenceResult } from '../types';
import { useCallback, useState } from 'react';
import { type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WarModeService } from '@/lib/pcpServices';
import { VALID_TRANSITIONS, STATUS_LABELS } from '../constants';
import type { TablesUpdate } from '@/integrations/supabase/types';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { ProductionCapacityRow } from '@/hooks/production/useProductionCapacity';
import type { PCPIntelligence } from '@/hooks/production/usePCPIntelligence';
import type { BottleneckAnalysis } from '../BottleneckDialog';

export function useKanbanActions(params: {
  orders: ProductionOrderRow[];
  update: (id: string, updates: TablesUpdate<'production_orders'>) => Promise<boolean>;
  refetch: () => Promise<void> | void;
  capacityLoad: Record<string, { name: string; capacity: number; allocated: number }>;
  wipLimits: Record<string, number>;
  intelligence: PCPIntelligence;
  capacities: ProductionCapacityRow[];
}) {
  const { orders, update, refetch, capacityLoad, wipLimits, intelligence, capacities } = params;

  const [warModeOpen, setWarModeOpen] = useState(false);
  const [warModeResult, setWarModeResult] = useState<any>(null);
  const [warModeLoading, setWarModeLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [sequenceResult, setSequenceResult] = useState<SequenceResult | null>(null);
  const [sequenceLoading, setSequenceLoading] = useState(false);
  const [applyingSequence, setApplyingSequence] = useState(false);
  const [bottleneckData, setBottleneckData] = useState<BottleneckAnalysis | null>(null);
  const [bottleneckLoading, setBottleneckLoading] = useState(false);
  const [bottleneckOpen, setBottleneckOpen] = useState(false);

  const moveOrder = useCallback(async (orderId: string, newStatus: string) => {
    if (newStatus === 'completed') { toast.error('Conclusão de OP indisponível até validação transacional'); return false; }
    const order = orders.find(o => o.id === orderId);
    const wcId = order && (order as { work_center_id?: string | null }).work_center_id;
    if (wcId && capacityLoad[wcId]) {
      const cl = capacityLoad[wcId];
      if (cl.allocated + (order?.quantity || 0) > cl.capacity) {
        toast.warning(`⚠️ Capacidade excedida no centro "${cl.name}"`, {
          description: `Alocado: ${cl.allocated + (order?.quantity || 0)} / Capacidade: ${cl.capacity}. Operação permitida, mas requer atenção.`,
        });
      }
    }

    const updates: TablesUpdate<'production_orders'> = { status: newStatus };
    if (newStatus === 'in_progress' || newStatus === 'outsourced') updates.start_date = updates.start_date || new Date().toISOString();
    if (newStatus === 'completed') updates.completed_date = new Date().toISOString();
    return (await update(orderId, updates)) === true;
  }, [update, orders, capacityLoad]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const order = orders.find(o => o.id === draggableId);
    if (!order || order.status === newStatus) return;

    if (!VALID_TRANSITIONS[order.status]?.includes(newStatus)) {
      toast.error(`Transição inválida: "${STATUS_LABELS[order.status] || order.status}" → "${STATUS_LABELS[newStatus] || newStatus}"`, {
        description: `De "${STATUS_LABELS[order.status]}" você pode ir para: ${(VALID_TRANSITIONS[order.status] || []).map(s => STATUS_LABELS[s] || s).join(', ') || 'nenhum'}.`,
      });
      return;
    }

    const wipLimit = wipLimits[newStatus];
    if (wipLimit && wipLimit > 0) {
      const currentCount = orders.filter(o => o.status === newStatus).length;
      if (currentCount >= wipLimit) {
        toast.warning(`Limite WIP atingido para "${STATUS_LABELS[newStatus]}"`, {
          description: `Máximo de ${wipLimit} OPs. Remova uma antes de adicionar.`,
        });
        return;
      }
    }

    const moved = await moveOrder(draggableId, newStatus);
    if (!moved) return;
    toast.success(`OP ${order.order_number} movida para ${STATUS_LABELS[newStatus]}`);
  }, [orders, moveOrder, wipLimits]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('pcp-priority', { body: { action: 'recalculate' } });
      if (error) throw error;
      toast.success(`Prioridades recalculadas: ${data.ordersUpdated} OPs atualizadas`);
      await refetch();
    } catch (e) {
      toast.error('Erro ao recalcular prioridades');
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  const handleWarMode = async () => {
    setWarModeLoading(true);
    try {
      const localResult = WarModeService.execute(orders, intelligence.materialNeeds, capacities);
      const { data, error } = await supabase.functions.invoke('pcp-priority', { body: { action: 'war_mode', confirm: false } });
      if (error || !data?.snapshot) throw error ?? new Error('Prévia do servidor sem versão');
      setWarModeResult({
        ...data,
        priorityChanges: (data.priorityChanges || []).map((change: { id: string; order_number: string; oldPriority: string; newPriority: string; score: number; factors: string[] }) => ({
          ...change, opId: change.id, opNumber: change.order_number,
        })),
        kanbanReorg: localResult.kanbanReorg,
        criticalAlerts: localResult.criticalAlerts,
        summary: `${data.summary}. Movimentações do Kanban são apenas sugestões.`,
      });
      setWarModeOpen(true);
    } catch (e) {
      toast.error('Erro ao executar Modo Guerra');
      console.error(e);
    } finally {
      setWarModeLoading(false);
    }
  };

  const handleConfirmWarMode = async () => {
    const expectedSnapshot = warModeResult?.snapshot;
    if (!expectedSnapshot) { toast.error('Prévia sem versão. Simule novamente.'); return; }
    setWarModeLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pcp-priority', { body: { action: 'war_mode', confirm: true, expectedSnapshot } });
      if (error) throw error;
      toast.success(`Modo Guerra aplicado: ${data.priorityChanges?.length || 0} OPs repriorizadas`);
      setWarModeOpen(false);
      setWarModeResult(null);
      await refetch();
    } catch {
      toast.error('Falha ou prévia desatualizada. Confira as OPs e simule novamente; aplicação parcial ainda é possível.');
    } finally {
      setWarModeLoading(false);
    }
  };

  const handleOptimizeSequence = async () => {
    setSequenceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pcp-schedule', { body: { action: 'suggest' } });
      if (error) throw error;
      setSequenceResult(data);
      setSequenceOpen(true);
    } catch (e) {
      toast.error('Erro ao otimizar sequência');
      console.error(e);
    } finally {
      setSequenceLoading(false);
    }
  };

  const handleApplySequence = async () => {
    setApplyingSequence(true);
    try {
      const { data, error } = await supabase.functions.invoke('pcp-schedule', { body: { action: 'apply' } });
      if (error) throw error;
      toast.success(`Sequência aplicada: ${data.ordersUpdated} OPs atualizadas`);
      setSequenceOpen(false);
      setSequenceResult(null);
      await refetch();
    } catch {
      toast.error('Erro ao aplicar sequência');
    } finally {
      setApplyingSequence(false);
    }
  };

  const handleBottleneckAnalysis = async () => {
    setBottleneckLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pcp-bottlenecks');
      if (error) throw error;
      setBottleneckData(data as BottleneckAnalysis);
      setBottleneckOpen(true);
    } catch (e) {
      toast.error('Erro ao analisar gargalos');
      console.error(e);
    } finally {
      setBottleneckLoading(false);
    }
  };

  return {
    moveOrder, handleDragEnd,
    warModeOpen, setWarModeOpen, warModeResult, warModeLoading,
    sequenceOpen, setSequenceOpen, sequenceResult, sequenceLoading, applyingSequence,
    bottleneckOpen, setBottleneckOpen, bottleneckData, bottleneckLoading,
    recalculating,
    handleRecalculate, handleWarMode, handleConfirmWarMode,
    handleOptimizeSequence, handleApplySequence, handleBottleneckAnalysis,
  };
}
