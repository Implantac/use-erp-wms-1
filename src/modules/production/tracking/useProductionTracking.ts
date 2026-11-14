import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { isUuid } from '@/lib/store/intercompanyRelease';
import { trackingContextKey, type TrackingFilters, type TrackingScope } from './productionTrackingModel';
import { readProductionTrackingPage, readTrackingSectorAccess } from './productionTrackingService';

export function useProductionTracking(filters: TrackingFilters, page: number) {
  const context = useEnterprise();
  const client = useQueryClient();
  const ready = context.isReady && !context.isSwitching && isUuid(context.userId) && isUuid(context.currentCompany?.id)
    && (!context.currentBranch || isUuid(context.currentBranch.id));
  const scope: TrackingScope | null = ready ? { userId: context.userId!, companyId: context.currentCompany!.id,
    branchId: context.currentBranch?.id ?? null, channel: context.activeChannel } : null;
  const contextKey = scope ? trackingContextKey(scope) : null;
  const currentRequest = useRef('');
  const requestKey = JSON.stringify([contextKey, filters, page]); currentRequest.current = requestKey;
  const accessQuery = useQuery({
    queryKey: ['production-tracking-access', contextKey], enabled: !!scope,
    queryFn: ({ signal }) => readTrackingSectorAccess(scope!, signal), retry: false, staleTime: 15_000,
  });
  const access = accessQuery.isSuccess && !accessQuery.isError ? accessQuery.data : undefined;
  const pageQuery = useQuery({
    queryKey: ['production-tracking', contextKey, filters, page, access],
    enabled: !!scope && !!access && !accessQuery.isFetching,
    queryFn: ({ signal }) => readProductionTrackingPage(scope!, filters, access!, page, signal),
    retry: false, staleTime: 15_000,
  });
  const confirmedPage = ready && !!access && !accessQuery.isFetching && !pageQuery.isError && pageQuery.isSuccess
    && pageQuery.data.contextKey === contextKey ? pageQuery.data : undefined;
  return { contextKey, ready, access, data: confirmedPage,
    loading: !!scope && (accessQuery.isLoading || (!!access && pageQuery.isLoading)),
    refreshing: accessQuery.isFetching || pageQuery.isFetching,
    error: accessQuery.error ?? pageQuery.error,
    refresh: async () => {
      if (!scope) return;
      await client.cancelQueries({ queryKey: ['production-tracking', contextKey] });
      const result = await accessQuery.refetch();
      if (!result.isSuccess || currentRequest.current !== requestKey) return;
      // Use the freshly confirmed grants, never the page observer's previous permission closure.
      try {
        await client.fetchQuery({ queryKey: ['production-tracking', contextKey, filters, page, result.data],
          queryFn: ({ signal }) => readProductionTrackingPage(scope, filters, result.data, page, signal),
          retry: false, staleTime: 0 });
      } catch { /* The failed query is retained as error, not converted into zero rows or a toast success. */ }
    },
  };
}
