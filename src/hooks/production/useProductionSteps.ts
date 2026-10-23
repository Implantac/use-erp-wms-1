import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionStep {
  id: string;
  name: string;
  code: string;
  description: string | null;
  sequence: number;
  estimated_time_minutes: number;
  sector: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductionOrderStep {
  id: string;
  production_order_id: string;
  step_id: string;
  sequence: number;
  responsible: string | null;
  estimated_time_minutes: number;
  realized_time_minutes: number;
  status: string;
  quantity_produced: number;
  quantity_pending: number;
  quantity_rejected: number;
  defect_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  step_name?: string;
  step_code?: string;
  step_sector?: string;
}

export function useProductionSteps() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSteps = useCallback(async () => {
    if (!companyId) { setSteps([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('production_steps')
      .select('*')
      .eq('company_id', companyId)
      .order('sequence', { ascending: true });
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar etapas'); }
    else setSteps(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const createStep = async (step: Partial<ProductionStep>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar a operação'); return false; }
    const { error } = await supabase.from('production_steps').insert({ ...step, company_id: companyId } as TablesInsert<'production_steps'>);
    if (error) { toast.error('Erro ao criar etapa'); return false; }
    toast.success('Etapa criada');
    await fetchSteps();
    return true;
  };

  const updateStep = async (id: string, updates: Partial<ProductionStep>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar a operação'); return; }
    const { data, error } = await supabase.from('production_steps').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_steps'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar etapa'); return; }
    toast.success('Etapa atualizada');
    await fetchSteps();
  };

  const deleteStep = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir a operação'); return; }
    const { data, error } = await supabase.from('production_steps').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir etapa'); return; }
    toast.success('Etapa excluída');
    await fetchSteps();
  };

  return { steps, loading, refetch: fetchSteps, createStep, updateStep, deleteStep };
}

export function useProductionOrderSteps(productionOrderId?: string) {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const [orderSteps, setOrderSteps] = useState<ProductionOrderStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrderSteps = useCallback(async () => {
    if (!productionOrderId) { setOrderSteps([]); setLoading(false); return; }
    setLoading(true);
    // Sem FK entre production_order_steps.step_id e production_steps → merge manual.
    let orderStepQuery = supabase
      .from('production_order_steps')
      .select('*')
      .eq('production_order_id', productionOrderId);
    if (companyId) orderStepQuery = orderStepQuery.eq('company_id', companyId);
    const { data, error } = await orderStepQuery.order('sequence', { ascending: true });
    if (error) { console.error(error); toast.error('Erro ao carregar etapas da OP'); setLoading(false); return; }

    const stepIds = Array.from(new Set((data || []).map((d) => d.step_id as string).filter(Boolean))) as string[];
    const stepsMap = new Map<string, { id: string; name: string; code: string; sector: string | null }>();
    if (stepIds.length > 0) {
      let stepQuery = supabase
        .from('production_steps')
        .select('id, name, code, sector')
        .in('id', stepIds);
      if (companyId) stepQuery = stepQuery.eq('company_id', companyId);
      const { data: steps } = await stepQuery;
      (steps || []).forEach((s) => stepsMap.set(s.id, s));
    }
    setOrderSteps((data || []).map((d) => {
      const s = stepsMap.get(d.step_id);
      return { ...d, step_name: s?.name, step_code: s?.code, step_sector: s?.sector ?? undefined } as ProductionOrderStep;
    }));
    setLoading(false);
  }, [productionOrderId, companyId]);

  useEffect(() => { fetchOrderSteps(); }, [fetchOrderSteps]);

  const updateOrderStep = async (_id: string, _updates: Partial<ProductionOrderStep>) => {
    toast.error('Apontamento direto de etapa desativado; use a RPC sequencial de progresso do PCP');
    return false;
  };

  const generateStepsForOrder = async (orderId: string, quantity: number, selectedStepIds: string[]): Promise<boolean> => {
    if (!companyId) { toast.error('Selecione a empresa antes de gerar etapas'); return false; }
    const { count: existingCount, error: existingError } = await supabase
      .from('production_order_steps')
      .select('id', { count: 'exact', head: true })
      .eq('production_order_id', orderId)
      .eq('company_id', companyId);
    if (existingError) { toast.error('Erro ao verificar etapas existentes da OP'); return false; }
    if ((existingCount ?? 0) > 0) {
      toast.error('Esta OP já possui etapas geradas; gere apenas para OP sem etapas para não duplicar o acompanhamento.');
      return false;
    }
    const { data: stepsData } = await supabase
      .from('production_steps')
      .select('*')
      .eq('company_id', companyId)
      .in('id', selectedStepIds)
      .order('sequence');

    if (!stepsData || stepsData.length === 0) return false;

    const inserts = stepsData.map((s) => ({
      company_id: companyId,
      production_order_id: orderId,
      step_id: s.id,
      sequence: s.sequence,
      estimated_time_minutes: s.estimated_time_minutes,
      quantity_pending: quantity,
      status: 'pending',
    }));

    const { error } = await supabase.from('production_order_steps').insert(inserts as unknown as TablesInsert<'production_order_steps'>[]);
    if (error) { toast.error('Erro ao gerar etapas'); return false; }
    toast.success(`${inserts.length} etapas geradas`);
    await fetchOrderSteps();
    return true;
  };

  return { orderSteps, loading, refetch: fetchOrderSteps, updateOrderStep, generateStepsForOrder };
}
