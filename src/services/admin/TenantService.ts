import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type CompanyRow = Database['public']['Tables']['companies']['Row'];

export class TenantService {
  static async getUserProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('default_branch_id, company_id, name')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  }

  static async getUserRole(userId: string) {
    const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
    if (error) throw error;
    return data;
  }

  static async getCompanies() {
    // Empresas que o usuário pode abrir (perfil + papéis + system_admin).
    // A leitura direta de companies é escopada pela RLS e esconderia as
    // lojas do grupo; a RPC my_companies devolve só as do próprio usuário.
    const { data, error } = await (supabase as any).rpc('my_companies');
    if (!error && data) return data;
    const fallback = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }

  /** Troca a empresa ativa no servidor (RLS acompanha a tela). */
  static async switchActiveCompany(companyId: string) {
    const { error } = await (supabase as any).rpc('switch_active_company', {
      p_company_id: companyId,
    });
    if (error) throw error;
  }

  static async getOperationalUnits(companyId: string) {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, code, tipo, canal_padrao, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data;
  }
}
