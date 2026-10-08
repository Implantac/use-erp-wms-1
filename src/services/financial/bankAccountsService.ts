import { supabase } from '@/integrations/supabase/client';
import { BankAccountRow } from '@/hooks/financial/useBankAccounts';

export const bankAccountsService = {
  async getAll(companyId: string) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
      .limit(100);
    if (error) throw error;
    return (data || []) as BankAccountRow[];
  },

  async create(account: Omit<BankAccountRow, 'id' | 'created_at' | 'updated_at' | 'balance' | 'active'>) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert([account])
      .select()
      .single();
    if (error) throw error;
    return data as BankAccountRow;
  },

  async update(id: string, updates: Partial<BankAccountRow>) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as BankAccountRow;
  }
};
