import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';

export interface SupplyItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  current_quantity: number;
  min_quantity: number;
  max_quantity: number;
  unit_cost: number;
  total_value: number;
  supplier: string | null;
  location: string | null;
  category: string | null;
  last_entry_date: string | null;
  last_exit_date: string | null;
  status: string;
  created_at: string;
}

export interface SupplyMovement {
  id: string;
  supply_id: string;
  supply_code: string;
  supply_name: string;
  type: string;
  direction: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  production_order_id: string | null;
  production_order_number: string | null;
  document_number: string | null;
  operator: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
}

export function useSupplyStock() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [loadedSuppliesCompanyId, setLoadedSuppliesCompanyId] = useState<string | null>(null);
  const [loadedMovementsCompanyId, setLoadedMovementsCompanyId] = useState<string | null>(null);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSupplies = useCallback(async () => {
    if (!companyId) { setSupplies([]); setLoading(false); return false; }
    setLoading(true);
    const { data, error } = await supabase.from('supply_stock').select('*').eq('company_id', companyId).order('name');
    if (companyIdRef.current !== companyId) return false;
    if (error) { console.error(error); toast.error('Erro ao carregar insumos'); setLoading(false); return false; }
    else { setSupplies((data || []) as SupplyItem[]); setLoadedSuppliesCompanyId(companyId); }
    setLoading(false);
    return true;
  }, [companyId]);

  const fetchMovements = useCallback(async () => {
    if (!companyId) { setMovements([]); return; }
    const { data, error } = await supabase.from('supply_movements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200);
    if (companyIdRef.current !== companyId) return;
    if (error) console.error(error);
    else { setMovements((data || []) as SupplyMovement[]); setLoadedMovementsCompanyId(companyId); }
  }, [companyId]);

  useEffect(() => { fetchSupplies(); fetchMovements(); }, [fetchSupplies, fetchMovements]);

  const createSupply = async (supply: Partial<SupplyItem>) => {
    if (!companyId) { toast.error('Selecione a empresa para cadastrar o insumo'); return false; }
    if (supply.current_quantity !== undefined && supply.current_quantity !== 0) {
      toast.error('Saldo inicial indisponível: registre a entrada transacional antes de usar o estoque.');
      return false;
    }
    // Explicitly override caller-supplied balance and valuation fields.
    const { error } = await supabase.from('supply_stock').insert({
      ...supply,
      company_id: companyId,
      code: supply.code!,
      name: supply.name!,
      unit: supply.unit!,
      current_quantity: 0,
      total_value: 0,
    });
    if (error) { toast.error('Erro ao criar insumo'); return false; }
    toast.success('Insumo cadastrado');
    await fetchSupplies();
    return true;
  };

  const updateSupply = async (id: string, updates: Partial<SupplyItem>) => {
    if (!companyId) { toast.error('Selecione a empresa para alterar o insumo'); return false; }
    if (updates.current_quantity !== undefined || updates.total_value !== undefined) {
      toast.error('Alteração direta de saldo indisponível; use movimentação transacional homologada.');
      return false;
    }
    const { data, error } = await supabase.from('supply_stock').update({ ...updates, company_id: companyId, updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', companyId).select('id');
    if (error || !data?.length) { toast.error('Erro ao atualizar insumo'); return; }
    await fetchSupplies();
  };

  // Do not split a movement and its balance update across browser requests.
  // Re-enable only through a tenant-scoped, authorized, idempotent database RPC.
  const registerMovement = async (_movement: Partial<SupplyMovement>): Promise<boolean> => {
    toast.error('Movimentação de insumos indisponível até haver operação transacional homologada.');
    return false;
  };

  const visibleSupplies = loadedSuppliesCompanyId === companyId ? supplies : [];
  const visibleMovements = loadedMovementsCompanyId === companyId ? movements : [];
  const lowStockItems = visibleSupplies.filter(s => s.current_quantity <= s.min_quantity && s.status === 'active');

  return { supplies: visibleSupplies, movements: visibleMovements, loading, refetch: fetchSupplies, createSupply, updateSupply, registerMovement, lowStockItems };
}
