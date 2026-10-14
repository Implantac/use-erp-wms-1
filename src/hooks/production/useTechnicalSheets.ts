import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface TechnicalSheetStep {
  name?: string;
  description?: string;
  work_center?: string;
  time_minutes?: number;
  [key: string]: unknown;
}

export interface TechnicalSheetMaterial {
  code?: string;
  componentCode?: string;
  material_code?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  [key: string]: unknown;
}

export interface TechnicalSheetRow {
  id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  steps: TechnicalSheetStep[];
  materials: TechnicalSheetMaterial[];
  total_time_minutes: number;
  standard_cost: number;
  version: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export function useTechnicalSheets() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [sheets, setSheets] = useState<TechnicalSheetRow[]>([]);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!companyId) { setSheets([]); setLoading(false); return false; }
    setLoading(true);
    const { data, error } = await supabase.from('product_technical_sheets').select('*').eq('company_id', companyId).order('product_name');
    if (companyIdRef.current !== companyId) return false;
    if (error) { console.error(error); toast.error('Erro ao carregar fichas técnicas'); setLoading(false); return false; }
    else { setSheets((data || []) as unknown as TechnicalSheetRow[]); setLoadedCompanyId(companyId); }
    setLoading(false);
    return true;
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async (item: Partial<TechnicalSheetRow>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar a ficha'); return false; }
    const { error } = await supabase.from('product_technical_sheets').insert({ ...item, company_id: companyId } as TablesInsert<'product_technical_sheets'>);
    if (error) { toast.error('Erro ao criar ficha técnica'); return false; }
    toast.success('Ficha técnica criada');
    await fetchData();
    return true;
  };

  const update = async (id: string, updates: Partial<TechnicalSheetRow>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar a ficha'); return; }
    const { data, error } = await supabase.from('product_technical_sheets').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() } as TablesUpdate<'product_technical_sheets'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar'); return; }
    toast.success('Ficha atualizada');
    await fetchData();
  };

  const remove = async (id: string) => {
    if (!companyId) { toast.error('Selecione a empresa para excluir a ficha'); return; }
    const { data, error } = await supabase.from('product_technical_sheets').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir'); return; }
    toast.success('Ficha excluída');
    await fetchData();
  };

  return { sheets: loadedCompanyId === companyId ? sheets : [], loading, refetch: fetchData, create, update, remove };
}
