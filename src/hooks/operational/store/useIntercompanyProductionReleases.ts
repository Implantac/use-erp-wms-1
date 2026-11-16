import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useReadContextEpoch } from '@/hooks/operational/useReadContextEpoch';
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
  const readEpoch = useReadContextEpoch(token);
  const ids = [...new Set(requestIds)].sort();
  const readRoles = !!scope && ids.length > 0 && companyId === rootCompanyId;
  const requestKey = JSON.stringify([token, readEpoch, rootCompanyId, ids]);
  const currentRequest = useRef(requestKey); currentRequest.current = requestKey;
  const refreshInFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const recordsQuery = useQuery({
    queryKey: ['intercompany-production-releases', token, readEpoch, ids.join(',')],
    enabled: !!scope && ids.length > 0,
    queryFn: ({ signal }) => readIntercompanyReleases(scope!, ids, signal),
    retry: false,
    staleTime: 15_000,
  });
  const rolesQuery = useQuery({
    queryKey: ['intercompany-release-roles', token, readEpoch],
    enabled: readRoles,
    queryFn: ({ signal }) => readReleaseRoles(scope!, signal),
    retry: false,
    staleTime: 15_000,
  });
  const failureState: ReleaseReadState = recordsQuery.error instanceof IntercompanyReleaseReadError ? recordsQuery.error.kind : 'error';
  const state: ReleaseReadState = !scope ? 'unavailable' : recordsQuery.isError ? failureState
    : ids.length === 0 ? 'ready' : recordsQuery.isFetching || recordsQuery.isLoading || !recordsQuery.data ? 'loading' : 'ready';

  function refetch(): Promise<void> {
    // React Query's raw refetch bypasses enabled=false. Never expose it here.
    if (!scope || currentRequest.current !== requestKey) return Promise.reject(new Error('Contexto indisponível para reconsultar o lastro.'));
    if (!ids.length) return Promise.reject(new Error('Nenhuma solicitação identificada para reconsulta.'));
    if (refreshInFlight.current?.key === requestKey) return refreshInFlight.current.promise;
    const promise = (async () => {
      const results = await Promise.allSettled([
        recordsQuery.refetch({ throwOnError: true }),
        ...(readRoles ? [rolesQuery.refetch({ throwOnError: true })] : []),
      ]);
      if (currentRequest.current !== requestKey) throw new Error('Contexto alterado durante a reconsulta; resultado não confirmado.');
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    })().finally(() => {
      if (refreshInFlight.current?.promise === promise) refreshInFlight.current = null;
    });
    refreshInFlight.current = { key: requestKey, promise };
    return promise;
  }

  return {
    scopeToken: token,
    state,
    records: state === 'ready' ? recordsQuery.data ?? [] : [],
    error: scope ? recordsQuery.error : null,
    authorizationError: readRoles ? rolesQuery.error : null,
    refetch,
    canManage: canReleaseInContext({ userId: context.userId, companyId, rootCompanyId,
      roles: rolesQuery.data ?? [], rolesReady: readRoles && rolesQuery.isSuccess && !rolesQuery.isError && !rolesQuery.isFetching }),
  };
}
