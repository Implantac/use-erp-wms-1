import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { isUuid, LEGACY_RECEIPT_MESSAGE } from '@/lib/store/intercompanyRelease';

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
  production_order_id: string | null;
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
interface GroupRequestReadQuery extends PromiseLike<{ data: GroupRequest[] | null; error: { message: string } | null }> {
  select(columns: string): GroupRequestReadQuery;
  eq(column: string, value: string): GroupRequestReadQuery;
  or(expression: string): GroupRequestReadQuery;
  order(column: string, options: { ascending: boolean }): GroupRequestReadQuery;
  abortSignal(signal: AbortSignal): GroupRequestReadQuery;
}
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(fn, args);

/** RLS still applies. Requester view is explicitly scoped; group view preserves the manager's group inbox. */
export function useGroupRequests(view: 'group' | 'requester' = 'group') {
  const { userId, currentCompany, currentBranch, activeChannel, isReady, isSwitching } = useEnterprise();
  const ready = isReady && !isSwitching && isUuid(userId) && isUuid(currentCompany?.id)
    && (!currentBranch || isUuid(currentBranch.id));
  const token = ready ? JSON.stringify([userId, currentCompany!.id, currentBranch?.id ?? null, activeChannel]) : null;
  return useQuery({
    queryKey: ['group-requests', view, token], enabled: ready, retry: false,
    queryFn: async ({ signal }) => {
      const companyId = currentCompany!.id;
      let query = (supabase as unknown as { from(table: string): GroupRequestReadQuery })
        .from('intercompany_replenishment_requests').select('*');
      if (view === 'requester') {
        query = query.eq('requesting_company_id', companyId);
        if (currentBranch) query = query.eq('requesting_branch_id', currentBranch.id);
      } else query = query.or(`group_root_company_id.eq.${companyId},requesting_company_id.eq.${companyId}`);
      const { data, error } = await query.order('created_at', { ascending: false }).abortSignal(signal);
      if (signal.aborted) throw new Error('Consulta cancelada.');
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('Formato das solicitações não confirmado.');
      for (const row of data) {
        const inContext = view === 'requester'
          ? row.requesting_company_id === companyId && (!currentBranch || row.requesting_branch_id === currentBranch.id)
          : row.group_root_company_id === companyId || row.requesting_company_id === companyId;
        if (!inContext) throw new Error('Solicitação retornada fora do contexto ativo.');
      }
      return data;
    },
    staleTime: 30_000,
  });
}

/** Estoque do grupo (produto x empresa) — RPC com trava de gestor. */
export function useGroupStock(enabled = true) {
  const { userId, currentCompany, currentBranch, activeChannel, isReady, isSwitching } = useEnterprise();
  return useQuery({
    queryKey: ['group-stock-overview', userId, currentCompany?.id, currentBranch?.id, activeChannel],
    enabled: enabled && !!userId && !!currentCompany && isReady && !isSwitching,
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
        r?.sales_order_id ? 'Pedido intercompany vinculado; liberação logística/fiscal não confirmada.' : `Solicitação marcada como ${r?.status}.`,
      );
      qc.invalidateQueries({ queryKey: ['group-requests'] });
      qc.invalidateQueries({ queryKey: ['group-stock-overview'] });
    },
    onError: (e) => toastError(e, 'Não foi possível decidir a solicitação.'),
  });
}

/** Compatibility export: the unsafe receipt signature is never called by this client. */
export function useReceiveGroupDelivery() {
  return useMutation({
    mutationFn: async (input: { requestId: string; quantity?: number }) => {
      void input;
      throw new Error(LEGACY_RECEIPT_MESSAGE);
    },
    onError: (e) => toastError(e, 'Recebimento por entrega ainda indisponível.'),
  });
}
