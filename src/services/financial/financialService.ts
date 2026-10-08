import { supabase } from '@/integrations/supabase/client';
import { BaseService } from '../shared/baseService';
import type { AccountPayable, AccountReceivable } from '@/types/financial';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { LIST_LIMIT } from '@/lib/queryLimits';

class FinancialService extends BaseService<'financial_ledger'> {
  constructor() {
    super('financial_ledger');
  }

  // Receivables
  async getReceivables(companyId: string): Promise<AccountReceivable[]> {
    const { data, error } = await supabase
      .from('accounts_receivable')
      .select('*')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true })
      .limit(LIST_LIMIT);
    if (error) throw error;
    return (data || []) as AccountReceivable[];
  }

  async createReceivable(account: Partial<AccountReceivable>): Promise<AccountReceivable> {
    const { data, error } = await supabase
      .from('accounts_receivable')
      .insert(account as TablesInsert<'accounts_receivable'>)
      .select()
      .single();
    if (error) throw error;
    return data as AccountReceivable;
  }

  async updateReceivable(id: string, updates: Partial<AccountReceivable>): Promise<AccountReceivable> {
    const { data, error } = await supabase
      .from('accounts_receivable')
      .update({ ...updates, updated_at: new Date().toISOString() } as TablesUpdate<'accounts_receivable'>)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as AccountReceivable;
  }

  async deleteReceivable(id: string): Promise<void> {
    const { error } = await supabase
      .from('accounts_receivable')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // Payables
  async getPayables(companyId: string): Promise<AccountPayable[]> {
    const { data, error } = await supabase
      .from('accounts_payable')
      .select('*')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true })
      .limit(LIST_LIMIT);
    if (error) throw error;
    return (data || []) as AccountPayable[];
  }

  async createPayable(account: Partial<AccountPayable>): Promise<AccountPayable> {
    const { data, error } = await supabase
      .from('accounts_payable')
      .insert(account as TablesInsert<'accounts_payable'>)
      .select()
      .single();
    if (error) throw error;
    return data as AccountPayable;
  }

  async updatePayable(id: string, updates: Partial<AccountPayable>): Promise<AccountPayable> {
    const { data, error } = await supabase
      .from('accounts_payable')
      .update({ ...updates, updated_at: new Date().toISOString() } as TablesUpdate<'accounts_payable'>)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as AccountPayable;
  }

  async deletePayable(id: string): Promise<void> {
    const { error } = await supabase
      .from('accounts_payable')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // Ledger
  async getLedger(filters?: { from?: string; to?: string; bankAccountId?: string }): Promise<Tables<'financial_ledger'>[]> {
    let q = supabase.from('financial_ledger').select('*').order('entry_date', { ascending: false }).limit(1000);
    if (filters?.from) q = q.gte('entry_date', filters.from);
    if (filters?.to) q = q.lte('entry_date', filters.to);
    if (filters?.bankAccountId) q = q.eq('bank_account_id', filters.bankAccountId);
    const { data, error } = await q.limit(1000);
    if (error) throw error;
    return (data || []) as Tables<'financial_ledger'>[];
  }

  // Payments
  async createPayment(payment: TablesInsert<'payment_records'>): Promise<Tables<'payment_records'>> {
    const { data, error } = await supabase
      .from('payment_records')
      .insert(payment)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export const financialService = new FinancialService();
