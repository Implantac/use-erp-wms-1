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
    scope?: 'unit' | 'group';
  }): Promise<SupplyChainMovement[]> {
    // Fonte única e oficial: stock_transfer_orders (fluxo de lojas).
    // O modelo legado supply_chain_movements não é mais alimentado; esta
    // tela apenas traduz os status PT para o vocabulário visual dela.
    const companyId = getActiveCompanyId();
    if (!companyId) throw new Error('Empresa ativa não identificada para a cadeia de suprimentos.');

    const PT_TO_EN: Record<string, string> = {
      'SUGERIDA': 'requested',
      'APROVADA': 'approved',
      'RESERVADA': 'picking',
      'SEPARAÇÃO': 'picking',
      'CONFERÊNCIA': 'picked',
      'EXPEDIDA': 'shipped',
      'EM TRÂNSITO': 'in_transit',
      'RECEBIDA': 'received',
      'RECEBIDA PARCIAL': 'divergent',
      'RECEBIDA COM DIVERGÊNCIA': 'divergent',
      'CONFERIDA': 'checked',
      'ENCERRADA': 'completed',
    };
    const tipoLabel = (tipo?: string | null) =>
      tipo === 'industria' ? 'FÁBRICA' : tipo === 'cd' ? 'CD' : 'Loja';

    // Escopo: 'unit' = só a unidade ativa; 'group' = malha do grupo inteiro
    // (indústria + lojas), incluindo os pedidos intercompany à fábrica.
    let companyIds = [companyId];
    let rootId = companyId;
    if (filters.scope === 'group') {
      const { data: compRows } = await (supabase as any)
        .from('companies')
        .select('id, parent_company_id');
      const mine = (compRows || []).find((c: any) => c.id === companyId);
      rootId = mine?.parent_company_id || companyId;
      companyIds = [...new Set([
        rootId,
        ...(compRows || []).filter((c: any) => c.parent_company_id === rootId).map((c: any) => c.id),
        companyId,
      ])];
    }

    let query = (supabase as any)
      .from('stock_transfer_orders')
      .select('*')
      .in('company_id', companyIds)
      .not('current_status', 'in', '("REJEITADA","CANCELADA")');

    if (filters.scope !== 'group' && filters.unit_id) {
      if (filters.role === 'origin') query = query.eq('origin_unit_id', filters.unit_id);
      else if (filters.role === 'destination') query = query.eq('destination_unit_id', filters.unit_id);
      else query = query.or(`origin_unit_id.eq.${filters.unit_id},destination_unit_id.eq.${filters.unit_id}`);
    }

    const { data: orders, error } = await query.order('created_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) throw error;
    const rows = orders || [];
    if (rows.length === 0) return [];

    const branchIds = [...new Set(rows.flatMap((o: any) => [o.origin_unit_id, o.destination_unit_id]))];
    const { data: branches } = await (supabase as any)
      .from('branches')
      .select('id, name, tipo, company_id')
      .in('id', branchIds);
    const branchMap = new Map((branches || []).map((b: any) => [b.id, b]));
    const branchCompanyIds = [...new Set((branches || []).map((b: any) => b.company_id).filter(Boolean))];
    const { data: companies } = branchCompanyIds.length
      ? await (supabase as any).from('companies').select('id, name').in('id', branchCompanyIds)
      : { data: [] };
    const companyMap = new Map((companies || []).map((c: any) => [c.id, c.name]));

    const { data: items } = await (supabase as any)
      .from('stock_transfer_items')
      .select('transfer_id')
      .in('transfer_id', rows.map((o: any) => o.id));
    const countMap = new Map<string, number>();
    for (const it of items || []) countMap.set(it.transfer_id, (countMap.get(it.transfer_id) || 0) + 1);

    const mapped = rows.map((o: any) => ({
      id: o.id,
      company_id: o.company_id,
      origin_id: o.origin_unit_id,
      destination_id: o.destination_unit_id,
      origin_type: tipoLabel(branchMap.get(o.origin_unit_id)?.tipo),
      destination_type: tipoLabel(branchMap.get(o.destination_unit_id)?.tipo),
      origin_name: branchMap.get(o.origin_unit_id)?.name,
      destination_name: branchMap.get(o.destination_unit_id)?.name,
      origin_company: companyMap.get(branchMap.get(o.origin_unit_id)?.company_id),
      destination_company: companyMap.get(branchMap.get(o.destination_unit_id)?.company_id),
      items_count: countMap.get(o.id) || 0,
      priority: 'normal',
      status: PT_TO_EN[o.current_status] || 'requested',
      raw_status: o.current_status,
      created_at: o.created_at,
      updated_at: o.updated_at,
      notes: o.notes,
    }));

    if (filters.scope === 'group') {
      const INTER_TO_EN: Record<string, string> = {
        pendente: 'requested',
        aprovada: 'approved',
        producao_solicitada: 'picking',
        recebida: 'received',
        entregue: 'completed',
        concluida: 'completed',
      };
      const { data: inters } = await (supabase as any)
        .from('intercompany_replenishment_requests')
        .select('*')
        .eq('group_root_company_id', rootId)
        .not('status', 'in', '("rejeitada","cancelada")')
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT);
      for (const r of inters || []) {
        mapped.push({
          id: r.id,
          kind: 'intercompany',
          company_id: r.requesting_company_id,
          origin_id: null,
          destination_id: r.requesting_branch_id,
          origin_type: 'FÁBRICA',
          destination_type: 'Loja',
          origin_name: companyMap.get(r.group_root_company_id) || 'Fábrica',
          destination_name: branchMap.get(r.requesting_branch_id)?.name || companyMap.get(r.requesting_company_id) || 'Loja',
          origin_company: companyMap.get(r.group_root_company_id),
          destination_company: companyMap.get(r.requesting_company_id),
          items_count: 1,
          priority: 'normal',
          status: INTER_TO_EN[r.status] || 'requested',
          created_at: r.created_at,
          updated_at: r.updated_at,
          notes: r.notes,
          product_name: r.product_name,
          product_code: r.product_code,
          quantity: r.quantity,
          intercompany_status: r.status,
        } as any);
      }
      mapped.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    }

    const filtered = filters.status?.length
      ? mapped.filter((m: any) => (filters.status as string[]).includes(m.status))
      : mapped;
    return filtered as unknown as SupplyChainMovement[];
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
