import { supabase } from '@/integrations/supabase/client';

export interface OperationalTask {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
  category: string;
  created_at: string;
  due_at?: string;
}

export const operationalService = {
  async getMyTasks(branchId: string): Promise<OperationalTask[]> {
    const { data, error } = await supabase
      .from('operational_tasks' as any)
      .select('*')
      .eq('branch_id', branchId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return (data || []) as any[];
  },

  async createTask(task: any) {
    const { data, error } = await supabase
      .from('operational_tasks' as any)
      .insert(task)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async resolveDiscrepancy(discrepancyId: string, resolution: { resolution_notes: string; status: string }) {
    const { data, error } = await supabase
      .from('operational_discrepancies' as any)
      .update({
        ...resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', discrepancyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getSmartInventorySuggestions(branchId: string) {
    // Real: política de reposição x saldo da unidade (sem valores fixos).
    const { getReplenishmentAlerts } = await import('./supplyService');
    const alerts = await getReplenishmentAlerts(branchId);
    return alerts.map((a) => ({
      productId: a.productId,
      productName: a.productName,
      productCode: a.productCode,
      reason: `Abaixo do mínimo (saldo ${a.currentQty} / mínimo ${a.minStock})`,
      expectedQty: a.suggestedQty,
    }));
  }
};


