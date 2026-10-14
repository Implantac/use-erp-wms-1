import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductionLine {
  id: string;
  code: string;
  name: string;
  sector_id: string | null;
  capacity_per_hour: number;
  shift: string;
  responsible: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  sector_name?: string;
}

export function useProductionLines() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setLines([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('production_lines')
      .select('*, production_sectors(name)')
      .eq('company_id', companyId)
      .order('code');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar linhas'); }
    else setLines((data || []).map((d: any) => ({ ...d, sector_name: d.production_sectors?.name })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (item: Partial<ProductionLine>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar linha'); return false; }
    const { error } = await supabase.from('production_lines').insert({ ...item, company_id: companyId } as TablesInsert<'production_lines'>);
    if (error) { toast.error('Erro ao criar linha'); return false; }
    toast.success('Linha cadastrada');
    await fetch();
    return true;
  };

  const update = async (id: string, updates: Partial<ProductionLine>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar linha'); return false; }
    const { data, error } = await supabase.from('production_lines').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'production_lines'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar linha'); return false; }
    toast.success('Linha atualizada');
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir linha'); return; }
    const { data, error } = await supabase.from('production_lines').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir linha'); return; }
    toast.success('Linha excluída');
    await fetch();
  };

  return { lines, loading, refetch: fetch, create, update, remove };
}
