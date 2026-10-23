import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import {
  replenishmentEngine,
  ReplenishmentRecommendation,
} from '@/services/operational/inventory/replenishmentEngine';
import { toastSuccess, toastError } from '@/lib/toastHelpers';

export interface ReplenishmentRequestInput {
  recommendation: ReplenishmentRecommendation;
  quantity: number;
  notes?: string;
}

export function useStoreReplenishment() {
  const { currentBranch, currentCompany } = useEnterprise();
  const branchId = currentBranch?.id;
  const queryClient = useQueryClient();

  const recommendationsQuery = useQuery({
    queryKey: ['store-replenishment', branchId],
    queryFn: () => replenishmentEngine.getNetworkRecommendations(branchId!),
    enabled: !!branchId,
    staleTime: 1000 * 60 * 2,
  });

  const createRequest = useMutation({
    mutationFn: async ({ recommendation, quantity }: ReplenishmentRequestInput) => {
      if (!quantity || quantity <= 0) throw new Error('Informe uma quantidade válida.');
      // Caminho único da Loja: solicitação de abastecimento SEM origem.
      // Quem decide se sai de outra Loja, do CD ou da fábrica é a análise
      // do almoxarifado (decide_supply_request), não a Loja.
      const { createSupplyRequest } = await import('@/services/operational/store/supplyService');
      return createSupplyRequest(recommendation.branchId, recommendation.productId, quantity);
    },
    onSuccess: () => {
      toastSuccess('Abastecimento solicitado', 'O almoxarifado vai analisar a melhor origem: outra Loja, CD ou fábrica.');
      queryClient.invalidateQueries({ queryKey: ['store-replenishment'] });
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['supply-chain-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-in-transit'] });
      queryClient.invalidateQueries({ queryKey: ['store-kpis'] });
    },
    onError: (error) => toastError(error, 'Não foi possível solicitar o abastecimento.'),
  });

  return {
    recommendations: recommendationsQuery.data || [],
    isLoading: recommendationsQuery.isLoading,
    isError: recommendationsQuery.isError,
    refetch: recommendationsQuery.refetch,
    createRequest: createRequest.mutateAsync,
    isSubmitting: createRequest.isPending,
  };
}
