import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { canManageSupply, type SupplyCompanyRef, type SupplyRoleRef } from '@/lib/store/supplyAccess';

/**
 * Papel do usuário no abastecimento: Loja (solicita/recebe) x gestor da
 * indústria (analisa e decide). Fonte: user_roles reais do usuário +
 * hierarquia de empresas do grupo (parent_company_id).
 */
export function useSupplyAccess() {
  const { userId, allowedCompanies, currentCompany, role } = useEnterprise();

  const rolesQuery = useQuery({
    queryKey: ['supply-access-roles', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<SupplyRoleRef[]> => {
      const { data, error } = await (supabase as any)
        .from('user_roles')
        .select('company_id, role')
        .eq('user_id', userId);
      if (error) throw error;
      return (data || []) as SupplyRoleRef[];
    },
  });

  const companies: SupplyCompanyRef[] = allowedCompanies.map((c) => ({
    id: c.id,
    parent_company_id: (c as any).parent_company_id ?? null,
  }));
  const roles = rolesQuery.data || [];
  const isSystemAdmin = role === 'system_admin' || roles.some((r) => r.role === 'system_admin');
  const resolved = canManageSupply({
    companies,
    roles,
    isSystemAdmin,
    currentCompanyId: currentCompany?.id ?? null,
  });

  return {
    ...resolved,
    isLoading: rolesQuery.isLoading,
  };
}
