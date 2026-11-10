import { PageContainer } from '@/shared/components/PageContainer';
import { toastError, toastSuccess } from '@/lib/toastHelpers';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { EmptyState } from '@/shared/components/EmptyState';
import { Skeleton } from '@/ui/base/skeleton';
import { useStockReservations } from '@/hooks/commercial/useOrderFlow';
import { useOrders } from '@/hooks/commercial/useOrders';
import { useOrderLifecycle } from '@/hooks/commercial/useOrderLifecycle';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Package, Lock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TablesUpdate, Tables } from '@/integrations/supabase/types';

type StockReservationRow = Tables<'stock_reservations'>;

const reservationStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-warning/10 text-warning-text' },
  reserved: { label: 'Reservado', color: 'bg-info/10 text-info' },
  picked: { label: 'Separado', color: 'bg-success/10 text-success' },
  released: { label: 'Liberado', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelado', color: 'bg-destructive/10 text-destructive' },
};

export default function SeparationQueue() {
  const { data: reservations, isLoading } = useStockReservations();
  const { data: orders } = useOrders();
  const lifecycle = useOrderLifecycle();
  const qc = useQueryClient();
  const updateReservationStatus = async (id: string, status: string, orderId?: string) => {
    const updates: TablesUpdate<'stock_reservations'> = { status, updated_at: new Date().toISOString() };
    if (status === 'released' || status === 'cancelled') updates.released_at = new Date().toISOString();
    const { error } = await supabase.from('stock_reservations').update(updates).eq('id', id);
    if (error) { toastError(error.message); return; }
    toastSuccess(`Status atualizado para ${reservationStatusConfig[status]?.label || status}`);
    qc.invalidateQueries({ queryKey: ['stock-reservations'] });

    // Check if all reservations for this order are picked → advance order to awaiting_conference
    if (status === 'picked' && orderId) {
      const { data: orderReservations } = await supabase
        .from('stock_reservations')
        .select('status')
        .eq('order_id', orderId);

      const allPicked = orderReservations?.every((r) => r.status === 'picked');
      if (allPicked) {
        const order = (orders || []).find(o => o.id === orderId);
        if (order && (order.status === 'in_separation' || order.status === 'awaiting_separation')) {
          lifecycle.mutate({
            orderId: order.id,
            order,
            targetStatus: 'awaiting_conference',
            observation: 'Separação concluída - todos os itens separados',
          });
        }
      }
    }
  };

  const statusCounts = (reservations || []).reduce((acc: Record<string, number>, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  // Group by order
  const reservationsByOrder = (reservations || []).reduce((acc: Record<string, StockReservationRow[]>, r) => {
    const oid = r.order_id || 'sem-pedido';
    if (!acc[oid]) acc[oid] = [];
    acc[oid].push(r);
    return acc;
  }, {});

  return (
    <PageContainer>
      <PageHeader title="Fila de Separação" description="Reservas de estoque e romaneio de separação" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{reservations?.length || 0}</p><p className="text-xs text-muted-foreground">Total Reservas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Lock className="h-8 w-8 text-info" />
          <div><p className="text-2xl font-bold">{statusCounts['reserved'] || 0}</p><p className="text-xs text-muted-foreground">Reservados</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-success" />
          <div><p className="text-2xl font-bold">{statusCounts['picked'] || 0}</p><p className="text-xs text-muted-foreground">Separados</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <XCircle className="h-8 w-8 text-warning-text" />
          <div><p className="text-2xl font-bold">{statusCounts['pending'] || 0}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Reservas de Estoque</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !reservations?.length ? (
            <EmptyState
              icon={Package}
              title="Nenhuma reserva na fila"
              description="Reservas de estoque para pedidos aprovados aparecerão aqui para separação."
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Solicitado</TableHead>
                <TableHead>Reservado</TableHead>
                <TableHead>Separado</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {reservations.map((r) => {
                  const sc = reservationStatusConfig[r.status] || { label: r.status, color: '' };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.product_code}</TableCell>
                      <TableCell>{r.product_name}</TableCell>
                      <TableCell>{r.requested_qty}</TableCell>
                      <TableCell>{r.reserved_qty}</TableCell>
                      <TableCell>{r.picked_qty}</TableCell>
                      <TableCell>{r.location || '-'}</TableCell>
                      <TableCell><Badge variant="outline" className={cn('font-medium border', sc.color)}>{sc.label}</Badge></TableCell>
                      <TableCell>{format(new Date(r.created_at), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {r.status === 'pending' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateReservationStatus(r.id, 'reserved', r.order_id)}>
                              <Lock className="h-3 w-3 mr-1" /> Reservar
                            </Button>
                          )}
                          {r.status === 'reserved' && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => updateReservationStatus(r.id, 'picked', r.order_id)}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Separar
                            </Button>
                          )}
                          {(r.status === 'pending' || r.status === 'reserved') && (
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateReservationStatus(r.id, 'cancelled', r.order_id)}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
