import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';

export function useFiscalTaxRules(origin?: string, destination?: string) {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  return useQuery({
    queryKey: ['fiscal_tax_rules', companyId, origin, destination],
    enabled: Boolean(companyId && origin && destination),
    queryFn: async () => {
      if (!companyId || !origin || !destination) throw new Error('Contexto fiscal incompleto.');
      const { data, error } = await supabase.from('fiscal_tax_rules').select('*')
        .eq('company_id', companyId)
        .eq('origin_state', origin)
        .eq('destination_state', destination);
      if (error) throw error;
      return data || [];
    },
  });
}
