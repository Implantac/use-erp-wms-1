import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useAppStore } from '@/stores/useAppStore';
import {
  transferService,
  NewTransferItemInput,
} from '@/services/operational/inventory/transferService';
import {
  transferWorkflow,
  TransferStatus,
  ItemQuantity,
} from '@/services/operational/inventory/transferWorkflow';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { supabase } from '@/integrations/supabase/client';

export function useTransferOrdersList() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ['stock-transfer-orders', companyId],
    queryFn: () => transferService.listOrders(companyId!),
    enabled: !!companyId,
  });
}

export function useInboundTransfers() {
  const { currentBranch } = useEnterprise();
  const branchId = currentBranch?.id;
  return useQuery({
    queryKey: ['inbound-transfers', branchId],
    queryFn: () => transferService.listInbound(branchId!),
    enabled: !!branchId,
  });
}

export function useBranchesList() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ['transfer-branches', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', companyId!)
        .order('name')
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

export function useAvailableBalances(branchId?: string) {
  return useQuery({
    queryKey: ['available-balances', branchId],
    queryFn: () => transferService.getAvailableBalances(branchId!),
    enabled: !!branchId,
  });
}

export function useTransferActions() {
  const { currentCompany } = useEnterprise();
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-transfer-orders'] });
    queryClient.invalidateQueries({ queryKey: ['inbound-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['available-balances'] });
    queryClient.invalidateQueries({ queryKey: ['supply-chain-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['stock-in-transit'] });
  };

  const create = useMutation({
    mutationFn: async (input: {
      originUnitId: string;
      destinationUnitId: string;
      priority?: string;
      reason?: string;
      items: NewTransferItemInput[];
    }) => {
      if (!currentCompany?.id) throw new Error('Empresa não identificada.');
      if (!user?.id) throw new Error('Usuário não autenticado.');
      return transferService.createTransfer({ ...input, companyId: currentCompany.id, userId: user.id });
    },
    onSuccess: () => {
      invalidate();
      toastSuccess('Transferência criada');
    },
    onError: (error) => toastError(error, 'Não foi possível criar a transferência.'),
  });

  const advance = useMutation({
    mutationFn: async (input: {
      transferId: string;
      toStatus: TransferStatus;
      itemQuantities?: ItemQuantity[];
      notes?: string;
      correlationId?: string;
    }) => {
      if (!user?.id) throw new Error('Usuário não autenticado.');
      return transferWorkflow.transition({ ...input, userId: user.id });
    },
    onSuccess: (_data, vars) => {
      invalidate();
      toastSuccess('Transferência atualizada', `Situação: ${vars.toStatus}.`);
    },
    onError: (error) => toastError(error, 'Não foi possível atualizar a transferência.'),
  });

  return {
    createTransfer: create.mutateAsync,
    isCreating: create.isPending,
    advance: advance.mutateAsync,
    isAdvancing: advance.isPending,
  };
}
