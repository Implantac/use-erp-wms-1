import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionMachine {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: string;
  sector: string | null;
  status: string;
  capacity_per_hour: number | null;
  current_operator: string | null;
  current_order_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProductionMachines() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [machines, setMachines] = useState<ProductionMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchMachines = useCallback(async () => {
    if (!companyId) { setMachines([]); setLoadedCompanyId(null); setLoadError(false); setLoading(false); return false; }
    setLoading(true);
    const { data, error } = await supabase.from('production_machines').select('*').eq('company_id', companyId).order('code');
    if (companyIdRef.current !== companyId) return false;
    if (error) { console.error(error); toast.error('Erro ao carregar máquinas'); setMachines([]); setLoadedCompanyId(null); setLoadError(true); setLoading(false); return false; }
    setMachines(data || []);
    setLoadedCompanyId(companyId);
    setLoadError(false);
    setLoading(false);
    return true;
  }, [companyId]);

  useEffect(() => { void fetchMachines(); }, [fetchMachines]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`production-machines-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_machines', filter: `company_id=eq.${companyId}` }, () => { void fetchMachines(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, fetchMachines]);

  const create = async (machine: Partial<ProductionMachine>) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return false; }
    const code = machine.code?.trim();
    const name = machine.name?.trim();
    const type = machine.type?.trim();
    if (!code || !name || !type) { toast.error('Informe código, nome e tipo do equipamento'); return false; }
    const { data, error } = await supabase.from('production_machines').insert({
      company_id: companyId, code, name, type, sector: machine.sector?.trim() || null,
      active: machine.active ?? true, status: 'available',
    } as TablesInsert<'production_machines'>).select('id');
    if (error || !data?.length) { toast.error('Erro ao cadastrar máquina'); return false; }
    toast.success('Equipamento cadastrado');
    await fetchMachines();
    return true;
  };

  const update = async (id: string, changes: Partial<ProductionMachine>) => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Carregue os equipamentos da empresa ativa'); return false; }
    const current = machines.find(m => m.id === id);
    if (!current?.updated_at) { toast.error('Equipamento não encontrado ou sem versão'); return false; }
    if (Object.keys(changes).some(key => !['code', 'name', 'type', 'sector', 'active'].includes(key))) {
      toast.error('Esta tela altera apenas o cadastro, não o estado operacional'); return false;
    }
    const code = changes.code?.trim() ?? current.code;
    const name = changes.name?.trim() ?? current.name;
    const type = changes.type?.trim() ?? current.type;
    if (!code || !name || !type) { toast.error('Informe código, nome e tipo do equipamento'); return false; }
    const { data, error } = await supabase.from('production_machines').update({
      code, name, type, sector: changes.sector !== undefined ? changes.sector?.trim() || null : current.sector,
      active: changes.active ?? current.active, updated_at: new Date().toISOString(),
    } as TablesUpdate<'production_machines'>).eq('id', id).eq('company_id', companyId)
      .eq('updated_at', current.updated_at).select('id');
    if (error || !data?.length) { toast.error('Equipamento mudou; recarregue antes de editar'); return false; }
    await fetchMachines();
    return true;
  };

  const scopedMachines = loadedCompanyId === companyId ? machines : [];
  const activeMachines = scopedMachines.filter(m => m.active);
  const runningMachines = scopedMachines.filter(m => m.status === 'running');
  const stoppedMachines = scopedMachines.filter(m => m.status === 'stopped' || m.status === 'maintenance');

  return { machines: scopedMachines, activeMachines, runningMachines, stoppedMachines, loading, loadError, refetch: fetchMachines, create, update };
}
