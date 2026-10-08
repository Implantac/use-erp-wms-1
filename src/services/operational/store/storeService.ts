import { supabase } from "@/integrations/supabase/client";

export interface StoreKPIs {
  sales: number;
  ticketAverage: number;
  stockValue: number;
  ruptures: number;
  transfers: number;
  receiving: number;
  inTransit: number;
  itemsPending: number;
  unitsPending: number;
  openCashiers: number;
}

export interface OperationalAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  category: 'rupture' | 'receiving' | 'transfer' | 'cashier' | 'replenishment';
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
}

export interface StoreHealth {
  score: number;
  status: 'excellent' | 'attention' | 'critical';
  factors: {
    label: string;
    score: number;
  }[];
  networkPosition?: string;
}

export const storeService = {
  async getStoreKPIs(branchId: string): Promise<StoreKPIs> {
    const { data: tasks } = await (supabase as any)
      .from('operational_tasks')
      .select('status, category')
      .eq('branch_id', branchId)
      .eq('status', 'pending');

    const ruptures = tasks?.filter((t: any) => t.category === 'rupture').length || 0;
    const transfers = tasks?.filter((t: any) => t.category === 'transfer').length || 0;
    const receiving = tasks?.filter((t: any) => t.category === 'receiving').length || 0;

    // Real values for In Transit and Pending suggestions
    const { data: inTransitMovements } = await (supabase as any)
      .from('stock_transfer_orders')
      .select('id')
      .eq('destination_unit_id', branchId)
      .eq('status', 'IN_TRANSIT');
    
    const inTransit = inTransitMovements?.length || 0;

    const { data: policies } = await (supabase as any)
      .from('replenishment_policies')
      .select('min_stock, product_id')
      .eq('branch_id', branchId);

    const { data: stockBalances } = await (supabase as any)
      .from('stock_balances')
      .select('quantity, product_id, products(cost_price)')
      .eq('branch_id', branchId);

    const stockValue = stockBalances?.reduce((acc: number, item: any) => {
      const price = item.products?.cost_price || 0;
      return acc + (item.quantity * price);
    }, 0) || 0;

    // Calculate items with high rupture risk (below min_stock)
    const itemsPendingList = stockBalances?.filter((s: any) => {
      const policy = policies?.find((p: any) => p.product_id === s.product_id);
      return policy && s.quantity < policy.min_stock;
    }) || [];

    const itemsPending = itemsPendingList.length;
    const unitsPending = itemsPendingList.reduce((acc: number, s: any) => {
      const policy = policies?.find((p: any) => p.product_id === s.product_id);
      return acc + (policy.min_stock - s.quantity);
    }, 0);

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const { data: sales } = await (supabase as any)
      .from('orders')
      .select('total_amount')
      .eq('branch_id', branchId)
      .gte('created_at', today.toISOString())
      .not('status', 'eq', 'cancelled');

    const totalSales = sales?.reduce((acc: number, order: any) => acc + Number(order.total_amount), 0) || 0;
    const ticketAverage = sales?.length ? totalSales / sales.length : 0;

    return {
      sales: totalSales,
      ticketAverage: ticketAverage,
      stockValue: stockValue,
      ruptures,
      transfers,
      receiving,
      inTransit,
      itemsPending,
      unitsPending,
      openCashiers: 0
    };
  },

  async getOperationalAlerts(branchId: string): Promise<OperationalAlert[]> {
    const { data: tasks, error } = await (supabase as any)
      .from('operational_tasks')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .order('priority', { ascending: false });

    if (error) return [];

    return (tasks || []).map((task: any) => ({
      id: task.id,
      type: task.priority === 'critical' || task.priority === 'high' ? 'critical' : 'warning',
      category: task.category as any,
      title: task.title,
      description: task.description || '',
      actionLabel: 'Tratar',
      actionPath: this.getActionPath(task.category),
      metadata: task.metadata
    }));
  },

  getActionPath(category: string): string {
    switch(category) {
      case 'rupture': return '/estoque/rupturas';
      case 'receiving': return '/logistica/recebimento';
      case 'transfer': return '/logistica/transferencias';
      case 'cashier': return '/financeiro/caixa';
      case 'inventory': return '/estoque/inventario';
      default: return '/operacional/loja/central';
    }
  },

  async getStoreHealth(branchId: string): Promise<StoreHealth> {
    const reliability = await this.getStockReliability(branchId);
    
    const { count: pendingCritical } = await (supabase as any)
      .from('operational_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .in('priority', ['critical', 'high']);

    const score = Math.max(0, 100 - (pendingCritical || 0) * 5 - (100 - reliability));

    const { data: networkPosition } = await (supabase as any)
      .from('branches')
      .select('id')
      .eq('company_id', await this.getCompanyId(branchId));

    const branchIndex = networkPosition?.findIndex((b: any) => b.id === branchId) ?? 0;
    const totalBranches = networkPosition?.length || 1;

    return {
      score: Math.round(score),
      status: score > 90 ? 'excellent' : score > 70 ? 'attention' : 'critical',
      factors: [
        { label: 'Confiabilidade de Estoque', score: Math.round(reliability) },
        { label: 'Gestão de Exceções', score: Math.round(100 - (pendingCritical || 0) * 2) },
        { label: 'Rede Operacional', score: Math.round(((totalBranches - branchIndex) / totalBranches) * 100) },
        { label: 'Ranking Eficiência', score: Math.round(reliability * 0.9) }
      ],
      networkPosition: `${branchIndex + 1} / ${totalBranches}`
    };
  },

  async getStockReliability(branchId: string): Promise<number> {
    const { data: discrepancies } = await (supabase as any)
      .from('operational_discrepancies')
      .select('expected_qty, actual_qty')
      .eq('branch_id', branchId)
      .limit(100);

    if (!discrepancies || discrepancies.length === 0) return 99.2;

    const totalExpected = discrepancies.reduce((acc: number, d: any) => acc + Number(d.expected_qty), 0);
    const totalActual = discrepancies.reduce((acc: number, d: any) => acc + Number(d.actual_qty), 0);
    
    if (totalExpected === 0) return 100;
    
    const accuracy = (1 - Math.abs(totalExpected - totalActual) / totalExpected) * 100;
    return Math.min(100, Math.max(0, accuracy));
  },

  async registerLoss(_data: {
    branch_id: string;
    product_id: string;
    quantity: number;
    reason: string;
    notes?: string;
  }): Promise<never> {
    throw new Error('Registro de perda indisponível: ledger e saldo exigem transação e autorização no servidor.');
  },

  async getCompanyId(branchId: string): Promise<string> {
    const { data } = await (supabase as any)
      .from('branches')
      .select('company_id')
      .eq('id', branchId)
      .single();
    return data?.company_id || '';
  }
};

