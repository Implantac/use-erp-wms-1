import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

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
  const [sheets, setSheets] = useState<TechnicalSheetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('product_technical_sheets').select('*').order('product_name');
    if (error) { console.error(error); toast.error('Erro ao carregar fichas técnicas'); setLoading(false); return false; }
    else setSheets((data || []) as unknown as TechnicalSheetRow[]);
    setLoading(false);
    return true;
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const create = async (item: Partial<TechnicalSheetRow>) => {
    const { error } = await supabase.from('product_technical_sheets').insert(item as TablesInsert<'product_technical_sheets'>);
    if (error) { toast.error('Erro ao criar ficha técnica'); return false; }
    toast.success('Ficha técnica criada');
    await fetchData();
    return true;
  };

  const update = async (id: string, updates: Partial<TechnicalSheetRow>) => {
    const { error } = await supabase.from('product_technical_sheets').update({ ...updates, updated_at: new Date().toISOString() } as TablesUpdate<'product_technical_sheets'>).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    toast.success('Ficha atualizada');
    await fetchData();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('product_technical_sheets').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Ficha excluída');
    await fetchData();
  };

  return { sheets, loading, refetch: fetchData, create, update, remove };
}
