import { supabase } from "@/integrations/supabase/client";

export type TransferStatus =
  | 'SUGERIDA'
  | 'APROVADA'
  | 'RESERVADA'
  | 'SEPARAÇÃO'
  | 'CONFERÊNCIA'
  | 'EXPEDIDA'
  | 'EM TRÂNSITO'
  | 'RECEBIDA'
  | 'RECEBIDA PARCIAL'
  | 'RECEBIDA COM DIVERGÊNCIA'
  | 'CONFERIDA'
  | 'ENCERRADA'
  | 'REJEITADA'
  | 'CANCELADA';

export type DivergenceReason = 'FALTA' | 'EXCESSO' | 'AVARIA' | 'PRODUTO_ERRADO';

/** Quantidade conferida por item da transferência. */
export interface ItemQuantity {
  itemId: string;
  quantity: number;
  divergenceReason?: DivergenceReason;
  notes?: string;
}

export interface WorkflowTransition {
  transferId: string;
  fromStatus: TransferStatus;
  toStatus: TransferStatus;
  userId: string;
  /** Quantidades por item (fonte da verdade). Sem isso, usa a quantidade solicitada de cada item. */
  itemQuantities?: ItemQuantity[];
  notes?: string;
  correlationId?: string;
}


/** Transições válidas: impede saltos de etapa e repetição do mesmo estado. */
export const ALLOWED_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  'SUGERIDA': ['APROVADA', 'REJEITADA', 'CANCELADA'],
  'APROVADA': ['RESERVADA', 'CANCELADA'],
  'RESERVADA': ['SEPARAÇÃO', 'CANCELADA'],
  'SEPARAÇÃO': ['CONFERÊNCIA', 'CANCELADA'],
  'CONFERÊNCIA': ['EXPEDIDA', 'CANCELADA'],
  'EXPEDIDA': ['EM TRÂNSITO'],
  'EM TRÂNSITO': ['RECEBIDA', 'RECEBIDA PARCIAL', 'RECEBIDA COM DIVERGÊNCIA'],
  'RECEBIDA': ['CONFERIDA', 'ENCERRADA'],
  'RECEBIDA PARCIAL': ['CONFERIDA', 'ENCERRADA'],
  'RECEBIDA COM DIVERGÊNCIA': ['CONFERIDA', 'ENCERRADA'],
  'CONFERIDA': ['ENCERRADA'],
  'ENCERRADA': [],
  'REJEITADA': [],
  'CANCELADA': [],
};

export function canTransition(from: TransferStatus, to: TransferStatus) {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function nextStatuses(from: TransferStatus) {
  return ALLOWED_TRANSITIONS[from] || [];
}

export const transferWorkflow = {
  /**
   * Transição oficial: RPC atômica no servidor (valida a máquina de estados,
   * move o estoque pelo ledger e grava o histórico na mesma transação).
   * O cliente nunca escreve status/estoque direto — o banco congela isso.
   */
  async transition(input: Omit<WorkflowTransition, 'fromStatus'>) {
    const { data, error } = await (supabase as any).rpc('transition_stock_transfer', {
      p_transfer_id: input.transferId,
      p_to_status: input.toStatus,
      p_items: input.itemQuantities?.length
        ? input.itemQuantities.map((q) => ({ item_id: q.itemId, quantity: q.quantity }))
        : null,
      p_notes: input.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return data as { id: string; from_status: string; status: string; moved_quantity: number; divergence: number };
  },

  async getHistory(transferId: string) {
    const { data, error } = await (supabase as any)
      .from('stock_transfer_workflow_logs')
      .select(`
        *,
        profiles:user_id (name)
      `)
      .eq('transfer_id', transferId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getDivergences(transferId: string) {
    const { data, error } = await (supabase as any)
      .from('stock_transfer_divergences')
      .select('*, product:product_id(name, code)')
      .eq('transfer_id', transferId);
    if (error) throw error;
    return data || [];
  },
};
