import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Tabs, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { AlertTriangle, TrendingDown, CheckCheck } from 'lucide-react';
import { Skeleton } from '@/ui/base/skeleton';
import { EmptyState } from '@/shared/components/EmptyState';
import { isPast } from 'date-fns';
import { toastSuccess, handleMutationError } from '@/lib/toastHelpers';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import type { CompanyUser, FilterStatus, Notif } from './divergence-dashboard/types';
import { DivergenceKPIs } from './divergence-dashboard/DivergenceKPIs';
import { DivergenceList } from './divergence-dashboard/DivergenceList';
import { AssignDialog } from './divergence-dashboard/AssignDialog';

export default function DivergenceDashboard() {
  const qc = useQueryClient();
  const { user, role: userRole, activeCompanyId } = useActiveTenant();
  const isAdmin = userRole === 'admin' || userRole === 'admin_matriz';
  const [filter, setFilter] = useState<FilterStatus>('open');

  const [assignTarget, setAssignTarget] = useState<Notif | null>(null);
  const [assignUser, setAssignUser] = useState<string>('');
  const [assignDueAt, setAssignDueAt] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['divergence_notifications', user?.id, activeCompanyId],
    enabled: Boolean(user?.id && activeCompanyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('company_id', activeCompanyId!)
        .in('title', ['Divergência faturamento × estoque', 'Divergência bancária por canal'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Notif[];
    },
    refetchInterval: 60_000,
  });

  const { data: companyUsers } = useQuery({
    queryKey: ['divergence_company_users', user?.id, activeCompanyId],
    enabled: isAdmin && Boolean(user?.id && activeCompanyId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,name').eq('company_id', activeCompanyId!).limit(200);
      if (error) throw error;
      return (data ?? []) as CompanyUser[];
    },
  });

  const notifs = useMemo(() => data ?? [], [data]);
  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    (companyUsers ?? []).forEach((u) => m.set(u.id, u.name ?? '—'));
    return m;
  }, [companyUsers]);

  const openCount = notifs.filter((n) => !n.read).length;
  const overdueCount = notifs.filter((n) => !n.read && n.due_at && isPast(new Date(n.due_at))).length;
  const mineCount = notifs.filter((n) => !n.read && n.assigned_to && n.assigned_to === user?.id).length;
  const stockDiv = notifs.filter((n) => n.title.includes('faturamento'));
  const bankDiv = notifs.filter((n) => n.title.includes('bancária'));

  const filtered = useMemo(() => {
    switch (filter) {
      case 'open': return notifs.filter((n) => !n.read);
      case 'resolved': return notifs.filter((n) => n.read);
      case 'mine': return notifs.filter((n) => n.assigned_to === user?.id);
      case 'overdue': return notifs.filter((n) => !n.read && n.due_at && isPast(new Date(n.due_at)));
      default: return notifs;
    }
  }, [notifs, filter, user?.id]);

  const notificationKey = ['divergence_notifications', user?.id, activeCompanyId];
  const requireCompany = () => {
    if (!activeCompanyId) throw new Error('Empresa ativa não identificada.');
    return activeCompanyId;
  };

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { data: updated, error } = await supabase.from('notifications').update({ read: true }).eq('company_id', requireCompany()).in('id', ids).select('id');
      if (error) throw error;
      if (updated?.length !== ids.length) throw new Error('Nem todos os alertas pertencem à empresa ativa.');
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: notificationKey });
      toastSuccess(ids.length > 1 ? `${ids.length} alertas resolvidos` : 'Alerta resolvido');
    },
    onError: handleMutationError,
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { data: updated, error } = await supabase.from('notifications').update({ read: false }).eq('company_id', requireCompany()).eq('id', id).select('id');
      if (error) throw error;
      if (updated?.length !== 1) throw new Error('Alerta não pertence à empresa ativa.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKey });
      toastSuccess('Alerta reaberto');
    },
    onError: handleMutationError,
  });

  const assign = useMutation({
    mutationFn: async (input: { id: string; assigned_to: string | null; due_at: string | null }) => {
      requireCompany();
      const { error } = await supabase.rpc('assign_notification', {
        _notification_id: input.id,
        _assigned_to: input.assigned_to,
        _due_at: input.due_at,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKey });
      toastSuccess('Responsável atribuído');
      setAssignTarget(null);
    },
    onError: handleMutationError,
  });

  const openAssign = (n: Notif) => {
    setAssignTarget(n);
    setAssignUser(n.assigned_to ?? '');
    setAssignDueAt(n.due_at ? n.due_at.slice(0, 16) : '');
  };

  useEffect(() => {
    if (!assignTarget) { setAssignUser(''); setAssignDueAt(''); }
  }, [assignTarget]);

  const openIds = notifs.filter((n) => !n.read).map((n) => n.id);

  return (
    <PageContainer>
      <PageHeader
        title="Painel Executivo de Divergências"
        description="Consolida os alertas gerados pela conciliação automática diária."
        icon={AlertTriangle}
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-28" />))}
        </div>
      ) : (
        <>
          <DivergenceKPIs openCount={openCount} overdueCount={overdueCount} stockCount={stockDiv.length} bankCount={bankDiv.length} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-amber-500" /> Histórico de alertas
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
                  <TabsList>
                    <TabsTrigger value="open">Abertos ({openCount})</TabsTrigger>
                    <TabsTrigger value="overdue">Vencidos ({overdueCount})</TabsTrigger>
                    <TabsTrigger value="mine">Meus ({mineCount})</TabsTrigger>
                    <TabsTrigger value="resolved">Resolvidos ({notifs.length - openCount})</TabsTrigger>
                    <TabsTrigger value="all">Todos ({notifs.length})</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="outline" disabled={openIds.length === 0 || markRead.isPending} onClick={() => markRead.mutate(openIds)} className="gap-1">
                  <CheckCheck className="h-4 w-4" />Resolver todos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title={filter === 'open' ? 'Sem divergências abertas' : 'Nenhum alerta'}
                  description={filter === 'open' ? 'Todas as divergências foram tratadas.' : 'Nenhum alerta corresponde ao filtro selecionado.'}
                />
              ) : (
                <DivergenceList
                  notifs={filtered}
                  isAdmin={isAdmin}
                  userNameById={userNameById}
                  onAssign={openAssign}
                  onResolve={(id) => markRead.mutate([id])}
                  onReopen={(id) => reopen.mutate(id)}
                  isResolving={markRead.isPending}
                  isReopening={reopen.isPending}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AssignDialog
        target={assignTarget}
        onClose={() => setAssignTarget(null)}
        assignUser={assignUser} setAssignUser={setAssignUser}
        assignDueAt={assignDueAt} setAssignDueAt={setAssignDueAt}
        companyUsers={companyUsers ?? []}
        onSave={(assigned_to, due_at) => assignTarget && assign.mutate({ id: assignTarget.id, assigned_to, due_at })}
        isPending={assign.isPending}
      />
    </PageContainer>
  );
}
