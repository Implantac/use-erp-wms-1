import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { complianceService } from '@/services/compliance/ComplianceService';

export function useComplianceValidation(orderId?: string) {
  const { data: validation, isLoading, error, refetch } = useQuery({
    queryKey: ['compliance-validation', orderId],
    queryFn: () => orderId ? complianceService.validateLogisticsFinancialIntegrity(orderId) : null,
    enabled: !!orderId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logAudit = async (action: string, metadata: any) => {
    return complianceService.logAuditTrail(action, metadata);
  };

  return {
    validation,
    isLoading,
    error,
    refetch,
    logAudit
  };
}
