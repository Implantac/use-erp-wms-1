import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface ProductCost {
  id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  raw_material_cost: number;
  labor_cost: number;
  production_time_minutes: number;
  labor_rate_per_hour: number;
  operational_cost: number;
  total_cost: number;
  sale_price: number;
  profit_margin: number;
  profit_value: number;
  last_calculated_at: string;
  notes: string | null;
  created_at: string;
}

export function useProductCosts() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    if (!companyId) { setCosts([]); setLoadedCompanyId(null); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('product_costs').select('*').eq('company_id', companyId).order('product_name');
    if (companyIdRef.current !== companyId) return;
    if (error) { console.error(error); toast.error('Erro ao carregar custos'); setCosts([]); setLoadedCompanyId(null); }
    else { setCosts(data || []); setLoadedCompanyId(companyId); }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  const calculateCost = (raw: number, laborRate: number, timeMin: number, operational: number, salePrice: number) => {
    const laborCost = (laborRate / 60) * timeMin;
    const totalCost = raw + laborCost + operational;
    const profitValue = salePrice - totalCost;
    const profitMargin = salePrice > 0 ? (profitValue / salePrice) * 100 : 0;
    return { labor_cost: laborCost, total_cost: totalCost, profit_value: profitValue, profit_margin: profitMargin };
  };

  const createCost = async (cost: Partial<ProductCost>) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return false; }
    const calc = calculateCost(
      cost.raw_material_cost || 0,
      cost.labor_rate_per_hour || 0,
      cost.production_time_minutes || 0,
      cost.operational_cost || 0,
      cost.sale_price || 0,
    );
    const { error } = await supabase.from('product_costs').insert({
      ...cost, ...calc, company_id: companyId, last_calculated_at: new Date().toISOString(),
    } as TablesInsert<'product_costs'>);
    if (error) { toast.error('Erro ao criar custo'); return false; }
    toast.success('Custo cadastrado');
    await fetchCosts();
    return true;
  };

  const updateCost = async (id: string, updates: Partial<ProductCost>) => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Selecione uma empresa com custos carregados'); return; }
    const existing = costs.find(c => c.id === id);
    if (!existing) { toast.error('Custo não encontrado na empresa ativa'); return; }
    const merged = { ...existing, ...updates };
    const calc = calculateCost(
      merged.raw_material_cost || 0,
      merged.labor_rate_per_hour || 0,
      merged.production_time_minutes || 0,
      merged.operational_cost || 0,
      merged.sale_price || 0,
    );
    const { data, error } = await supabase.from('product_costs').update({
      ...updates, ...calc, company_id: companyId, last_calculated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    } as TablesUpdate<'product_costs'>).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar custo'); return; }
    toast.success('Custo atualizado');
    await fetchCosts();
  };

  const deleteCost = async (id: string) => {
    if (!companyId) { toast.error('Selecione uma empresa'); return; }
    const { data, error } = await supabase.from('product_costs').delete().eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao excluir custo'); return; }
    toast.success('Custo excluído');
    await fetchCosts();
  };

  // Unit catalog references only; no realized revenue or total cost.
  const scopedCosts = loadedCompanyId === companyId ? costs : [];
  const avgMargin = scopedCosts.length > 0 ? scopedCosts.reduce((s, c) => s + c.profit_margin, 0) / scopedCosts.length : 0;
  const lowMarginProducts = scopedCosts.filter(c => c.profit_margin < 15);
  const highCostProducts = scopedCosts.filter(c => c.total_cost > c.sale_price * 0.8);

  return {
    costs: scopedCosts, loading, refetch: fetchCosts, createCost, updateCost, deleteCost, calculateCost,
    avgMargin, lowMarginProducts, highCostProducts,
  };
}
