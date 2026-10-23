import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { handleMutationError, toastSuccess } from '@/lib/toastHelpers';
import type { CanalOperacional } from '@/stores/useCanalStore';

// ============================================================================
// ADAPTER (aposentadoria do modelo paralelo `transferencias_canal`):
// esta família de telas do WMS agora lê e escreve NO FLUXO OFICIAL
// (stock_transfer_orders + RPCs com máquina de estados e ledger único).
// Os formatos exportados foram mantidos para não quebrar as telas; os
// status legados são apenas tradução de exibição dos status oficiais.
// ============================================================================

export interface TransferenciaCanalItem {
  product_id: string;
  quantidade: number;
  observacoes?: string | null;
}

export interface TransferenciaCanal {
  id: string;
  numero: string;
  status: 'pendente' | 'em_transito' | 'recebido' | 'cancelado' | string;
  canal_origem: CanalOperacional;
  canal_destino: CanalOperacional;
  origem_branch_id: string;
  destino_branch_id: string;
  observacoes: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const PT_TO_LEGACY: Record<string, string> = {
  SUGERIDA: 'pendente',
  APROVADA: 'pendente',
  RESERVADA: 'pendente',
  'SEPARAÇÃO': 'pendente',
  'CONFERÊNCIA': 'pendente',
  EXPEDIDA: 'em_transito',
  'EM TRÂNSITO': 'em_transito',
  RECEBIDA: 'recebido',
  'RECEBIDA PARCIAL': 'recebido',
  'RECEBIDA COM DIVERGÊNCIA': 'recebido',
  CONFERIDA: 'recebido',
  ENCERRADA: 'recebido',
  REJEITADA: 'cancelado',
  CANCELADA: 'cancelado',
};

async function branchCanalMap(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await (supabase as any)
    .from('branches')
    .select('id, tipo, canal_padrao')
    .in('id', [...new Set(ids)]);
  return new Map(
    (data || []).map((b: any) => [
      b.id,
      b.canal_padrao || (b.tipo === 'cd' || b.tipo === 'industria' ? 'ATACADO_INDUSTRIA' : 'VAREJO_PDV'),
    ]),
  );
}

export function useTransferenciasCanal() {
  const companyId = useEnterpriseStore((s) => s.activeCompanyId);
  return useQuery({
    queryKey: ['transferencias_canal', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const canais = await branchCanalMap(rows.flatMap((o: any) => [o.origin_unit_id, o.destination_unit_id]));
      return rows.map((o: any) => ({
        id: o.id,
        numero: `TR-${String(o.id).slice(0, 8).toUpperCase()}`,
        status: PT_TO_LEGACY[o.current_status] || 'pendente',
        canal_origem: canais.get(o.origin_unit_id) || 'VAREJO_PDV',
        canal_destino: canais.get(o.destination_unit_id) || 'VAREJO_PDV',
        origem_branch_id: o.origin_unit_id,
        destino_branch_id: o.destination_unit_id,
        observacoes: o.notes ?? null,
        created_at: o.created_at,
        confirmed_at: o.received_at ?? null,
      })) as TransferenciaCanal[];
    },
  });
}

export function useTransferenciaItens(transferenciaId: string | null) {
  return useQuery({
    queryKey: ['transferencia_canal_itens', transferenciaId],
    enabled: !!transferenciaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_transfer_items')
        .select('product_id, requested_qty')
        .eq('transfer_id', transferenciaId!);
      if (error) throw error;
      const ids = [...new Set((data || []).map((i: any) => i.product_id))];
      const { data: prods } = ids.length
        ? await (supabase as any).from('products').select('id, code, name, unit').in('id', ids)
        : { data: [] };
      const byId = new Map((prods || []).map((p: any) => [p.id, p]));
      return (data || []).map((i: any) => ({
        product_id: i.product_id,
        quantidade: Number(i.requested_qty || 0),
        observacoes: null,
        product: byId.get(i.product_id) || null,
      }));
    },
  });
}

interface CreateTransferInput {
  origem_branch_id: string;
  destino_branch_id: string;
  canal_origem: CanalOperacional;
  canal_destino: CanalOperacional;
  observacoes?: string;
  itens: TransferenciaCanalItem[];
}

export function useCreateTransferenciaCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransferInput) => {
      const company_id = useEnterpriseStore.getState().activeCompanyId;
      if (!company_id) throw new Error('Empresa não selecionada');
      if (!input.itens.length) throw new Error('Adicione ao menos um item');
      if (input.origem_branch_id === input.destino_branch_id) {
        throw new Error('Origem e destino devem ser diferentes');
      }
      // Fluxo oficial: cria SUGERIDA para o gestor aprovar (sem atalho).
      const { data, error } = await (supabase.rpc as any)('create_stock_transfer_request', {
        p_origin_unit_id: input.origem_branch_id,
        p_destination_unit_id: input.destino_branch_id,
        p_items: input.itens.map((i) => ({ product_id: i.product_id, quantity: i.quantidade })),
        p_notes: input.observacoes ?? null,
      });
      if (error) throw error;
      return { id: (data as any)?.id, numero: `TR-${String((data as any)?.id || '').slice(0, 8).toUpperCase()}` };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transferencias_canal'] });
      qc.invalidateQueries({ queryKey: ['transfer-decision-queue'] });
      qc.invalidateQueries({ queryKey: ['daily-queue'] });
      toastSuccess('Transferência criada (aguardando aprovação do gestor)');
    },
    onError: handleMutationError,
  });
}

export function useConfirmTransferenciaCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: order, error } = await (supabase as any)
        .from('stock_transfer_orders')
        .select('id, current_status')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (order.current_status !== 'EM TRÂNSITO') {
        throw new Error('Só se confirma o recebimento quando a transferência está EM TRÂNSITO (após aprovação, separação e expedição).');
      }
      const { data: items } = await (supabase as any)
        .from('stock_transfer_items')
        .select('id, requested_qty, shipped_qty')
        .eq('transfer_id', id);
      const { data, error: e2 } = await (supabase.rpc as any)('transition_stock_transfer', {
        p_transfer_id: id,
        p_to_status: 'RECEBIDA',
        p_items: (items || []).map((i: any) => ({
          item_id: i.id,
          quantity: Number(i.shipped_qty || i.requested_qty || 0),
        })),
      });
      if (e2) throw e2;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transferencias_canal'] });
      qc.invalidateQueries({ queryKey: ['stock_balances'] });
      qc.invalidateQueries({ queryKey: ['daily-queue'] });
      toastSuccess('Recebimento confirmado — estoque atualizado pelo ledger');
    },
    onError: handleMutationError,
  });
}

export function useCancelTransferenciaCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.rpc as any)('transition_stock_transfer', {
        p_transfer_id: id,
        p_to_status: 'CANCELADA',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transferencias_canal'] });
      qc.invalidateQueries({ queryKey: ['transfer-decision-queue'] });
      toastSuccess('Transferência cancelada');
    },
    onError: handleMutationError,
  });
}
