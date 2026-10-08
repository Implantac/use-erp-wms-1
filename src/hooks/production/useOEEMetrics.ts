import { useQuery } from '@tanstack/react-query';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { supabase } from '@/integrations/supabase/client';

export function useOEEMetrics() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  return useQuery({
    queryKey: ['oee_metrics', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) throw new Error('Empresa não selecionada');
      const { data, error } = await supabase.from('oee_metrics').select('id, company_id, machine_id, sector, timestamp, availability, performance, quality, oee')
        .eq('company_id', companyId).order('timestamp', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
