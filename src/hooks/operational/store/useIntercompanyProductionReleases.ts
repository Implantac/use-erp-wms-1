import { useQuery } from '@tanstack/react-query';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { canReleaseInContext, IntercompanyReleaseReadError, isUuid, type ReleaseReadState } from '@/lib/store/intercompanyRelease';
import { readIntercompanyReleases, readReleaseRoles, releaseScopeKey, type ReleaseScope } from '@/services/production/intercompanyReleaseService';

export function useIntercompanyProductionReleases(requestIds: readonly string[], rootCompanyId: string | null = null) {
  const context = useEnterprise();
  const companyId = context.currentCompany?.id ?? null;
  const branchId = context.currentBranch?.id ?? null;
  const ready = context.isReady && !context.isSwitching && isUuid(context.userId) && isUuid(companyId)
    && (branchId === null || isUuid(branchId));
  const scope: ReleaseScope | null = ready ? {
    userId: context.userId!, companyId: companyId!, branchId, channel: context.activeChannel,
  } : null;
  const token = scope ? releaseScopeKey(scope) : null;
  const ids = [...new Set(requestIds)].sort();
  const recordsQuery = useQuery({
    queryKey: ['intercompany-production-releases', token, ids.join(',')],
    enabled: !!scope && ids.length > 0,
    queryFn: ({ signal }) => readIntercompanyReleases(scope!, ids, signal),
    retry: false,
    staleTime: 15_000,
  });
  const rolesQuery = useQuery({
    queryKey: ['intercompany-release-roles', token],
    enabled: !!scope && companyId === rootCompanyId,
    queryFn: ({ signal }) => readReleaseRoles(scope!, signal),
    retry: false,
    staleTime: 15_000,
  });
  const failureState: ReleaseReadState = recordsQuery.error instanceof IntercompanyReleaseReadError ? recordsQuery.error.kind : 'error';
  const state: ReleaseReadState = !scope ? 'unavailable' : recordsQuery.isError ? failureState
    : ids.length === 0 ? 'ready' : recordsQuery.isFetching || recordsQuery.isLoading || !recordsQuery.data ? 'loading' : 'ready';
  return {
    scopeToken: token,
    state,
    records: state === 'ready' ? recordsQuery.data ?? [] : [],
    error: recordsQuery.error,
    authorizationError: rolesQuery.error,
    refetch: recordsQuery.refetch,
    canManage: canReleaseInContext({ userId: context.userId, companyId, rootCompanyId,
      roles: rolesQuery.data ?? [], rolesReady: !!scope && rolesQuery.isSuccess && !rolesQuery.isError && !rolesQuery.isFetching }),
  };
}
