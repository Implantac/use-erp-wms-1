import { supabase } from '@/integrations/supabase/client';

/**
 * ProductionService — pedidos, recursos e inspeções de qualidade.
 * Tabelas: production_orders, production_resources, production_quality_checks.
 */
export class ProductionService {
  async getProductionOrders() {
    const { data, error } = await supabase
      .from('production_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  }

  async updateOrderStatus(id: string, status: string) {
    if (status === 'completed') throw new Error('Conclusão de OP indisponível sem consumo e qualidade transacionais homologados');
    const { error } = await supabase
      .from('production_orders')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  async getResources() {
    const { data, error } = await supabase
      .from('production_resources')
      .select('*')
      .order('name')
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async getQualityInspections() {
    const { data, error } = await supabase
      .from('production_quality_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  }
}

export const productionService = new ProductionService();
