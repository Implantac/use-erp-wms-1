import { supabase } from '@/integrations/supabase/client';

/**
 * Serviço do módulo de consignação (fábrica → loja).
 * Toda escrita passa pelas RPCs oficiais (SECURITY DEFINER) criadas na
 * migration 20261124100000 — o front nunca escreve direto nas tabelas.
 */

export interface ConsignmentShipmentItemInput {
  product_id: string;
  quantity: number;
  unit_consignment_price?: number;
  unit_retail_price?: number;
}

export interface ConsignmentShipment {
  id: string;
  company_id: string;
  origin_branch_id: string;
  destination_branch_id: string;
  status: 'EM_TRANSITO' | 'RECEBIDA' | 'CANCELADA';
  notes: string | null;
  shipped_at: string;
  received_at: string | null;
  created_at: string;
}

export interface ConsignmentShipmentItem {
  id: string;
  shipment_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  quantity_received: number;
  unit_consignment_price: number;
  unit_retail_price: number;
}

export interface ConsignmentNetworkRow {
  branch_id: string;
  branch_name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  qty_available: number;
  qty_sold: number;
  qty_sponsored: number;
  qty_returned: number;
  consigned_value: number;
  sold_value: number;
  settled_value: number;
  pending_value: number;
}

export interface ConsignmentMovement {
  id: string;
  branch_id: string;
  counterparty_branch_id: string | null;
  product_id: string | null;
  shipment_id: string | null;
  movement_type:
    | 'ENVIO'
    | 'RECEBIMENTO'
    | 'VENDA'
    | 'PATROCINIO'
    | 'DEVOLUCAO'
    | 'TRANSFERENCIA_OUT'
    | 'TRANSFERENCIA_IN'
    | 'LIQUIDACAO';
  quantity: number;
  unit_price: number;
  value: number;
  notes: string | null;
  created_at: string;
}

type RpcResult = { data: unknown; error: { message: string } | null };

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (supabase as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  }).rpc(fn, args);
  if (error) throw new Error(error.message || `Falha em ${fn}`);
  return data;
}

export const consignmentService = {
  async createShipment(
    originBranchId: string,
    destinationBranchId: string,
    items: ConsignmentShipmentItemInput[],
    notes?: string,
  ): Promise<{ shipment_id: string }> {
    return (await rpc('create_consignment_shipment', {
      p_origin_branch: originBranchId,
      p_destination_branch: destinationBranchId,
      p_items: items,
      p_notes: notes ?? null,
    })) as { shipment_id: string };
  },

  async receiveShipment(
    shipmentId: string,
    received?: Array<{ product_id: string; quantity: number }>,
  ): Promise<{ status: string }> {
    return (await rpc('receive_consignment_shipment', {
      p_shipment_id: shipmentId,
      p_received: received ?? null,
    })) as { status: string };
  },

  async registerSale(
    branchId: string,
    productId: string,
    quantity: number,
    unitPrice?: number,
    notes?: string,
  ): Promise<{ qty_sold: number; value: number }> {
    return (await rpc('register_consignment_sale', {
      p_branch: branchId,
      p_product: productId,
      p_quantity: quantity,
      p_unit_price: unitPrice ?? null,
      p_notes: notes ?? null,
    })) as { qty_sold: number; value: number };
  },

  async registerSponsorship(
    branchId: string,
    productId: string,
    quantity: number,
    notes?: string,
  ): Promise<{ qty_sponsored: number; value: number }> {
    return (await rpc('register_consignment_sponsorship', {
      p_branch: branchId,
      p_product: productId,
      p_quantity: quantity,
      p_notes: notes ?? null,
    })) as { qty_sponsored: number; value: number };
  },

  async transferStock(
    fromBranchId: string,
    toBranchId: string,
    productId: string,
    quantity: number,
    notes?: string,
  ): Promise<{ qty: number }> {
    return (await rpc('transfer_consignment_stock', {
      p_from_branch: fromBranchId,
      p_to_branch: toBranchId,
      p_product: productId,
      p_quantity: quantity,
      p_notes: notes ?? null,
    })) as { qty: number };
  },

  async returnStock(
    branchId: string,
    toBranchId: string,
    productId: string,
    quantity: number,
    notes?: string,
  ): Promise<{ qty: number }> {
    return (await rpc('return_consignment_stock', {
      p_branch: branchId,
      p_to_branch: toBranchId,
      p_product: productId,
      p_quantity: quantity,
      p_notes: notes ?? null,
    })) as { qty: number };
  },

  async settle(branchId: string, amount: number, notes?: string): Promise<{ settled: number }> {
    return (await rpc('settle_consignment', {
      p_branch: branchId,
      p_amount: amount,
      p_notes: notes ?? null,
    })) as { settled: number };
  },

  /** Posição de consignação de toda a rede (loja × produto). */
  async getNetwork(): Promise<ConsignmentNetworkRow[]> {
    const { data, error } = await (supabase as unknown as {
      rpc: (name: string) => PromiseLike<RpcResult>;
    }).rpc('get_consignment_network');
    if (error) throw new Error(error.message || 'Falha ao carregar consignação da rede');
    return (data ?? []) as ConsignmentNetworkRow[];
  },

  async listShipments(limit = 50): Promise<ConsignmentShipment[]> {
    const { data, error } = await (supabase as any)
      .from('consignment_shipments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ConsignmentShipment[];
  },

  async listShipmentItems(shipmentId: string): Promise<ConsignmentShipmentItem[]> {
    const { data, error } = await (supabase as any)
      .from('consignment_items')
      .select('*')
      .eq('shipment_id', shipmentId);
    if (error) throw new Error(error.message);
    return (data ?? []) as ConsignmentShipmentItem[];
  },

  async listMovements(limit = 60): Promise<ConsignmentMovement[]> {
    const { data, error } = await (supabase as any)
      .from('consignment_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as ConsignmentMovement[];
  },
};
