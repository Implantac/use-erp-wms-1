import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { toast } from 'sonner';
import { cancelProductionSchedule, createClientIdempotencyKey, scheduleProductionOrder } from '@/services/production/textilePcpService';

export interface ProductionScheduleRow {
  id: string;
  company_id: string | null;
  production_order_id: string | null;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  sector: string | null;
  work_center: string | null;
  resource_id?: string | null;
  machine_id?: string | null;
  shift: string | null;
  priority: number | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type NewSchedule = {
  production_order_id: string;
  planned_start: string;
  planned_end: string;
  sector?: string;
  work_center?: string;
  resource_id?: string | null;
  machine_id?: string | null;
  shift?: string;
};

export function useProductionSchedule() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ProductionScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) { setSchedules([]); setLoadedCompanyId(null); setLoadError(false); setLoading(false); return false; }
    setLoading(true);
    const { data, error } = await supabase.from('production_schedule').select('*')
      .eq('company_id', companyId).order('planned_start', { ascending: true });
    if (companyIdRef.current !== companyId) return false;
    if (error) {
      console.error(error); toast.error('Erro ao carregar agendamento');
      setSchedules([]); setLoadedCompanyId(null); setLoadError(true); setLoading(false); return false;
    }
    setSchedules(data || []); setLoadedCompanyId(companyId); setLoadError(false); setLoading(false);
    return true;
  }, [companyId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const create = async (schedule: NewSchedule) => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Carregue a programação da empresa ativa'); return false; }
    const start = new Date(schedule.planned_start).getTime();
    const end = new Date(schedule.planned_end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !schedule.production_order_id) {
      toast.error('Informe OP e intervalo planejado válido'); return false;
    }
    try {
      await scheduleProductionOrder({
        productionOrderId: schedule.production_order_id,
        plannedStart: new Date(start).toISOString(),
        plannedEnd: new Date(end).toISOString(),
        idempotencyKey: createClientIdempotencyKey('schedule'),
        resourceId: schedule.resource_id ?? null,
        machineId: schedule.machine_id ?? null,
        workCenter: schedule.work_center?.trim() || null,
        sector: schedule.sector?.trim() || null,
        shift: schedule.shift || 'diurno',
      });
    } catch (error) {
      if (companyIdRef.current !== companyId) return false;
      toast.error(error instanceof Error ? error.message : 'Erro ao criar agendamento finito');
      return false;
    }
    if (companyIdRef.current !== companyId) return false;
    toast.success('Capacidade reservada na janela: recurso bloqueado contra dupla alocação; isto não conclui a OP');
    await fetchData();
    return true;
  };

  const update = async (id: string, action: 'start' | 'end') => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Carregue a programação da empresa ativa'); return false; }
    const current = schedules.find(s => s.id === id);
    if (!current?.updated_at || current.company_id !== companyId) { toast.error('Agendamento indisponível'); return false; }
    if (action === 'start' && (current.actual_start || current.status !== 'scheduled')) return false;
    if (action === 'end' && (!current.actual_start || current.actual_end || current.status !== 'in_progress')) return false;
    const now = new Date().toISOString();
    const changes: TablesUpdate<'production_schedule'> = action === 'start'
      ? { actual_start: now, status: 'in_progress', updated_at: now }
      : { actual_end: now, status: 'completed', updated_at: now };
    const { data, error } = await supabase.from('production_schedule').update(changes)
      .eq('id', id).eq('company_id', companyId).eq('status', current.status)
      .eq('updated_at', current.updated_at).select('id');
    if (companyIdRef.current !== companyId) return false;
    if (error || !data?.length) { toast.error('Agendamento mudou; recarregue antes de tentar novamente'); await fetchData(); return false; }
    await fetchData();
    toast.info('Janela de programação atualizada; estado da OP não foi alterado');
    return true;
  };

  const cancel = async (id: string) => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Carregue a programação da empresa ativa'); return false; }
    try {
      await cancelProductionSchedule(id);
      toast.success('Janela cancelada e capacidade liberada');
      await fetchData();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao cancelar agendamento');
      return false;
    }
  };

  return { schedules: loadedCompanyId === companyId ? schedules : [], loading, loadError, hasCompany: !!companyId,
    refetch: fetchData, create, update, cancel };
}
