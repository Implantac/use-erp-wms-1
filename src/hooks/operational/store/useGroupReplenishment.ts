import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toastError, toastSuccess } from '@/lib/toastHelpers';

export interface GroupRequest {
  id: string;
  group_root_company_id: string;
  requesting_company_id: string;
  requesting_branch_id: string | null;
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string | null;
  quantity: number;
  received_quantity: number | null;
  status: 'pendente' | 'aprovada' | 'producao_solicitada' | 'rejeitada' | 'recebida' | 'cancelada';
  decision: string | null;
  source_company_id: string | null;
  sales_order_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface GroupStockRow {
  company_id: string;
  company_name: string;
  branch_id: string | null;
  branch_name: string | null;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  reserved_quantity: number;
  min_stock: number;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(fn, args);

/** Solicitações intercompany visíveis ao usuário (RLS: solicitante ou matriz). */
export function useGroupRequests() {
  return useQuery({
    queryKey: ['group-requests'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: GroupRequest[] | null; error: { message: string } | null }>;
          };
        };
      })
        .from('intercompany_replenishment_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupRequest[];
    },
    staleTime: 30_000,
  });
}

/** Estoque do grupo (produto x empresa) — RPC com trava de gestor. */
export function useGroupStock(enabled = true) {
  return useQuery({
    queryKey: ['group-stock-overview'],
    enabled,
    queryFn: async () => {
      const { data, error } = await rpc('group_stock_overview', {});
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupStockRow[];
    },
    staleTime: 30_000,
  });
}

export function useCreateGroupRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; quantity: number; notes?: string }) => {
      const { data, error } = await rpc('create_intercompany_replenishment_request', {
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_notes: input.notes ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toastSuccess('Solicitação enviada', 'A indústria do grupo recebeu seu pedido de reposição.');
      qc.invalidateQueries({ queryKey: ['group-requests'] });
    },
    onError: (e) => toastError(e, 'Não foi possível enviar a solicitação.'),
  });
}

export function useDecideGroupRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      decision: 'vender' | 'transferir_cd' | 'remanejar' | 'produzir' | 'rejeitar';
      sourceCompanyId?: string;
    }) => {
      const { data, error } = await rpc('decide_intercompany_request', {
        p_request_id: input.requestId,
        p_decision: input.decision,
        p_source_company_id: input.sourceCompanyId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as { status: string; sales_order_id?: string };
    },
    onSuccess: (r) => {
      toastSuccess(
        'Decisão registrada',
        r?.sales_order_id ? 'Pedido intercompany criado para expedição.' : `Solicitação marcada como ${r?.status}.`,
      );
      qc.invalidateQueries({ queryKey: ['group-requests'] });
      qc.invalidateQueries({ queryKey: ['group-stock-overview'] });
    },
    onError: (e) => toastError(e, 'Não foi possível decidir a solicitação.'),
  });
}

export function useReceiveGroupDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; quantity?: number }) => {
      const { data, error } = await rpc('receive_intercompany_delivery', {
        p_request_id: input.requestId,
        p_quantity: input.quantity ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toastSuccess('Recebimento confirmado', 'O estoque entrou pelo ledger de movimentações.');
      qc.invalidateQueries({ queryKey: ['group-requests'] });
      qc.invalidateQueries({ queryKey: ['group-stock-overview'] });
    },
    onError: (e) => toastError(e, 'Não foi possível confirmar o recebimento.'),
  });
}
