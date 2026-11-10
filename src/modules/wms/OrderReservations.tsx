import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Input } from '@/ui/base/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { toastSuccess, toastError } from '@/lib/toastHelpers';
import { Lock, Unlock, Package, CheckCircle, Search, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';

type ReserveResult = { items_partial?: number; total_reserved?: number };
type ReleaseResult = { released_qty?: number };

interface OrderRow {
  id: string;
  number: string;
  client_name: string;
  status: string;
  total: number;
  date: string;
  reservation_status: 'none' | 'partial' | 'reserved';
  reserved_lines: number;
  pending_lines: number;
}

export default function OrderReservations() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders-for-reservation'],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('id, number, client_name, status, total, date')
        .in('status', ['approved', 'awaiting_separation', 'in_separation', 'confirmed'])
        .order('date', { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = (ordersData || []).map((o) => o.id);
      if (ids.length === 0) return [];

      const { data: res } = await supabase
        .from('stock_reservations')
        .select('order_id, status')
        .in('order_id', ids);

      const map = new Map<string, { reserved: number; pending: number }>();
      (res || []).forEach((r) => {
        const cur = map.get(r.order_id) || { reserved: 0, pending: 0 };
        if (r.status === 'reserved') cur.reserved += 1;
        if (r.status === 'pending') cur.pending += 1;
        map.set(r.order_id, cur);
      });

      return (ordersData || []).map((o) => {
        const m = map.get(o.id);
        let rs: OrderRow['reservation_status'] = 'none';
        if (m) rs = m.pending > 0 ? 'partial' : m.reserved > 0 ? 'reserved' : 'none';
        return { ...o, reservation_status: rs, reserved_lines: m?.reserved || 0, pending_lines: m?.pending || 0 };
      });
    },
  });

  const reserveMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('wms_reserve_order_stock', { p_order_id: orderId });
      if (error) throw error;
      return (data ?? {}) as ReserveResult;
    },
    onSuccess: (data: ReserveResult) => {
      const partial = data?.items_partial || 0;
      if (partial > 0) {
        toastError(`Reserva parcial: ${partial} item(ns) sem saldo suficiente`);
      } else {
        toastSuccess(`Reserva concluída — ${data?.total_reserved || 0} unidade(s)`);
      }
      qc.invalidateQueries({ queryKey: ['orders-for-reservation'] });
      qc.invalidateQueries({ queryKey: ['stock_balances'] });
      qc.invalidateQueries({ queryKey: ['stock-reservations'] });
    },
    onError: (err: Error) => toastError(`Falha ao reservar: ${err.message}`),
  });

  const releaseMut = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('wms_release_order_reservation', { p_order_id: orderId });
      if (error) throw error;
      return (data ?? {}) as ReleaseResult;
    },
    onSuccess: (data: ReleaseResult) => {
      toastSuccess(`Reserva liberada — ${data?.released_qty || 0} unidade(s) devolvidas`);
      qc.invalidateQueries({ queryKey: ['orders-for-reservation'] });
      qc.invalidateQueries({ queryKey: ['stock_balances'] });
      qc.invalidateQueries({ queryKey: ['stock-reservations'] });
    },
    onError: (err: Error) => toastError(`Falha ao liberar: ${err.message}`),
  });

  const filtered = orders.filter(
    (o) =>
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.client_name.toLowerCase().includes(search.toLowerCase()),
  );

  const totals = {
    total: orders.length,
    reserved: orders.filter((o) => o.reservation_status === 'reserved').length,
    partial: orders.filter((o) => o.reservation_status === 'partial').length,
    none: orders.filter((o) => o.reservation_status === 'none').length,
  };

  return (
    <PageContainer loading={isLoading}>
      <PageHeader
        title="Reserva de Estoque por Pedido"
        description="Aloca saldo disponível para pedidos aprovados (FIFO por endereço, isolado por empresa via RLS)"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Pedidos elegíveis" value={totals.total} icon={Package} index={0} />
        <KPICard title="Totalmente reservados" value={totals.reserved} icon={CheckCircle} index={1} color="success" />
        <KPICard title="Parciais (sem saldo)" value={totals.partial} icon={AlertTriangle} index={2} color="warning" />
        <KPICard title="Sem reserva" value={totals.none} icon={Lock} index={3} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status pedido</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState icon={Package} title="Nenhum pedido elegível para reserva" description="Pedidos confirmados aparecerão aqui para reservar estoque." />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.number}</TableCell>
                    <TableCell>{o.client_name}</TableCell>
                    <TableCell>{format(new Date(o.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {o.reservation_status === 'reserved' && (
                        <Badge className="bg-success/10 text-success border-success/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {o.reserved_lines} linha(s) reservada(s)
                        </Badge>
                      )}
                      {o.reservation_status === 'partial' && (
                        <Badge className="bg-warning/10 text-warning-text border-warning/30">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Parcial ({o.pending_lines} pend.)
                        </Badge>
                      )}
                      {o.reservation_status === 'none' && (
                        <Badge variant="outline" className="text-muted-foreground">Sem reserva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
                    <TableCell className="text-right">
                      {o.reservation_status === 'none' ? (
                        <Button
                          size="sm"
                          onClick={() => reserveMut.mutate(o.id)}
                          disabled={reserveMut.isPending}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Reservar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => releaseMut.mutate(o.id)}
                          disabled={releaseMut.isPending}
                        >
                          <Unlock className="h-3 w-3 mr-1" />
                          Liberar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
