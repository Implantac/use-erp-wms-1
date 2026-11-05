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
  /** null = nao ha fonte consultada; nunca usar 0 como "sem dados". */
  openCashiers: number | null;
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

export interface StoreHealthFactor {
  label: string;
  /** null = fator sem base calculavel; a tela deve exibir "sem dados". */
  score: number | null;
}

export interface StoreHealth {
  /** null = nao ha base suficiente; nunca fabricar um score. */
  score: number | null;
  status: 'excellent' | 'attention' | 'critical' | 'unavailable';
  factors: StoreHealthFactor[];
  /** Ranking so existe quando houver criterio comparavel entre unidades. */
  networkPosition: string | null;
  unavailableReason?: string;
}

interface TaskRow {
  id?: string;
  status?: string;
  category?: string;
  priority?: string;
  title?: string;
  description?: string;
  metadata?: unknown;
}
interface TransferRow { id?: string }
interface PolicyRow { product_id?: string; min_stock?: unknown }
interface StockRow {
  product_id?: string;
  quantity?: unknown;
  products?: { cost_price?: unknown } | null;
}
interface SaleRow { total?: unknown }

interface QueryResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

/**
 * Leitura que falha fechado: erro de consulta/RLS nunca pode ser interpretado
 * como "sem dados" nem convertido em zero pelo chamador.
 */
async function unwrap<T>(query: PromiseLike<QueryResult<T>>): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Falha na consulta de dados da loja');
  }
  return data;
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const storeService = {
  async getStoreKPIs(branchId: string): Promise<StoreKPIs> {
    const tasks = await unwrap<TaskRow[]>(
      (supabase as any)
        .from('operational_tasks')
        .select('status, category')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
    );

    const ruptures = tasks?.filter((t) => t.category === 'rupture').length || 0;
    const transfers = tasks?.filter((t) => t.category === 'transfer').length || 0;
    const receiving = tasks?.filter((t) => t.category === 'receiving').length || 0;

    const inTransitMovements = await unwrap<TransferRow[]>(
      (supabase as any)
        .from('stock_transfer_orders')
        .select('id')
        .eq('destination_unit_id', branchId)
        .eq('current_status', 'EM TRÂNSITO')
    );
    const inTransit = inTransitMovements?.length || 0;

    const policies = await unwrap<PolicyRow[]>(
      (supabase as any)
        .from('replenishment_policies')
        .select('min_stock, product_id')
        .eq('branch_id', branchId)
    );

    const stockBalances = await unwrap<StockRow[]>(
      (supabase as any)
        .from('stock_balances')
        .select('quantity, product_id, products(cost_price)')
        .eq('branch_id', branchId)
    );

    const stockValue = stockBalances?.reduce((acc: number, item: StockRow) => {
      const price = finiteNumber(item.products?.cost_price) ?? 0;
      const qty = finiteNumber(item.quantity) ?? 0;
      return acc + qty * price;
    }, 0) || 0;

    const itemsPendingList = stockBalances?.filter((s: StockRow) => {
      const policy = policies?.find((p) => p.product_id === s.product_id);
      const min = finiteNumber(policy?.min_stock);
      const qty = finiteNumber(s.quantity);
      return min !== null && qty !== null && qty < min;
    }) || [];

    const unitsPending = itemsPendingList.reduce((acc: number, s: StockRow) => {
      const policy = policies?.find((p) => p.product_id === s.product_id);
      const min = finiteNumber(policy?.min_stock) ?? 0;
      const qty = finiteNumber(s.quantity) ?? 0;
      return acc + Math.max(0, min - qty);
    }, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sales = await unwrap<SaleRow[]>(
      (supabase as any)
        .from('orders')
        .select('total')
        .eq('branch_id', branchId)
        .gte('created_at', today.toISOString())
        .not('status', 'eq', 'cancelled')
    );

    const totalSales = sales?.reduce((acc: number, order: SaleRow) => acc + (finiteNumber(order.total) ?? 0), 0) || 0;
    const ticketAverage = sales?.length ? totalSales / sales.length : 0;

    return {
      sales: totalSales,
      ticketAverage,
      stockValue,
      ruptures,
      transfers,
      receiving,
      inTransit,
      itemsPending: itemsPendingList.length,
      unitsPending,
      // Nao existe consulta de caixas abertos neste servico. Exibir "sem dados".
      openCashiers: null
    };
  },

  async getOperationalAlerts(branchId: string): Promise<OperationalAlert[]> {
    const { data: tasks, error } = await (supabase as any)
      .from('operational_tasks')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .order('priority', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Falha ao consultar alertas operacionais');
    }

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
    switch (category) {
      case 'rupture': return '/estoque/rupturas';
      case 'receiving': return '/logistica/recebimento';
      case 'transfer': return '/logistica/transferencias';
      case 'cashier': return '/financeiro/caixa';
      case 'inventory': return '/estoque/inventario';
      default: return '/operacional/loja/central';
    }
  },

  /**
   * Score declarado: confiabilidade de estoque medida MENOS 5 pontos por
   * tarefa critica/alta pendente, limitado a 0..100. So e calculado quando
   * existe base de inventario ciclico; sem base, retorna "indisponivel".
   * Nao ha ranking: a ordem das unidades em uma lista nao e desempenho.
   */
  async getStoreHealth(branchId: string): Promise<StoreHealth> {
    const reliability = await this.getStockReliability(branchId);

    const { count: pendingCritical, error: countError } = await (supabase as any)
      .from('operational_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'pending')
      .in('priority', ['critical', 'high']);

    if (countError) {
      throw new Error(countError.message || 'Falha ao contar excecoes criticas');
    }

    const exceptions = pendingCritical ?? 0;
    const exceptionScore = Math.max(0, 100 - exceptions * 2);
    const factors: StoreHealthFactor[] = [
      { label: 'Confiabilidade de Estoque', score: reliability },
      { label: 'Gestão de Exceções', score: exceptionScore }
    ];

    if (reliability === null) {
      return {
        score: null,
        status: 'unavailable',
        factors,
        networkPosition: null,
        unavailableReason: 'Sem inventário cíclico registrado para calcular a confiabilidade de estoque.'
      };
    }

    const score = Math.round(Math.min(100, Math.max(0, reliability - exceptions * 5)));

    return {
      score,
      status: score > 90 ? 'excellent' : score > 70 ? 'attention' : 'critical',
      factors,
      networkPosition: null
    };
  },

  /**
   * null = sem base (nenhuma divergencia, esperado zerado ou dados invalidos).
   * Erro de consulta/RLS propaga: nao pode virar 99,2 nem 100.
   */
  async getStockReliability(branchId: string): Promise<number | null> {
    const { data: discrepancies, error } = await (supabase as any)
      .from('operational_discrepancies')
      .select('expected_qty, actual_qty')
      .eq('branch_id', branchId)
      .limit(100);

    if (error) {
      throw new Error(error.message || 'Falha ao consultar divergencias de inventario');
    }
    if (!discrepancies || discrepancies.length === 0) return null;

    let totalExpected = 0;
    let totalActual = 0;
    let validRows = 0;
    for (const d of discrepancies as any[]) {
      const expected = finiteNumber(d.expected_qty);
      const actual = finiteNumber(d.actual_qty);
      if (expected === null || actual === null) continue;
      totalExpected += expected;
      totalActual += actual;
      validRows += 1;
    }
    if (validRows === 0 || totalExpected <= 0) return null;

    const accuracy = (1 - Math.abs(totalExpected - totalActual) / totalExpected) * 100;
    return Math.min(100, Math.max(0, accuracy));
  },

  /** Perda oficial: RPC que lança a baixa no ledger com motivo (servidor). */
  async registerLoss(data: {
    branch_id: string;
    product_id: string;
    quantity: number;
    reason: string;
    notes?: string;
  }) {
    const { data: result, error } = await (supabase as any).rpc('register_stock_loss', {
      p_product_id: data.product_id,
      p_branch_id: data.branch_id,
      p_quantity: data.quantity,
      p_reason: data.reason,
      p_notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return result as { product_id: string; quantity: number; type: string };
  },

  async getCompanyId(branchId: string): Promise<string> {
    const { data, error } = await (supabase as any)
      .from('branches')
      .select('company_id')
      .eq('id', branchId)
      .single();

    if (error) {
      throw new Error(error.message || 'Falha ao identificar a empresa da unidade');
    }
    return data?.company_id || '';
  }
};
