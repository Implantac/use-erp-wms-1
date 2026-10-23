import { Button } from '@/ui/base/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import { getAllowedTransitions, ORDER_FLOW_STEPS, getFlowStepIndex } from '@/lib/orderFlowEngine';
import { getOrderFlowStatus } from '@/hooks/commercial/useOrderFlow';
import { OrderFlowBadge } from './OrderFlowIndicators';
import { OrderTimeline } from './OrderTimeline';
import type { DbOrder, DbOrderItem } from '@/hooks/commercial/orders/types';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  order: (DbOrder & { items?: DbOrderItem[] }) | null;
  onClose: () => void;
  onTransition: (o: DbOrder, targetStatus: string) => void;
  lifecyclePending: boolean;
}

export function OrderDetailDialog({ order, onClose, onTransition, lifecyclePending }: Props) {
  const [receivable, setReceivable] = useState<{ amount: number; status: string; due_date: string } | null>(null);
  useEffect(() => {
    if (!order?.id) { setReceivable(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('accounts_receivable')
        .select('amount, status, due_date')
        .eq('order_id', order.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setReceivable(data || null);
    })();
  }, [order?.id]);

  return (
    <Dialog open={!!order} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Pedido {order?.number}
            {order && <OrderFlowBadge status={order.status} />}
          </DialogTitle>
        </DialogHeader>
        {order && (
          <>
            <div className="pb-2">
              <p className="text-xs text-muted-foreground mb-2">Progresso do Pedido</p>
              <div className="flex items-center gap-1">
                {ORDER_FLOW_STEPS.map((step, idx) => {
                  const currentIdx = getFlowStepIndex(order.status);
                  const isActive = idx <= currentIdx;
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1">
                      <div className={cn('h-2 w-full rounded-full', isActive ? 'bg-primary' : 'bg-muted')} />
                      <span className={cn('text-[10px] mt-1', isActive ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pb-2 border-b">
              {getAllowedTransitions(order.status).map((ns) => (
                <Button
                  key={ns}
                  size="sm"
                  variant={ns === 'cancelled' || ns === 'blocked' ? 'destructive' : 'default'}
                  disabled={lifecyclePending}
                  onClick={() => onTransition(order, ns)}
                >
                  {getOrderFlowStatus(ns).label}
                </Button>
              ))}
            </div>

            <Tabs defaultValue="timeline">
              <TabsList className="w-full">
                <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
                <TabsTrigger value="details" className="flex-1">Detalhes</TabsTrigger>
                <TabsTrigger value="items" className="flex-1">Itens</TabsTrigger>
              </TabsList>
              <TabsContent value="timeline" className="mt-4">
                <OrderTimeline orderId={order.id} />
              </TabsContent>
              <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Cliente:</span> {order.client_name}</div>
                  <div><span className="text-muted-foreground">Status:</span> <OrderFlowBadge status={order.status} /></div>
                  <div><span className="text-muted-foreground">Data:</span> {format(new Date(order.date), 'dd/MM/yyyy')}</div>
                  <div><span className="text-muted-foreground">Entrega:</span> {order.delivery_date ? format(new Date(order.delivery_date), 'dd/MM/yyyy') : '-'}</div>
                  <div><span className="text-muted-foreground">Subtotal:</span> {formatBRL(order.subtotal)}</div>
                  <div><span className="text-muted-foreground">Total:</span> {formatBRL(order.total)}</div>
                  <div><span className="text-muted-foreground">Pgto:</span> {order.payment_method}</div>
                  <div><span className="text-muted-foreground">Condição:</span> {order.payment_condition}</div>
                  <div><span className="text-muted-foreground">Aprov. Comercial:</span> {order.commercial_approval || 'Pendente'}</div>
                  <div><span className="text-muted-foreground">Aprov. Financeira:</span> {order.financial_approval || 'Pendente'}</div>
                  {order.separation_status && <div><span className="text-muted-foreground">Separação:</span> {order.separation_status}</div>}
                  {order.production_status && <div><span className="text-muted-foreground">Produção:</span> {order.production_status}</div>}
                  {order.billing_status && <div><span className="text-muted-foreground">Faturamento:</span> {order.billing_status}</div>}
                  <div>
                    <span className="text-muted-foreground">Financeiro:</span>{' '}
                    {receivable
                      ? <>título a receber de {formatBRL(Number(receivable.amount))} · {receivable.status} · vence {format(new Date(receivable.due_date), 'dd/MM/yyyy')}</>
                      : 'sem título (gerado ao faturar)'}
                  </div>
                  {order.shipment_status && <div><span className="text-muted-foreground">Expedição:</span> {order.shipment_status}</div>}
                </div>
              </TabsContent>
              <TabsContent value="items" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Qtde</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(order.items || []).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono">{i.product_code}</TableCell>
                        <TableCell>{i.product_name}</TableCell>
                        <TableCell>{i.quantity}</TableCell>
                        <TableCell>{formatBRL(i.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
