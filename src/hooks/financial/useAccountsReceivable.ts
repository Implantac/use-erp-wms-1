import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useQueryClient } from '@tanstack/react-query';
import { financialService } from '@/services/financial/financialService';
import { useSupabaseQuery, useSupabaseMutation } from '@/hooks/shared/useSupabaseQuery';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { AccountReceivable } from '@/types/financial';

export function useAccountsReceivable() {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  return useSupabaseQuery(['accounts_receivable', companyId], () => financialService.getReceivables(companyId!), { enabled: Boolean(companyId) });
}

export function useCreateAccountReceivable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    (account: Partial<AccountReceivable>) => 
      financialService.createReceivable(account),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_receivable'] });
        toastSuccess('Sucesso', 'Conta a receber cadastrada com sucesso');
      },
      onError: () => toastError('Erro ao cadastrar conta a receber'),
    }
  );
}

export function useUpdateAccountReceivable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    ({ id, ...updates }: { id: string } & Partial<AccountReceivable>) => 
      financialService.updateReceivable(id, updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_receivable'] });
      },
      onError: () => toastError('Erro ao atualizar conta'),
    }
  );
}

export function useDeleteAccountReceivable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    (id: string) => financialService.deleteReceivable(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_receivable'] });
        toastSuccess('Sucesso', 'Conta removida com sucesso');
      },
      onError: () => toastError('Erro ao remover conta'),
    }
  );
}

