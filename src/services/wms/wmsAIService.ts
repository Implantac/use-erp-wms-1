import { supabase } from '@/integrations/supabase/client';

export class WMSAIService {
  /**
   * Generates slotting recommendations based on product movement (Curva ABC)
   */
  async getSlottingRecommendations(branchId: string) {
    // This would typically involve a complex query or RPC joining movements and inventory levels
    const { data, error } = await (supabase as any).rpc('get_wms_slotting_suggestions', {
      p_branch_id: branchId
    });

    // Sem fallback fabricado: se a RPC não responde, a tela mostra o erro
    // real em vez de uma recomendação inventada (Widget A/SKU-001).
    if (error) throw error;
    return data;
  }

  /**
   * Predictive analysis for stock-out risks
   */
  async getStockOutPredictions(companyId: string) {
    const { data, error } = await (supabase as any)
      .from('wms_ai_insights')
      .select('*')
      .eq('company_id', companyId)
      .eq('category', 'rupture')
      .eq('status', 'active');
    
    if (error) throw error;
    return data;
  }
}

export const wmsAIService = new WMSAIService();
