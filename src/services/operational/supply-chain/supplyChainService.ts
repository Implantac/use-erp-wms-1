import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { LIST_LIMIT } from "@/lib/queryLimits";
import { getActiveCompanyId } from '@/core/stores/useEnterpriseStore';

export type MovementStatus = Database['public']['Tables']['supply_chain_movements']['Row']['status'];
export type SupplyChainMovement = Database['public']['Tables']['supply_chain_movements']['Row'];
export type SupplyChainItem = Database['public']['Tables']['supply_chain_items']['Row'];

export const supplyChainService = {
  async getMovements(filters: {
    unit_id?: string;
    role?: 'origin' | 'destination' | 'both';
    status?: MovementStatus[];
  }): Promise<SupplyChainMovement[]> {
    const companyId = getActiveCompanyId();
    if (!companyId) throw new Error('Empresa ativa não identificada para a cadeia de suprimentos.');
    let query = supabase
      .from('supply_chain_movements')
      .select('*')
      .eq('company_id', companyId);

    if (filters.unit_id) {
      if (filters.role === 'origin') {
        query = query.eq('origin_id', filters.unit_id);
      } else if (filters.role === 'destination') {
        query = query.eq('destination_id', filters.unit_id);
      } else {
        query = query.or(`origin_id.eq.${filters.unit_id},destination_id.eq.${filters.unit_id}`);
      }
    }

    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(LIST_LIMIT);
    
    if (error) throw error;
    return data ?? [];
  },

  async createRequest(request: Database['public']['Tables']['supply_chain_movements']['Insert'] & { items: Database['public']['Tables']['supply_chain_items']['Insert'][] }) {
    const companyId = getActiveCompanyId();
    if (!companyId || request.company_id !== companyId) throw new Error('Empresa ativa não confere com a solicitação.');
    if (!request.items.length || request.items.some(item => !item.product_id || !Number.isFinite(item.requested_qty) || item.requested_qty <= 0)) {
      throw new Error('Solicitação sem itens válidos.');
    }
    // One server-side transaction: no orphaned movement when an item fails.
    // The RPC independently checks tenant, branches, products and quantities.
    const { data, error } = await supabase.rpc('create_supply_chain_request' as never, {
      _origin_id: request.origin_id,
      _origin_type: request.origin_type,
      _destination_id: request.destination_id,
      _destination_type: request.destination_type,
      _priority: request.priority ?? 'normal',
      _items: request.items.map(item => ({
        product_id: item.product_id,
        requested_qty: item.requested_qty,
        unit_price: item.unit_price ?? null,
      })),
    } as never);
    if (error) throw error;
    if (!data) throw new Error('Banco não confirmou a solicitação de movimentação.');
    return data as unknown as SupplyChainMovement;
  },

  async updateStatus(id: string, status: MovementStatus) {
    const companyId = getActiveCompanyId();
    if (!companyId) throw new Error('Empresa ativa não identificada para atualizar movimentação.');
    const { data, error } = await supabase
      .from('supply_chain_movements')
      .update({ status })
      .eq('company_id', companyId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
