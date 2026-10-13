import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';

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
  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('production_orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); toast.error('Erro ao carregar ordens de produção'); setLoading(false); return false; }
    else setOrders((data || []) as ProductionOrderRow[]);
    setLoading(false);
    return true;
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: Partial<ProductionOrderRow>) => {
    if (updates.status === 'completed') { toast.error('Conclusão de OP indisponível até validação transacional de qualidade e estoque'); return false; }
    const { error } = await supabase.from('production_orders').update({ ...updates, updated_at: new Date().toISOString() } as TablesUpdate<'production_orders'>).eq('id', id);
    if (error) { toast.error('Erro ao atualizar ordem'); return false; }
    toast.success('Ordem atualizada');
    await fetch();
    return true;
  };

  return { orders, loading, refetch: fetch, update };
}
