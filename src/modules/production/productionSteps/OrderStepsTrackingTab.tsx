import type { ProductionOrderStep } from '@/hooks/production/useProductionSteps';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Progress } from '@/ui/base/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Skeleton } from '@/ui/base/skeleton';
import { Factory, Layers, Plus } from 'lucide-react';
import { OrderStepProgressPanel } from '../productionOrders/OrderExecutionPanels';

interface Props {
  activeOrders: ProductionOrderRow[];
  selectedOrder: ProductionOrderRow | null;
  selectedOrderId: string;
  onSelectOrder: (id: string) => void;
  orderSteps: ProductionOrderStep[];
  orderStepsLoading: boolean;
  onOpenGenerateForOrder: () => void;
  onChanged: () => Promise<void> | void;
}

export function OrderStepsTrackingTab({
  activeOrders,
  selectedOrder,
  selectedOrderId,
  onSelectOrder,
  orderSteps,
  orderStepsLoading,
  onOpenGenerateForOrder,
  onChanged,
}: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pb-4 pt-4">
          <div className="flex items-center gap-3">
            <Factory className="h-5 w-5 text-muted-foreground" />
            <Select value={selectedOrderId} onValueChange={onSelectOrder}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione uma Ordem de Produção..." />
              </SelectTrigger>
              <SelectContent>
                {activeOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.order_number} — {order.product_name} ({order.produced_quantity}/{order.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedOrderId && (
        orderStepsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
          </div>
        ) : orderSteps.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
              <p className="mb-2 text-lg font-medium">Nenhuma etapa gerada para esta OP</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Novas OPs de tecelagem geram etapas pelo roteiro na criação. Para OP legada, gere o fluxo antes de apontar.
              </p>
              <Button onClick={onOpenGenerateForOrder}>
                <Plus className="mr-2 h-4 w-4" /> Gerar Etapas Agora
              </Button>
            </CardContent>
          </Card>
        ) : selectedOrder ? (
          <div className="space-y-3">
            <Card>
              <CardContent className="pb-4 pt-4">
                <div className="flex justify-between text-sm">
                  <span>Progresso das etapas</span>
                  <span className="font-bold">{orderSteps.filter((step) => step.status === 'completed').length}/{orderSteps.length} concluídas</span>
                </div>
                <Progress value={(orderSteps.filter((step) => step.status === 'completed').length / orderSteps.length) * 100} className="mt-2 h-3" />
              </CardContent>
            </Card>
            <OrderStepProgressPanel order={selectedOrder} steps={orderSteps} loading={false} onChanged={onChanged} />
          </div>
        ) : null
      )}
    </div>
  );
}
