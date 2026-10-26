import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { createTextileProductionOrder } from '@/services/production/textilePcpService';
import { demandIdempotencyKey } from '@/lib/pcp/completionReadiness';
import { formatNumber } from '@/lib/formatters';

interface DemandItem {
  id: string;
  product_id: string | null;
  product_name: string;
  product_code: string;
  quantity: number;
}

interface Props {
  order: { id: string; number: string; client_name: string; items?: DemandItem[] } | null;
  onClose: () => void;
  onGenerated?: () => Promise<void> | void;
}

type ItemState = { status: 'idle' | 'running' | 'done' | 'error'; message: string };

/**
 * Gera OPs reais a partir do pedido de venda: uma OP por item, pela RPC
 * transacional create_textile_production_order (snapshot de BOM/roteiro,
 * setor derivado do roteiro do produto). A chave de idempotência é estável
 * por item — reabrir e clicar de novo NÃO duplica OP (a RPC também recusa
 * segunda OP para o mesmo item de pedido).
 */
export function GenerateOPDialog({ order, onClose, onGenerated }: Props) {
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [runningAll, setRunningAll] = useState(false);

  const items = useMemo(() => order?.items ?? [], [order]);
  if (!order) return null;

  const generateItem = async (item: DemandItem): Promise<boolean> => {
    if (!item.product_id) {
      setStates((s) => ({ ...s, [item.id]: { status: 'error', message: 'Item sem produto vinculado — corrija o cadastro do item no pedido.' } }));
      return false;
    }
    setStates((s) => ({ ...s, [item.id]: { status: 'running', message: 'Gerando…' } }));
    try {
      const result = await createTextileProductionOrder({
        productId: item.product_id,
        quantity: item.quantity,
        clientName: order.client_name,
        salesOrderId: order.id,
        orderItemId: item.id,
        idempotencyKey: demandIdempotencyKey(order.id, item.id),
      });
      const orderNumber = typeof result.order_number === 'string' ? result.order_number : null;
      const replay = result.idempotent_replay === true;
      setStates((s) => ({
        ...s,
        [item.id]: {
          status: 'done',
          message: replay ? `OP já existia para este item${orderNumber ? ` (${orderNumber})` : ''} — nada duplicado.` : `OP ${orderNumber ?? ''} criada (planejada). Execute-a na central do setor.`,
        },
      }));
      return true;
    } catch (error) {
      setStates((s) => ({ ...s, [item.id]: { status: 'error', message: error instanceof Error ? error.message : 'Erro ao gerar OP' } }));
      return false;
    }
  };

  const generateAll = async () => {
    setRunningAll(true);
    let created = 0;
    for (const item of items) {
      if (states[item.id]?.status === 'done') continue;
      if (await generateItem(item)) created += 1;
    }
    setRunningAll(false);
    if (created > 0) {
      toast.success(`${created} OP(s) geradas para o pedido ${order.number}`);
      await onGenerated?.();
    }
  };

  const pendingCount = items.filter((item) => states[item.id]?.status !== 'done').length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Gerar OPs do Pedido {order.number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Cliente: <strong>{order.client_name}</strong> · Uma OP planejada por item, com ficha e roteiro congelados. A OP nasce <strong>planejada</strong>; reserva, apontamento, qualidade e a entrada em estoque do acabado acontecem na central do setor.</p>
          <Table>
            <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead>Resultado</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Pedido sem itens.</TableCell></TableRow>
              ) : items.map((item) => {
                const state = states[item.id];
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.product_code ? `${item.product_code} — ` : ''}{item.product_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {state ? (
                        <span className={state.status === 'error' ? 'text-destructive' : state.status === 'done' ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}>{state.message}</span>
                      ) : !item.product_id ? (
                        <Badge variant="outline">sem produto vinculado</Badge>
                      ) : (
                        <span className="text-muted-foreground">pendente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={!item.product_id || state?.status === 'running' || state?.status === 'done'}
                        onClick={() => void generateItem(item).then(async (ok) => { if (ok) await onGenerated?.(); })}>
                        {state?.status === 'done' ? 'Gerada' : 'Gerar OP'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => void generateAll()} disabled={runningAll || items.length === 0 || pendingCount === 0}>
            {runningAll ? 'Gerando…' : `Gerar OPs pendentes (${pendingCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
