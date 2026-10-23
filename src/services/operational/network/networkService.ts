import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type UnitType = Database['public']['Enums']['app_role'] | 'factory' | 'distribution_center' | 'store' | 'office';

export type OperationalUnit = Database['public']['Tables']['operational_units']['Row'];
export type StockBalance = Database['public']['Tables']['stock_balances']['Row'];
export type SupplyChainMovement = Database['public']['Tables']['supply_chain_movements']['Row'];

export interface StockTransfer extends SupplyChainMovement {
  origin?: { name: string } | null;
  destination?: { name: string } | null;
}

export const networkService = {
  async getOperationalUnits(companyId: string): Promise<OperationalUnit[]> {
    const { data, error } = await supabase
      .from('operational_units')
      .select('*')
      .eq('company_id', companyId)
      .limit(100);
    
    if (error) throw error;
    return data || [];
  },

  async getStockBalances(companyId: string, unitId?: string): Promise<StockBalance[]> {
    let query = supabase
      .from('stock_balances')
      .select('*, branches(name), stock_locations(name), products(name, code)')
      .eq('company_id', companyId)
      .limit(1000);
    
    if (unitId) {
      query = query.eq('branch_id', unitId);
    }

    const { data, error } = await query;
    if (error) throw error;
    // Usamos unknown as any para evitar problemas de tipos com o join de branches
    return (data || []) as unknown as StockBalance[];
  },

  // Modelo legado aposentado: criar/alterar transferência só pelo fluxo
  // oficial (create_stock_transfer_request / transition_stock_transfer).
  async createTransfer(_params: Database['public']['Tables']['supply_chain_movements']['Insert']) {
    throw new Error('Modelo legado aposentado: use o fluxo oficial de transferências (Central da Loja / fila de decisão).');
  },

  async updateTransferStatus(_transferId: string, _status: Database['public']['Tables']['supply_chain_movements']['Update']['status']) {
    throw new Error('Modelo legado aposentado: transições só pela máquina de estados oficial (transition_stock_transfer).');
  },

  async getTransfers(companyId: string): Promise<StockTransfer[]> {
    // Leitura no fluxo oficial (stock_transfer_orders), traduzindo status.
    const PT_TO_EN: Record<string, string> = {
      SUGERIDA: 'requested', APROVADA: 'approved', RESERVADA: 'picking',
      'SEPARAÇÃO': 'picking', 'CONFERÊNCIA': 'picked', EXPEDIDA: 'shipped',
      'EM TRÂNSITO': 'in_transit', RECEBIDA: 'received',
      'RECEBIDA PARCIAL': 'divergent', 'RECEBIDA COM DIVERGÊNCIA': 'divergent',
      CONFERIDA: 'checked', ENCERRADA: 'completed',
      REJEITADA: 'cancelled', CANCELADA: 'cancelled',
    };
    const { data, error } = await (supabase as any)
      .from('stock_transfer_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const rows = data || [];
    const branchIds = [...new Set(rows.flatMap((o: any) => [o.origin_unit_id, o.destination_unit_id]))];
    const { data: branches } = branchIds.length
      ? await (supabase as any).from('branches').select('id, name').in('id', branchIds)
      : { data: [] };
    const names = new Map((branches || []).map((b: any) => [b.id, b.name]));
    return rows.map((o: any) => ({
      id: o.id,
      company_id: o.company_id,
      origin_id: o.origin_unit_id,
      destination_id: o.destination_unit_id,
      status: PT_TO_EN[o.current_status] || 'requested',
      created_at: o.created_at,
      updated_at: o.updated_at,
      origin: { name: names.get(o.origin_unit_id) || null },
      destination: { name: names.get(o.destination_unit_id) || null },
    })) as unknown as StockTransfer[];
  },

  async getPosTerminals(unitId: string) {
    const { data, error } = await supabase
      .from('pos_terminals')
      .select('*')
      .eq('branch_id', unitId)
      .limit(50);
    
    if (error) throw error;
    return data || [];
  }
};
