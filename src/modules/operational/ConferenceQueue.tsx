import { PageContainer } from '@/shared/components/PageContainer';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { EmptyState } from '@/shared/components/EmptyState';
import { Skeleton } from '@/ui/base/skeleton';
import { useConferenceRecords } from '@/hooks/commercial/useOrderFlow';
import { useOrders } from '@/hooks/commercial/useOrders';
import { useOrderLifecycle } from '@/hooks/commercial/useOrderLifecycle';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, AlertTriangle, ClipboardCheck, Play } from 'lucide-react';
import { format } from 'date-fns';
import type { TablesUpdate } from '@/integrations/supabase/types';

export default function ConferenceQueue() {
  const { data: conferences, isLoading } = useConferenceRecords();
  const { data: orders } = useOrders();
  const lifecycle = useOrderLifecycle();
  const qc = useQueryClient();
  const updateConferenceStatus = async (id: string, status: string, orderId?: string) => {
    const updates: TablesUpdate<'conference_records'> = { status, updated_at: new Date().toISOString() };
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'approved') {
      updates.completed_at = new Date().toISOString();
      updates.approved = true;
      updates.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('conference_records').update(updates).eq('id', id);
    if (error) { toastError(error.message); return; }
    toastSuccess(`Conferência atualizada com sucesso`);
    qc.invalidateQueries({ queryKey: ['conference-records'] });

    // When conference is completed/approved, advance order to conferenced → awaiting_billing
    if ((status === 'completed' || status === 'approved') && orderId) {
      const order = (orders || []).find(o => o.id === orderId);
      if (order && order.status === 'awaiting_conference') {
        lifecycle.mutate({
          orderId: order.id,
          order,
          targetStatus: 'conferenced',
          observation: 'Conferência aprovada',
        });
      }
    }
  };

  const statusCounts = (conferences || []).reduce((acc: Record<string, number>, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageContainer>
      <PageHeader title="Fila de Conferência" description="Validação de itens antes do faturamento" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ClipboardCheck className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{conferences?.length || 0}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-warning-text" />
          <div><p className="text-2xl font-bold">{statusCounts['pending'] || 0}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{statusCounts['divergent'] || 0}</p><p className="text-xs text-muted-foreground">Divergentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-success" />
          <div><p className="text-2xl font-bold">{(statusCounts['completed'] || 0) + (statusCounts['approved'] || 0)}</p><p className="text-xs text-muted-foreground">Concluídas</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Conferências</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !conferences?.length ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Nenhuma conferência na fila"
              description="Pedidos separados chegarão aqui para validação de itens antes do faturamento."
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Conferidos</TableHead>
                <TableHead>Divergentes</TableHead>
                <TableHead>Conferente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {conferences.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.conference_number}</TableCell>
                    <TableCell><StatusBadge status={c.status} type="order" /></TableCell>
                    <TableCell>{c.total_items}</TableCell>
                    <TableCell>{c.checked_items}</TableCell>
                    <TableCell>{c.divergent_items > 0 ? <span className="text-destructive font-medium">{c.divergent_items}</span> : 0}</TableCell>
                    <TableCell>{c.conferee || '-'}</TableCell>
                    <TableCell>{format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {c.status === 'pending' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateConferenceStatus(c.id, 'in_progress', c.order_id)}>
                            <Play className="h-3 w-3 mr-1" /> Iniciar
                          </Button>
                        )}
                        {c.status === 'in_progress' && (
                          <Button size="sm" className="h-7 text-xs" onClick={() => updateConferenceStatus(c.id, 'completed', c.order_id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Concluir
                          </Button>
                        )}
                        {c.status === 'divergent' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateConferenceStatus(c.id, 'approved', c.order_id)}>
                            Aprovar Divergência
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
