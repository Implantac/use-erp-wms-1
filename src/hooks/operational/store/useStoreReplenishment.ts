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
  sourceBranchId: string;
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
    mutationFn: async ({ recommendation, sourceBranchId, quantity, notes }: ReplenishmentRequestInput) => {
      if (!sourceBranchId) throw new Error('Selecione a unidade de origem.');
      if (!quantity || quantity <= 0) throw new Error('Informe uma quantidade válida.');

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Usuário não autenticado.');

      const companyId = recommendation.companyId || currentCompany?.id;
      if (!companyId) throw new Error('Empresa não identificada.');

      const { data, error } = await (supabase as any).rpc('create_stock_transfer_request', {
        p_origin_unit_id: sourceBranchId,
        p_destination_unit_id: recommendation.branchId,
        p_items: [{ product_id: recommendation.productId, quantity }],
        p_notes: notes || recommendation.reason,
      });

      if (error) throw new Error(error.message);


    },
    onSuccess: () => {
      toastSuccess('Solicitação enviada', 'Aguardando a decisão do gestor da rede (aprovar, remanejar ou produzir).');
      queryClient.invalidateQueries({ queryKey: ['store-replenishment'] });
      queryClient.invalidateQueries({ queryKey: ['supply-chain-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['stock-in-transit'] });
      queryClient.invalidateQueries({ queryKey: ['store-kpis'] });
    },
    onError: (error) => toastError(error, 'Não foi possível criar a solicitação.'),
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
