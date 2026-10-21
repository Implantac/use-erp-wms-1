import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { TextileBomLine, TextileLotOption } from '@/hooks/production/useTextilePcpData';
import { completeProductionOrder, createClientIdempotencyKey } from '@/services/production/textilePcpService';
import { formatNumber } from '@/lib/formatters';

const APPROVED_QUALITY = new Set(['approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada']);

interface Props {
  order: ProductionOrderRow;
  bomLines: TextileBomLine[];
  lots: TextileLotOption[];
  onCompleted: () => Promise<void> | void;
}

export function ProductionCompletionPanel({ order, bomLines, lots, onCompleted }: Props) {
  const [produced, setProduced] = useState('');
  const [rejected, setRejected] = useState('0');
  const [outputLotNumber, setOutputLotNumber] = useState('');
  const [allocations, setAllocations] = useState<Record<string, { lotId: string; quantity: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const canComplete = ['in_progress', 'finishing', 'quality_check'].includes(order.status);

  useEffect(() => {
    const totalProcessed = Number(produced || 0) + Number(rejected || 0);
    const next: Record<string, { lotId: string; quantity: string }> = {};
    for (const line of bomLines) {
      const expected = totalProcessed * line.quantity * (1 + line.wastePercentage / 100);
      const lot = lots.find(
        (candidate) => candidate.productId === line.componentId && candidate.status === 'available' && APPROVED_QUALITY.has(candidate.qualityStatus.toLowerCase()),
      );
      next[line.componentId] = {
        lotId: allocations[line.componentId]?.lotId || lot?.id || '',
        quantity: expected > 0 ? String(Number(expected.toFixed(4))) : '',
      };
    }
    setAllocations(next);
    // Recalcula somente a quantidade ao mudar o total processado/catálogo base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, bomLines, lots, produced, rejected]);

  const handleComplete = async () => {
    const producedQuantity = Number(produced);
    const rejectedQuantity = Number(rejected || 0);
    const inputAllocations = bomLines.flatMap((line) => {
      const allocation = allocations[line.componentId];
      const quantity = Number(allocation?.quantity ?? 0);
      return allocation?.lotId && Number.isFinite(quantity) && quantity > 0
        ? [{ component_id: line.componentId, lot_id: allocation.lotId, quantity }]
        : [];
    });
    if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) {
      toast.error('Informe a quantidade boa produzida');
      return;
    }
    if (inputAllocations.length !== bomLines.length || bomLines.length === 0) {
      toast.error('Selecione um lote liberado para cada componente da BOM');
      return;
    }
    setSubmitting(true);
    try {
      const result = await completeProductionOrder({
        productionOrderId: order.id,
        idempotencyKey: createClientIdempotencyKey('complete'),
        producedQuantity,
        rejectedQuantity,
        allocations: inputAllocations,
        outputLotNumber: outputLotNumber.trim() || null,
      });
      const lotNumber = typeof result.output_lot_number === 'string' ? result.output_lot_number : '';
      toast.success(lotNumber ? `OP concluída. Lote de saída ${lotNumber} criado.` : 'OP concluída com sucesso');
      await onCompleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao concluir OP');
    } finally {
      setSubmitting(false);
    }
  };

  if (order.status === 'completed') {
    return (
      <Card className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
        <CardContent className="flex items-center gap-2 py-4 text-sm"><CheckCircle2 className="h-4 w-4 text-green-700" /> OP concluída pela transação auditável. Consulte as alocações de lote e a genealogia nesta tela.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conclusão transacional da OP</CardTitle>
        <CardDescription>
          Baixa os lotes no ledger, cria o lote de saída, grava genealogia, consome/liberar reservas da OP e conclui na mesma transação. Qualidade formalmente aprovada e todas as etapas concluídas são obrigatórias.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canComplete ? (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> A OP precisa estar em produção, acabamento ou controle de qualidade. Inicie a execução/apontamentos antes de concluir.
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1"><Label>Quantidade boa ({order.unit})</Label><Input type="number" min="0" step="0.0001" value={produced} onChange={(event) => setProduced(event.target.value)} placeholder={String(order.quantity)} /></div>
          <div className="space-y-1"><Label>Quantidade rejeitada ({order.unit})</Label><Input type="number" min="0" step="0.0001" value={rejected} onChange={(event) => setRejected(event.target.value)} /></div>
          <div className="space-y-1"><Label>Lote de saída (opcional)</Label><Input value={outputLotNumber} onChange={(event) => setOutputLotNumber(event.target.value)} placeholder={`PROD-${order.order_number}-…`} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Planejado: {formatNumber(order.quantity)} {order.unit}. A conclusão final exige boa + rejeitada ≥ planejado; conclusão parcial deve ser registrada nas etapas, não como OP concluída.</p>
        {bomLines.map((line) => {
          const draft = allocations[line.componentId] ?? { lotId: '', quantity: '' };
          const componentLots = lots.filter((lot) => lot.productId === line.componentId);
          return (
            <div key={line.componentId} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_1.5fr_.7fr]">
              <div><p className="font-medium">{line.componentCode} — {line.componentName}</p><p className="text-xs text-muted-foreground">Consumo real alocado a um lote liberado.</p></div>
              <div className="space-y-1"><Label>Lote de entrada</Label>
                <Select value={draft.lotId} onValueChange={(lotId) => setAllocations((current) => ({ ...current, [line.componentId]: { ...draft, lotId } }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o lote" /></SelectTrigger>
                  <SelectContent>{componentLots.map((lot) => {
                    const approved = APPROVED_QUALITY.has(lot.qualityStatus.toLowerCase());
                    return <SelectItem key={lot.id} value={lot.id} disabled={lot.status !== 'available' || !approved || lot.balanceAvailable <= 0}>{lot.lotNumber} · restante {formatNumber(lot.remainingQty)} · saldo disp. {formatNumber(lot.balanceAvailable)} · {lot.qualityStatus}</SelectItem>;
                  })}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Quantidade ({line.componentUnit})</Label><Input type="number" min="0" step="0.0001" value={draft.quantity} onChange={(event) => setAllocations((current) => ({ ...current, [line.componentId]: { ...draft, quantity: event.target.value } }))} /></div>
            </div>
          );
        })}
        <Button onClick={handleComplete} disabled={!canComplete || submitting || bomLines.length === 0}>{submitting ? 'Concluindo…' : 'Concluir OP e gerar lote'}</Button>
      </CardContent>
    </Card>
  );
}
