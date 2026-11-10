import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { EmptyState } from '@/shared/components/EmptyState';
import { Skeleton } from '@/ui/base/skeleton';
import { useBillingQueue, useUpdateBillingStatus } from '@/hooks/commercial/useOrderFlow';
import { useOrders } from '@/hooks/commercial/useOrders';
import { useOrderLifecycle } from '@/hooks/commercial/useOrderLifecycle';
import { FileText, Clock, CheckCircle, DollarSign, Play, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { formatBRL, formatNumber } from '@/lib/formatters';
import type { Tables } from '@/integrations/supabase/types';

type BillingQueueItem = Tables<'billing_queue'>;

export default function BillingQueuePage() {
  const { data: items, isLoading } = useBillingQueue();
  const { data: orders } = useOrders();
  const updateStatus = useUpdateBillingStatus();
  const lifecycle = useOrderLifecycle();

  const statusCounts = (items || []).reduce((acc: Record<string, number>, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  const totalPending = (items || []).filter((i) => i.status === 'awaiting_billing').reduce((s: number, i) => s + (i.pending_amount || 0), 0);

  const handleBillFull = (item: BillingQueueItem) => {
    updateStatus.mutate({
      id: item.id,
      status: 'billed_full',
      billed_amount: item.amount,
      pending_amount: 0,
      billed_at: new Date().toISOString(),
    }, {
      onSuccess: () => {
        // Advance order to invoiced
        const order = (orders || []).find(o => o.id === item.order_id);
        if (order && (order.status === 'awaiting_billing' || order.status === 'conferenced')) {
          lifecycle.mutate({
            orderId: order.id,
            order,
            targetStatus: 'invoiced',
            observation: 'Faturamento total concluído',
          });
        }
      },
    });
  };

  return (
    <PageContainer>
      <PageHeader title="Fila de Faturamento" description="Pedidos prontos para emissão de nota fiscal" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{items?.length || 0}</p><p className="text-xs text-muted-foreground">Total na Fila</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-warning-text" />
          <div><p className="text-2xl font-bold">{statusCounts['awaiting_billing'] || 0}</p><p className="text-xs text-muted-foreground">Aguardando</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-success" />
          <div><p className="text-2xl font-bold">{(statusCounts['billed_full'] || 0) + (statusCounts['billed_partial'] || 0)}</p><p className="text-xs text-muted-foreground">Faturados</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">R$ {formatNumber(totalPending, 0)}</p><p className="text-xs text-muted-foreground">Valor Pendente</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Fila de Faturamento</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !items?.length ? (
            <EmptyState
              icon={FileText}
              title="Nenhum item na fila de faturamento"
              description="Pedidos conferidos aparecerão aqui prontos para emissão de nota fiscal."
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Faturado</TableHead>
                <TableHead>Pendente</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><StatusBadge status={item.status} type="order" /></TableCell>
                    <TableCell>{item.billing_type === 'full' ? 'Total' : 'Parcial'}</TableCell>
                    <TableCell>{formatBRL(item.amount)}</TableCell>
                    <TableCell>{formatBRL(item.billed_amount)}</TableCell>
                    <TableCell>{formatBRL(item.pending_amount)}</TableCell>
                    <TableCell>{item.invoice_number || '-'}</TableCell>
                    <TableCell>{format(new Date(item.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {item.status === 'awaiting_billing' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: item.id, status: 'in_billing' })}>
                            <Play className="h-3 w-3 mr-1" /> Iniciar
                          </Button>
                        )}
                        {item.status === 'in_billing' && (
                          <>
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleBillFull(item)}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Faturar Total
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: item.id, status: 'rejected' })}>
                              <Ban className="h-3 w-3 mr-1" /> Rejeitar
                            </Button>
                          </>
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
