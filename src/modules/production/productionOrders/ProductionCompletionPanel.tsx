import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, PackageCheck } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { ProductionOrderStep } from '@/hooks/production/useProductionSteps';
import type { QualityInspection } from '@/hooks/production/useQualityInspections';
import type { TextileBomLine, TextileLotOption } from '@/hooks/production/useTextilePcpData';
import {
  completeProductionOrder,
  createClientIdempotencyKey,
  fetchLatestProductionCompletion,
  type ProductionCompletionSummary,
} from '@/services/production/textilePcpService';
import { computeCompletionReadiness } from '@/lib/pcp/completionReadiness';
import { formatNumber, formatBRL } from '@/lib/formatters';

const APPROVED_QUALITY = new Set(['approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada']);

interface Props {
  order: ProductionOrderRow;
  bomLines: TextileBomLine[];
  lots: TextileLotOption[];
  steps?: ProductionOrderStep[];
  inspections?: QualityInspection[];
  onCompleted: () => Promise<void> | void;
}

export function ProductionCompletionPanel({ order, bomLines, lots, steps, inspections, onCompleted }: Props) {
  const [produced, setProduced] = useState('');
  const [rejected, setRejected] = useState('0');
  const [outputLotNumber, setOutputLotNumber] = useState('');
  const [allocations, setAllocations] = useState<Record<string, { lotId: string; quantity: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ProductionCompletionSummary | null>(null);
  const canComplete = ['in_progress', 'finishing', 'quality_check'].includes(order.status);

  const readiness = computeCompletionReadiness({
    orderStatus: order.status,
    plannedQuantity: order.quantity,
    steps: (steps ?? []).map((step) => ({ status: step.status })),
    inspections: (inspections ?? []).map((inspection) => ({ status: inspection.status, approved_quantity: inspection.approved_quantity })),
    bomLineCount: bomLines.length,
  });

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

  useEffect(() => {
    if (order.status !== 'completed') return;
    let cancelled = false;
    fetchLatestProductionCompletion(order.id, order.product_id)
      .then((result) => { if (!cancelled) setSummary(result); })
      .catch(() => { /* resumo é informativo; a OP continua concluída */ });
    return () => { cancelled = true; };
  }, [order.id, order.status, order.product_id]);

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
      toast.success(lotNumber ? `OP concluída. Entrada em estoque registrada no lote ${lotNumber}.` : 'OP concluída e entrada em estoque registrada');
      await onCompleted();
      const fresh = await fetchLatestProductionCompletion(order.id, order.product_id).catch(() => null);
      setSummary(fresh);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao concluir OP');
    } finally {
      setSubmitting(false);
    }
  };

  if (order.status === 'completed') {
    return (
      <Card className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-green-800 dark:text-green-200"><PackageCheck className="h-4 w-4" /> Entrada em estoque registrada</CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            A conclusão transacional baixou os lotes de entrada, criou o lote de saída do produto acabado e creditou o saldo na mesma transação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-green-900 dark:text-green-100">
          {summary ? (
            <div className="grid gap-2 md:grid-cols-4">
              <p>Lote de saída<br /><strong>{summary.outputLotNumber ?? '—'}</strong></p>
              <p>Quantidade produzida<br /><strong>{formatNumber(summary.producedQuantity)} {order.unit}</strong>{summary.rejectedQuantity > 0 ? ` · rejeitada ${formatNumber(summary.rejectedQuantity)}` : ''}</p>
              <p>Custo unitário do lote<br /><strong>{formatBRL(summary.outputUnitCost)}</strong></p>
              <p>Saldo atual do produto<br /><strong>{summary.productBalance === null ? 'não consultado' : `${formatNumber(summary.productBalance)} ${order.unit}`}</strong></p>
            </div>
          ) : (
            <p>OP concluída pela transação auditável. Consulte o lote de saída e o saldo do produto no estoque.</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button asChild size="sm" variant="outline"><Link to="/wms/lotes">Ver lotes de estoque</Link></Button>
            <Button asChild size="sm" variant="ghost"><Link to="/wms/saldos">Ver saldos do produto</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Finalizar OP e registrar entrada em estoque</CardTitle>
        <CardDescription>
          Baixa os lotes no ledger, cria o lote de saída do produto acabado, credita o saldo em estoque, grava a genealogia e consome/libera as reservas — tudo na mesma transação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 rounded-md border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pré-requisitos da finalização</p>
          {readiness.items.map((item) => (
            <div key={item.key} className="flex items-start gap-2 text-sm">
              {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span><strong>{item.label}</strong> — <span className="text-muted-foreground">{item.hint}</span></span>
            </div>
          ))}
        </div>
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
        <Button onClick={handleComplete} disabled={!canComplete || submitting || bomLines.length === 0}>{submitting ? 'Concluindo e entrando em estoque…' : 'Concluir OP e registrar entrada em estoque'}</Button>
        {!readiness.ready && canComplete ? (
          <p className="text-xs text-muted-foreground">O botão executa a transação, que valida todos os pré-requisitos acima e recusa com a causa exata se algo faltar — nada é gravado parcialmente.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
