import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useQueryClient } from '@tanstack/react-query';
import { bankAccountsService } from '@/services/financial/bankAccountsService';
import { useSupabaseQuery, useSupabaseMutation } from '@/hooks/shared/useSupabaseQuery';
import { toastError, toastSuccess } from '@/lib/toastHelpers';

export interface BankAccountRow {
  id: string;
  name: string;
  bank_name: string;
  bank_code: string | null;
  agency: string | null;
  account_number: string | null;
  account_type: string;
  balance: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useBankAccounts() {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  return useSupabaseQuery(['bank_accounts', companyId], () => bankAccountsService.getAll(companyId!), { enabled: Boolean(companyId) });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    (account: Omit<BankAccountRow, 'id' | 'created_at' | 'updated_at' | 'balance' | 'active'>) => 
      bankAccountsService.create(account),
    {
      onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['bank_accounts'] }); 
        toastSuccess('Sucesso', 'Conta bancária cadastrada'); 
      },
      onError: () => toastError('Erro ao cadastrar conta'),
    }
  );
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useSupabaseMutation(
    ({ id, ...updates }: { id: string } & Partial<BankAccountRow>) => 
      bankAccountsService.update(id, updates),
    {
      onSuccess: () => { 
        queryClient.invalidateQueries({ queryKey: ['bank_accounts'] }); 
      },
      onError: () => toastError('Erro ao atualizar conta'),
    }
  );
}
