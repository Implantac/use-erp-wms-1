import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionResource {
  id: string;
  code: string;
  name: string;
  resource_type: string;
  sector_id: string | null;
  line_id: string | null;
  capacity_per_hour: number;
  cost_per_hour: number;
  status: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sector_name?: string;
  line_name?: string;
}

export function useProductionResources() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [resources, setResources] = useState<ProductionResource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setResources([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('production_resources')
      .select('*, production_sectors(name), production_lines(name)')
      .eq('company_id', companyId)
      .order('code');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar recursos'); }
    else setResources((data || []).map((d: any) => ({
      ...d,
      sector_name: d.production_sectors?.name,
      line_name: d.production_lines?.name,
    })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: Partial<ProductionResource>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar recurso'); return false; }
    const { error } = await supabase.from('production_resources').insert({ ...item, company_id: companyId } as TablesInsert<'production_resources'>);
    if (error) { toast.error('Erro ao criar recurso'); return false; }
    toast.success('Recurso cadastrado');
    await fetch();
    return true;
  };

  const update = async (id: string, updates: Partial<ProductionResource>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar recurso'); return false; }
    const { data, error } = await supabase.from('production_resources').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_resources'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar recurso'); return false; }
    toast.success('Recurso atualizado');
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir recurso'); return; }
    const { data, error } = await supabase.from('production_resources').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir recurso'); return; }
    toast.success('Recurso excluído');
    await fetch();
  };

  return { resources, loading, refetch: fetch, create, update, remove };
}
