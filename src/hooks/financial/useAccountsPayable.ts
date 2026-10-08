import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useQueryClient } from '@tanstack/react-query';
import { financialService } from '@/services/financial/financialService';
import { useSupabaseQuery, useSupabaseMutation } from '@/hooks/shared/useSupabaseQuery';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { AccountPayable } from '@/types/financial';

export function useAccountsPayable() {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  return useSupabaseQuery(['accounts_payable', companyId], () => financialService.getPayables(companyId!), { enabled: Boolean(companyId) });
}

export function useCreateAccountPayable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    (account: Partial<AccountPayable>) => 
      financialService.createPayable(account),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
        toastSuccess('Sucesso', 'Conta a pagar cadastrada com sucesso');
      },
      onError: () => toastError('Erro ao cadastrar conta a pagar'),
    }
  );
}

export function useUpdateAccountPayable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    ({ id, ...updates }: { id: string } & Partial<AccountPayable>) => 
      financialService.updatePayable(id, updates),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
      },
      onError: () => toastError('Erro ao atualizar conta'),
    }
  );
}

export function useDeleteAccountPayable() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    (id: string) => financialService.deletePayable(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
        toastSuccess('Sucesso', 'Conta removida com sucesso');
      },
      onError: () => toastError('Erro ao remover conta'),
    }
  );
}

