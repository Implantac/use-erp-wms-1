import { useQuery } from '@tanstack/react-query';
import { productionService } from '@/services/production/productionService';

export function useProduction() {
  const ordersQuery = useQuery({
    queryKey: ['production_orders'],
    queryFn: () => productionService.getProductionOrders(),
  });

  const resourcesQuery = useQuery({
    queryKey: ['production_resources'],
    queryFn: () => productionService.getResources(),
  });

  const qualityQuery = useQuery({
    queryKey: ['quality_inspections'],
    queryFn: () => productionService.getQualityInspections(),
  });

  return {
    orders: ordersQuery.data || [],
    ordersLoading: ordersQuery.isLoading,
    resources: resourcesQuery.data || [],
    resourcesLoading: resourcesQuery.isLoading,
    qualityInspections: qualityQuery.data || [],
    qualityLoading: qualityQuery.isLoading,
  };
}
