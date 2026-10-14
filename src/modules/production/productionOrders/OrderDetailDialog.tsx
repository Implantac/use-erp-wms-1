import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { AuditTrailPanel } from '@/shared/components/AuditTrailPanel';
import { Factory } from 'lucide-react';
import { useProductionOrderSteps } from '@/hooks/production/useProductionSteps';
import { useProductionLogs } from '@/hooks/production/useProductionLogs';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { OrderOverviewTab } from './OrderOverviewTab';
import { OrderStepsTab } from './OrderStepsTab';
import { OrderLogsTab } from './OrderLogsTab';
import { OrderBomTab } from './OrderBomTab';

interface Props {
  order: ProductionOrderRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OrderDetailDialog({ order, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {order && <OrderDetailContent order={order} />}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailContent({ order }: { order: ProductionOrderRow }) {
  const { orderSteps } = useProductionOrderSteps(order.id);
  const { logs } = useProductionLogs(order.id);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5" /> OP {order.order_number}
          <StatusBadge status={order.status} type="production" />
        </DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="overview" className="mt-2">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="bom">Materiais</TabsTrigger>
          <TabsTrigger value="steps">Etapas ({orderSteps.length})</TabsTrigger>
          <TabsTrigger value="logs">Histórico ({logs.length})</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OrderOverviewTab order={order} /></TabsContent>
        <TabsContent value="bom" className="mt-4"><OrderBomTab productId={order.product_id} /></TabsContent>
        <TabsContent value="steps" className="mt-4"><OrderStepsTab orderId={order.id} /></TabsContent>
        <TabsContent value="logs" className="mt-4"><OrderLogsTab orderId={order.id} /></TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTrailPanel entityName="production_orders" entityId={order.id} limit={200} height={360} />
        </TabsContent>
      </Tabs>
    </>
  );
}
