import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { canChangeOPStatus } from '@/lib/pcp/orderTransitions';

export interface ProductionOrderRow {
  id: string;
  order_number: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  produced_quantity: number;
  unit: string;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  work_center: string | null;
  operator: string | null;
  notes: string | null;
  bom_id: string | null;
  route_id: string | null;
  created_at: string;
  updated_at: string;
  sales_order_id: string | null;
  order_item_id: string | null;
  estimated_time_minutes: number;
  realized_time_minutes: number;
  sector: string | null;
  client_name: string | null;
  client_id: string | null;
  rejected_quantity: number;
  defect_notes: string | null;
  delivery_type: string;
  partial_delivered_qty: number;
  color: string | null;
  size_grid: string | null;
  model_variant: string | null;
  released_at: string | null;
  batch_code: string | null;
  priority_score: number;
  sequence_order: number;
  work_center_id: string | null;
}

export function useProductionOrders() {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) { setOrders([]); setLoadedCompanyId(null); setLoading(false); return false; }
    setLoading(true);
    const { data, error } = await supabase.from('production_orders').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (companyIdRef.current !== companyId) return false;
    if (error) { console.error(error); toast.error('Erro ao carregar ordens de produção'); setOrders([]); setLoadedCompanyId(null); setLoading(false); return false; }
    setOrders((data || []) as ProductionOrderRow[]);
    setLoadedCompanyId(companyId);
    setLoading(false);
    return true;
  }, [companyId]);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: Partial<ProductionOrderRow>) => {
    if (!companyId || loadedCompanyId !== companyId) { toast.error('Carregue as OPs da empresa ativa antes de alterar'); return false; }
    const current = orders.find(o => o.id === id);
    if (!current?.updated_at) { toast.error('OP não carregada ou sem versão; atualize a lista'); return false; }
    if (!updates.status || !canChangeOPStatus(current.status, updates.status)) {
      toast.error('Transição de OP indisponível; conclusão exige qualidade e estoque transacionais');
      return false;
    }
    if (Object.keys(updates).some(key => key !== 'status' && key !== 'start_date')) {
      toast.error('Esta ação altera apenas estado e início da OP'); return false;
    }
    if (updates.start_date !== undefined &&
      (current.start_date || !['in_progress', 'outsourced'].includes(updates.status)
        || !Number.isFinite(new Date(updates.start_date ?? '').getTime()))) {
      toast.error('Data de início inválida para a transição'); return false;
    }
    const payload = { status: updates.status, ...(updates.start_date ? { start_date: updates.start_date } : {}),
      updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('production_orders').update(payload as TablesUpdate<'production_orders'>)
      .eq('id', id).eq('company_id', companyId).eq('status', current.status)
      .eq('updated_at', current.updated_at).select('id');
    if (error || !data?.length) { toast.error('OP mudou ou não pôde ser atualizada; recarregue antes de tentar novamente'); return false; }
    toast.success('Ordem atualizada');
    await fetch();
    return true;
  };

  return { orders: loadedCompanyId === companyId ? orders : [], loading, refetch: fetch, update };
}
