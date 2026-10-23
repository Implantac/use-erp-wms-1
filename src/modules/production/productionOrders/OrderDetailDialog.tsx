import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { AuditTrailPanel } from '@/shared/components/AuditTrailPanel';
import { Factory } from 'lucide-react';
import { useProductionOrderSteps } from '@/hooks/production/useProductionSteps';
import { useProductionLogs } from '@/hooks/production/useProductionLogs';
import { useQualityInspections } from '@/hooks/production/useQualityInspections';
import { useTextilePcpData } from '@/hooks/production/useTextilePcpData';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import { decideProductionQualityInspection } from '@/services/production/textilePcpService';
import { formatNumber } from '@/lib/formatters';
import { OrderOverviewTab } from './OrderOverviewTab';
import { OrderStepsTab } from './OrderStepsTab';
import { OrderLogsTab } from './OrderLogsTab';
import { OrderBomTab } from './OrderBomTab';
import { OrderMaterialReservationPanel, OrderStepProgressPanel } from './OrderExecutionPanels';
import { ProductionCompletionPanel } from './ProductionCompletionPanel';

interface Props {
  order: ProductionOrderRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged?: () => Promise<void> | void;
}

export function OrderDetailDialog({ order, open, onOpenChange, onChanged }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        {order && <OrderDetailContent order={order} onChanged={onChanged} />}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderDetailContent({ order, onChanged }: { order: ProductionOrderRow; onChanged?: () => Promise<void> | void }) {
  const { orderSteps, refetch: refetchSteps } = useProductionOrderSteps(order.id);
  const { logs, refetch: refetchLogs } = useProductionLogs(order.id);
  const { inspections, refetch: refetchInspections } = useQualityInspections(order.id);
  const execution = useTextilePcpData(order);
  const [qualityBusyId, setQualityBusyId] = useState<string | null>(null);

  const refreshExecution = async () => {
    await Promise.all([execution.refetch(), refetchSteps(), refetchInspections(), refetchLogs(), onChanged?.()]);
  };

  const decideQuality = async (inspectionId: string, status: 'approved' | 'rejected' | 'quarantine') => {
    let correctiveAction: string | null = null;
    if (status !== 'approved') {
      correctiveAction = window.prompt('Motivo/ação corretiva obrigatória para rejeição ou quarentena:')?.trim() || null;
      if (!correctiveAction) {
        toast.error('Informe o motivo ou a ação corretiva');
        return;
      }
    }
    setQualityBusyId(inspectionId);
    try {
      await decideProductionQualityInspection(inspectionId, status, correctiveAction);
      toast.success(status === 'approved' ? 'Inspeção aprovada/liberada' : 'Decisão de qualidade registrada');
      await refreshExecution();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao decidir qualidade');
    } finally {
      setQualityBusyId(null);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Factory className="h-5 w-5" /> OP {order.order_number}
          <StatusBadge status={order.status} type="production" />
        </DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="execution" className="mt-2">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="execution">Execução PCP</TabsTrigger>
          <TabsTrigger value="bom">Materiais</TabsTrigger>
          <TabsTrigger value="steps">Etapas ({orderSteps.length})</TabsTrigger>
          <TabsTrigger value="logs">Histórico ({logs.length})</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OrderOverviewTab order={order} /></TabsContent>
        <TabsContent value="execution" className="mt-4 space-y-4">
          <OrderMaterialReservationPanel
            order={order}
            bomLines={execution.bomLines}
            lots={execution.lots}
            reservations={execution.reservations}
            snapshotAt={execution.snapshotAt}
            loading={execution.loading}
            onChanged={refreshExecution}
          />
          <OrderStepProgressPanel order={order} steps={orderSteps} loading={false} onChanged={refreshExecution} />
          <section className="rounded-lg border p-4">
            <h3 className="font-semibold">Qualidade e liberação formal</h3>
            <p className="mt-1 text-sm text-muted-foreground">A conclusão exige ao menos uma inspeção aprovada cuja quantidade aprovada cubra a quantidade boa. Rejeição/quarentena bloqueia a conclusão.</p>
            <div className="mt-3 space-y-2">
              {inspections.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma inspeção vinculada. Registre no Controle de Qualidade antes de concluir.</p> : inspections.map((inspection) => (
                <div key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-3">
                  <div>
                    <span className="font-medium">Inspeção de {inspection.inspector}</span>{' '}
                    <Badge variant="outline">{inspection.status}</Badge>
                    <p className="text-xs text-muted-foreground">{new Date(inspection.inspection_date).toLocaleDateString('pt-BR')} · Aprovado {formatNumber(inspection.approved_quantity)} · Rejeitado {formatNumber(inspection.rejected_quantity)} {order.unit}</p>
                  </div>
                  {!['completed', 'cancelled'].includes(order.status) ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={qualityBusyId === inspection.id} onClick={() => void decideQuality(inspection.id, 'approved')}>Aprovar/liberar</Button>
                      <Button size="sm" variant="outline" disabled={qualityBusyId === inspection.id} onClick={() => void decideQuality(inspection.id, 'quarantine')}>Quarentena</Button>
                      <Button size="sm" variant="destructive" disabled={qualityBusyId === inspection.id} onClick={() => void decideQuality(inspection.id, 'rejected')}>Rejeitar</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          <ProductionCompletionPanel order={order} bomLines={execution.bomLines} lots={execution.lots} onCompleted={refreshExecution} />
          <section className="rounded-lg border p-4">
            <h3 className="font-semibold">Genealogia persistida de lotes</h3>
            {execution.genealogy.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Sem arestas de genealogia. Elas são criadas somente pela conclusão transacional.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {execution.genealogy.map((edge) => {
                  const inputLot = execution.lots.find((lot) => lot.id === edge.input_lot_id);
                  return <li key={edge.id}>Entrada {inputLot?.lotNumber ?? edge.input_lot_id}: {formatNumber(edge.input_quantity)} {edge.input_unit} → saída: {formatNumber(edge.output_quantity)} {edge.output_unit}</li>;
                })}
              </ul>
            )}
          </section>
        </TabsContent>
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
