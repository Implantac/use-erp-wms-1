import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { EmptyState } from '@/shared/components/EmptyState';
import { QRCodeOPButton } from '@/components/production/QRCodeOP';
import { StepProgressPipeline } from '@/components/production/StepProgressPipeline';
import { Factory, AlertTriangle, Eye, Play, Pause, CheckCircle } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { priorityConfig } from './constants';

interface Props {
  orders: ProductionOrderRow[];
  onView: (o: ProductionOrderRow) => void;
  onStart: (o: ProductionOrderRow) => void;
  onPause: (o: ProductionOrderRow) => void;
  onResume: (o: ProductionOrderRow) => void;
}

const getProgress = (o: ProductionOrderRow) => o.quantity > 0 ? Math.round((o.produced_quantity / o.quantity) * 100) : 0;
const isLate = (o: ProductionOrderRow) => !!(o.due_date && differenceInDays(new Date(), parseISO(o.due_date)) > 0 && !['completed', 'cancelled'].includes(o.status));

export function OrdersTable({ orders, onView, onStart, onPause, onResume }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Factory className="h-5 w-5" /> Ordens de Produção ({orders.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ordem</TableHead><TableHead>Produto</TableHead><TableHead>Cliente</TableHead>
            <TableHead>Progresso</TableHead><TableHead>Etapas</TableHead><TableHead>Prazo</TableHead><TableHead>Prioridade</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {orders.map((order) => {
              const progress = getProgress(order);
              const late = isLate(order);
              const daysLate = order.due_date ? differenceInDays(new Date(), parseISO(order.due_date)) : 0;
              const pCfg = priorityConfig[order.priority] || { label: order.priority, color: '' };
              return (
                <TableRow key={order.id} className={cn(late && 'bg-destructive/5')}>
                  <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                  <TableCell>
                    <div><p className="font-medium">{order.product_name}</p><p className="text-xs text-muted-foreground">{order.product_code}</p></div>
                  </TableCell>
                  <TableCell className="text-sm">{order.client_name || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Progress value={progress} className="w-16 h-2" />
                      <span className="text-xs text-muted-foreground">{order.produced_quantity}/{order.quantity}</span>
                    </div>
                  </TableCell>
                  <TableCell><StepProgressPipeline orderId={order.id} compact /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {late && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      <span className={cn('text-sm', late && 'text-destructive font-medium')}>
                        {order.due_date ? format(parseISO(order.due_date), 'dd/MM', { locale: ptBR }) : '-'}
                      </span>
                      {late && <span className="text-[10px] text-destructive">({daysLate}d)</span>}
                    </div>
                  </TableCell>
                  <TableCell><span className={cn('font-medium text-sm', pCfg.color)}>{pCfg.label}</span></TableCell>
                  <TableCell><StatusBadge status={order.status} type="production" /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <QRCodeOPButton orderNumber={order.order_number} orderId={order.id} productName={order.product_name} batchCode={order.batch_code || undefined} />
                      <Button variant="ghost" size="sm" onClick={() => onView(order)}><Eye className="h-4 w-4" /></Button>
                      {order.status === 'planned' && <Button variant="outline" size="sm" onClick={() => onStart(order)}><Play className="h-4 w-4 mr-1" />Iniciar</Button>}
                      {order.status === 'in_progress' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => onPause(order)}><Pause className="h-4 w-4" /></Button>
                          <Button variant="outline" size="sm" disabled title="Exige conclusão transacional homologada"><CheckCircle className="h-4 w-4 mr-1" />Conclusão bloqueada</Button>
                        </>
                      )}
                      {order.status === 'paused' && <Button variant="outline" size="sm" onClick={() => onResume(order)}><Play className="h-4 w-4 mr-1" />Retomar</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow><TableCell colSpan={9} className="p-4"><EmptyState compact icon={Factory} title="Nenhuma ordem encontrada" description="Crie ordens de produção para iniciar a manufatura ou ajuste os filtros." /></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
