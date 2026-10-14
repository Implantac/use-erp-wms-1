import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionSector {
  id: string;
  code: string;
  name: string;
  responsible: string | null;
  sector_type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useProductionSectors() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [sectors, setSectors] = useState<ProductionSector[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setSectors([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('production_sectors').select('*').eq('company_id', companyId).order('code');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar setores'); }
    else setSectors(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: Partial<ProductionSector>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar setor'); return false; }
    const { error } = await supabase.from('production_sectors').insert({ ...item, company_id: companyId } as TablesInsert<'production_sectors'>);
    if (error) { toast.error('Erro ao criar setor'); return false; }
    toast.success('Setor cadastrado');
    await fetch();
    return true;
  };

  const update = async (id: string, updates: Partial<ProductionSector>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar setor'); return false; }
    const { data, error } = await supabase.from('production_sectors').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_sectors'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar setor'); return false; }
    toast.success('Setor atualizado');
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir setor'); return; }
    const { data, error } = await supabase.from('production_sectors').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir setor'); return; }
    toast.success('Setor excluído');
    await fetch();
  };

  const activeSectors = sectors.filter(s => s.is_active);

  return { sectors, activeSectors, loading, refetch: fetch, create, update, remove };
}
