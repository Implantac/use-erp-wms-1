import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface TimeEntryRow {
  id: string;
  production_order_id: string | null;
  order_number: string;
  operation_id: string | null;
  operation_name: string;
  operator: string;
  start_time: string;
  end_time: string | null;
  paused_time: number;
  produced_quantity: number;
  rejected_quantity: number;
  status: string;
  notes: string | null;
  work_center: string | null;
  machine_id: string | null;
  machine_name: string | null;
  created_at: string;
}

export function useTimeEntries() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setEntries([]); setLoadedCompanyId(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('time_entries').select('*').eq('company_id', companyId).order('start_time', { ascending: false });
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar apontamentos'); setEntries([]); setLoadedCompanyId(null); }
    else { setEntries(data || []); setLoadedCompanyId(companyId); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: Partial<TimeEntryRow>) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return; }
    const { data, error } = await supabase.from('time_entries').update({ ...updates, company_id: companyId } as TablesUpdate<'time_entries'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar apontamento'); return; }
    await fetch();
  };

  type NewTimeEntry = Omit<TimeEntryRow, 'id' | 'created_at' | 'machine_id' | 'machine_name'> & {
  machine_id?: string | null;
  machine_name?: string | null;
};

  const create = async (entry: NewTimeEntry) => {
    const company_id = companyId;
    if (!company_id) { toast.error('Empresa não selecionada'); return; }
    const { error } = await supabase.from('time_entries').insert({ ...entry, company_id } as TablesInsert<'time_entries'>);
    if (error) { toast.error('Erro ao criar apontamento'); return; }
    toast.success('Apontamento criado');
    await fetch();
  };

  return { entries: loadedCompanyId === companyId ? entries : [], loading, refetch: fetch, update, create };
}
