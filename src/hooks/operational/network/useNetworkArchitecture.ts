import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { networkService } from '@/services/operational/network/networkService';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useNetworkArchitecture = () => {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  
  return useQuery({
    queryKey: ['operational_units', companyId],
    queryFn: () => networkService.getOperationalUnits(companyId!),
    enabled: !!companyId
  });
};

export const usePosTerminals = () => {
  const { currentBranch } = useEnterprise();
  const branchId = currentBranch?.id;
  
  return useQuery({
    queryKey: ['pos_terminals', branchId],
    queryFn: () => networkService.getPosTerminals(branchId!),
    enabled: !!branchId
  });
};

export const useReplenishmentPolicies = () => {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  
  return useQuery({
    queryKey: ['replenishment_policies', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('replenishment_policies')
        .select('*, product:products(name, code)')
        .eq('company_id', companyId)
        .limit(200);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId
  });
};

export const useTransferOrders = () => {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  
  return useQuery({
    queryKey: ['transfer_orders', companyId],
    queryFn: () => networkService.getTransfers(companyId!),
    enabled: !!companyId
  });
};

export const useSupplyChainStats = () => {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  
  return useQuery({
    queryKey: ['supply_chain_stats', companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('supply_chain_movements')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['in_transit', 'shipped']);
      if (error) throw error;
      if (count === null) throw new Error('Contagem de movimentações indisponível');
      return { inTransit: count };
    },
    enabled: !!companyId
  });
};
