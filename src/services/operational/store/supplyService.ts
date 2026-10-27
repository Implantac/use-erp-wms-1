import { supabase } from '@/integrations/supabase/client';

// Alertas de reposição REAIS: política (mínimo/máximo) × saldo da unidade.
// Nada de valores fixos: tudo vem de replenishment_policies e stock_balances.

export interface ReplenishmentAlert {
  productId: string;
  productCode: string;
  productName: string;
  imageUrl: string | null;
  currentQty: number;
  minStock: number;
  maxStock: number;
  suggestedQty: number;
}

export async function getReplenishmentAlerts(branchId: string): Promise<ReplenishmentAlert[]> {
  const { data: policies, error } = await (supabase as any)
    .from('replenishment_policies')
    .select('product_id, min_stock, max_stock, product:products(name, code, image_url)')
    .eq('branch_id', branchId)
    .eq('is_active', true);
  if (error) throw error;

  const { data: balances, error: balError } = await (supabase as any)
    .from('stock_balances')
    .select('product_id, quantity, reserved_qty')
    .eq('branch_id', branchId);
  if (balError) throw balError;

  const saldo = new Map<string, number>();
  for (const b of balances || []) {
    saldo.set(b.product_id, (saldo.get(b.product_id) || 0) + Number(b.quantity || 0) - Number(b.reserved_qty || 0));
  }

  const alerts: ReplenishmentAlert[] = [];
  for (const p of policies || []) {
    const current = saldo.get(p.product_id) || 0;
    const min = Number(p.min_stock || 0);
    const max = Number(p.max_stock || 0);
    if (current < min) {
      alerts.push({
        productId: p.product_id,
        productCode: p.product?.code || '',
        productName: p.product?.name || '',
        imageUrl: p.product?.image_url || null,
        currentQty: current,
        minStock: min,
        maxStock: max,
        suggestedQty: Math.max(max - current, min - current),
      });
    }
  }
  return alerts.sort((a, b) => a.currentQty - b.currentQty);
}

export interface SupplyRequest {
  id: string;
  company_id: string;
  requester_branch_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  status: 'PENDENTE' | 'ATENDIDA' | 'REJEITADA' | 'CANCELADA';
  decided_source_kind: 'LOJA' | 'CD' | 'FABRICA' | null;
  decided_source_branch_id: string | null;
  transfer_order_id: string | null;
  intercompany_request_id: string | null;
  created_at: string;
}

export async function createSupplyRequest(branchId: string, productId: string, quantity: number) {
  const { data, error } = await (supabase as any).rpc('create_supply_request', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) throw error;
  return data as { id: string; status: string };
}

export async function listSupplyRequests(): Promise<SupplyRequest[]> {
  const { data, error } = await (supabase as any)
    .from('supply_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data || []) as SupplyRequest[];
}

export interface SupplyCandidate {
  source_kind: 'LOJA' | 'CD' | 'FABRICA';
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  quantity: number;
}

export async function getSupplyCandidates(supplyRequestId: string): Promise<SupplyCandidate[]> {
  const { data, error } = await (supabase as any).rpc('supply_candidates', {
    p_supply_request_id: supplyRequestId,
  });
  if (error) throw error;
  return (data || []) as SupplyCandidate[];
}

export interface FactoryInboxSupplyItem {
  id: string;
  company_id: string;
  company_name: string;
  requester_branch_id: string;
  branch_name: string | null;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  status: string;
  created_at: string;
}

/**
 * Caixa de entrada autorizada da Fábrica (RPC SECURITY DEFINER): enxerga
 * TODA solicitação pendente do grupo sem depender de RLS de tabela nem da
 * empresa ativa. Usada para garantir que o gestor nunca deixe de ver um
 * pedido de Loja por contexto/RLS.
 */
export async function getFactoryInbox() {
  const { data, error } = await (supabase as any).rpc('factory_inbox');
  if (error) throw error;
  const payload = (data || {}) as { supply?: FactoryInboxSupplyItem[]; intercompany?: any[] };
  return { supply: payload.supply || [], intercompany: payload.intercompany || [] };
}

export async function decideSupplyRequest(
  supplyRequestId: string,
  sourceKind: 'LOJA' | 'CD' | 'FABRICA' | 'REJEITAR',
  sourceBranchId?: string,
) {
  const { data, error } = await (supabase as any).rpc('decide_supply_request', {
    p_supply_request_id: supplyRequestId,
    p_source_kind: sourceKind,
    p_source_branch_id: sourceBranchId || null,
  });
  if (error) throw error;
  return data as { id: string; status: string; transfer_order_id?: string; intercompany_request_id?: string };
}
