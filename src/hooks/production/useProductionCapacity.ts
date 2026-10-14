import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionCapacityRow {
  id: string;
  sector: string;
  machine: string | null;
  operator_name: string | null;
  shift: string;
  capacity_per_hour: number;
  max_hours_per_day: number;
  current_load_pct: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export function useProductionCapacity() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [capacities, setCapacities] = useState<ProductionCapacityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!companyId) { setCapacities([]); setLoadedCompanyId(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('production_capacity').select('*').eq('company_id', companyId).order('sector');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar capacidade'); setCapacities([]); setLoadedCompanyId(null); }
    else { setCapacities(data || []); setLoadedCompanyId(companyId); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async (item: Partial<ProductionCapacityRow>) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return false; }
    const { error } = await supabase.from('production_capacity').insert({ ...item, company_id: companyId } as TablesInsert<'production_capacity'>);
    if (error) { toast.error('Erro ao criar capacidade'); return false; }
    toast.success('Capacidade cadastrada');
    await fetchData();
    return true;
  };

  const update = async (id: string, updates: Partial<ProductionCapacityRow>) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return; }
    const { data, error } = await supabase.from('production_capacity').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_capacity'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar'); return; }
    toast.success('Atualizado');
    await fetchData();
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return; }
    const { data, error } = await supabase.from('production_capacity').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir'); return; }
    toast.success('Excluído');
    await fetchData();
  };

  return { capacities: loadedCompanyId === companyId ? capacities : [], loading, refetch: fetchData, create, update, remove };
}
