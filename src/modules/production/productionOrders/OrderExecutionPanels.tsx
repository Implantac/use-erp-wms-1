import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardList, Lock, Play, Unlock } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import type { ProductionOrderStep } from '@/hooks/production/useProductionSteps';
import type { TextileBomLine, TextileLotOption } from '@/hooks/production/useTextilePcpData';
import {
  createClientIdempotencyKey,
  recordProductionStepProgress,
  releaseProductionMaterialReservation,
  reserveProductionMaterials,
  type ProductionMaterialReservationRow,
} from '@/services/production/textilePcpService';
import { formatNumber } from '@/lib/formatters';

const APPROVED_QUALITY = new Set(['approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada']);

interface AllocationDraft {
  lotId: string;
  quantity: string;
}

interface ReservationPanelProps {
  order: ProductionOrderRow;
  bomLines: TextileBomLine[];
  lots: TextileLotOption[];
  reservations: ProductionMaterialReservationRow[];
  snapshotAt: string | null;
  loading: boolean;
  onChanged: () => Promise<void> | void;
}

export function OrderMaterialReservationPanel({
  order,
  bomLines,
  lots,
  reservations,
  snapshotAt,
  loading,
  onChanged,
}: ReservationPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, AllocationDraft>>({});
  const [submitting, setSubmitting] = useState(false);
  const remainingOrderQuantity = Math.max(0, order.quantity - order.produced_quantity);

  useEffect(() => {
    const next: Record<string, AllocationDraft> = {};
    for (const line of bomLines) {
      const expected = remainingOrderQuantity * line.quantity * (1 + line.wastePercentage / 100);
      const availableLot = lots.find(
        (lot) => lot.productId === line.componentId && lot.status === 'available' && APPROVED_QUALITY.has(lot.qualityStatus.toLowerCase()),
      );
      next[line.componentId] = { lotId: availableLot?.id ?? '', quantity: expected > 0 ? String(Number(expected.toFixed(4))) : '' };
    }
    setDrafts(next);
  }, [order.id, bomLines, lots, remainingOrderQuantity]);

  const reservedByComponent = useMemo(() => {
    const map = new Map<string, number>();
    for (const reservation of reservations) {
      if (!['reserved', 'partially_consumed'].includes(reservation.status)) continue;
      const active = reservation.reserved_qty - reservation.consumed_qty - reservation.released_qty;
      map.set(reservation.component_id, (map.get(reservation.component_id) ?? 0) + Math.max(0, active));
    }
    return map;
  }, [reservations]);

  const handleReserve = async () => {
    const allocations = bomLines.flatMap((line) => {
      const draft = drafts[line.componentId];
      const quantity = Number(draft?.quantity ?? 0);
      return draft?.lotId && Number.isFinite(quantity) && quantity > 0
        ? [{ component_id: line.componentId, lot_id: draft.lotId, quantity }]
        : [];
    });
    if (allocations.length === 0) {
      toast.error('Selecione ao menos um lote liberado e informe a quantidade de reserva');
      return;
    }
    setSubmitting(true);
    try {
      await reserveProductionMaterials(order.id, allocations, createClientIdempotencyKey('reserve'));
      toast.success('Materiais reservados para a OP');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao reservar materiais');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (reservation: ProductionMaterialReservationRow) => {
    try {
      await releaseProductionMaterialReservation(reservation.id, undefined, 'Liberado pela tela de execução da OP');
      toast.success('Reserva liberada');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao liberar reserva');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" /> Reserva de materiais por lote</CardTitle>
        <CardDescription>
          {snapshotAt
            ? `Estrutura congelada em ${new Date(snapshotAt).toLocaleString('pt-BR')}. A reserva aumenta somente o saldo reservado; o consumo físico continua no ledger ao concluir.`
            : 'OP sem snapshot: a lista abaixo usa a BOM atual e a RPC bloqueará qualquer divergência de tenant/lote/qualidade.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Carregando BOM, lotes e reservas…</p> : null}
        {!loading && bomLines.length === 0 ? (
          <div className="flex gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Cadastre a BOM do produto antes de reservar ou concluir esta OP.
          </div>
        ) : null}
        {bomLines.map((line) => {
          const expected = remainingOrderQuantity * line.quantity * (1 + line.wastePercentage / 100);
          const componentLots = lots.filter((lot) => lot.productId === line.componentId);
          const draft = drafts[line.componentId] ?? { lotId: '', quantity: '' };
          return (
            <div key={line.componentId} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.2fr_1.5fr_.7fr_auto]">
              <div>
                <p className="font-medium">{line.componentCode} — {line.componentName}</p>
                <p className="text-xs text-muted-foreground">
                  Necessidade planejada: {formatNumber(expected)} {line.componentUnit} · Reservado ativo: {formatNumber(reservedByComponent.get(line.componentId) ?? 0)}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Lote liberado</Label>
                <Select value={draft.lotId} onValueChange={(lotId) => setDrafts((current) => ({ ...current, [line.componentId]: { ...draft, lotId } }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o lote" /></SelectTrigger>
                  <SelectContent>
                    {componentLots.map((lot) => {
                      const approved = APPROVED_QUALITY.has(lot.qualityStatus.toLowerCase());
                      const disabled = lot.status !== 'available' || !approved || lot.balanceAvailable <= 0;
                      return (
                        <SelectItem key={lot.id} value={lot.id} disabled={disabled}>
                          {lot.lotNumber} · restante {formatNumber(lot.remainingQty)} · saldo disp. {formatNumber(lot.balanceAvailable)} · {lot.qualityStatus}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantidade ({line.componentUnit})</Label>
                <Input type="number" min="0" step="0.0001" value={draft.quantity} onChange={(event) => setDrafts((current) => ({ ...current, [line.componentId]: { ...draft, quantity: event.target.value } }))} />
              </div>
              <div className="flex items-end text-xs text-muted-foreground">
                {line.quantity} por unidade · perda {line.wastePercentage}%
              </div>
            </div>
          );
        })}
        {bomLines.length > 0 && !['completed', 'cancelled'].includes(order.status) ? (
          <Button onClick={handleReserve} disabled={submitting}>{submitting ? 'Reservando…' : 'Reservar materiais selecionados'}</Button>
        ) : null}

        {reservations.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Consumido</TableHead><TableHead className="text-right">Liberado</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {reservations.map((reservation) => {
                const line = bomLines.find((candidate) => candidate.componentId === reservation.component_id);
                const lot = lots.find((candidate) => candidate.id === reservation.lot_id);
                const active = reservation.reserved_qty - reservation.consumed_qty - reservation.released_qty;
                return (
                  <TableRow key={reservation.id}>
                    <TableCell>{line?.componentCode ?? reservation.component_id}</TableCell>
                    <TableCell>{lot?.lotNumber ?? reservation.lot_id}</TableCell>
                    <TableCell className="text-right">{formatNumber(reservation.reserved_qty)}</TableCell>
                    <TableCell className="text-right">{formatNumber(reservation.consumed_qty)}</TableCell>
                    <TableCell className="text-right">{formatNumber(reservation.released_qty)}</TableCell>
                    <TableCell><Badge variant="outline">{reservation.status}</Badge></TableCell>
                    <TableCell>{active > 0 && !['completed', 'cancelled'].includes(order.status) ? <Button size="sm" variant="ghost" onClick={() => void handleRelease(reservation)}><Unlock className="mr-1 h-3.5 w-3.5" />Liberar</Button> : null}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface StepProgressPanelProps {
  order: ProductionOrderRow;
  steps: ProductionOrderStep[];
  loading: boolean;
  onChanged: () => Promise<void> | void;
}

export function OrderStepProgressPanel({ order, steps, loading, onChanged }: StepProgressPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, { produced: string; rejected: string; operator: string }>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(steps.map((step) => [step.id, { produced: '', rejected: '', operator: '' }])));
  }, [steps]);

  const submit = async (step: ProductionOrderStep, action: 'start' | 'progress' | 'pause' | 'complete') => {
    const draft = drafts[step.id] ?? { produced: '', rejected: '', operator: '' };
    const produced = action === 'complete' && draft.produced === '' ? step.quantity_pending : Number(draft.produced || 0);
    const rejected = Number(draft.rejected || 0);
    setSubmittingId(step.id);
    try {
      await recordProductionStepProgress({
        productionOrderStepId: step.id,
        action,
        producedQuantity: action === 'start' || action === 'pause' ? 0 : produced,
        rejectedQuantity: action === 'start' || action === 'pause' ? 0 : rejected,
        operatorName: draft.operator || null,
      });
      toast.success(action === 'complete' ? 'Etapa concluída' : 'Apontamento registrado');
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao apontar etapa');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" /> Apontamento sequencial das operações</CardTitle>
        <CardDescription>Quantidades são incrementais. A etapa seguinte só recebe meta a partir da quantidade boa concluída na etapa anterior.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Carregando etapas…</p> : null}
        {!loading && steps.length === 0 ? <p className="text-sm text-destructive">Nenhuma etapa foi gerada pelo roteiro. A conclusão permanecerá bloqueada.</p> : null}
        {steps.map((step) => {
          const draft = drafts[step.id] ?? { produced: '', rejected: '', operator: '' };
          const busy = submittingId === step.id;
          return (
            <div key={step.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{step.sequence}. {step.step_name ?? 'Operação'}</p>
                  <p className="text-xs text-muted-foreground">Boa {formatNumber(step.quantity_produced)} · Rejeitada {formatNumber(step.quantity_rejected)} · Pendente {formatNumber(step.quantity_pending)} {order.unit}</p>
                </div>
                <Badge variant={step.status === 'completed' ? 'default' : 'outline'}>{step.status}</Badge>
              </div>
              {step.status !== 'completed' && !['completed', 'cancelled'].includes(order.status) ? (
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_auto_auto_auto_auto]">
                  <Input type="number" min="0" step="0.0001" placeholder="Qtd. boa incremental" value={draft.produced} onChange={(event) => setDrafts((current) => ({ ...current, [step.id]: { ...draft, produced: event.target.value } }))} />
                  <Input type="number" min="0" step="0.0001" placeholder="Rejeito incremental" value={draft.rejected} onChange={(event) => setDrafts((current) => ({ ...current, [step.id]: { ...draft, rejected: event.target.value } }))} />
                  <Input placeholder="Operador" value={draft.operator} onChange={(event) => setDrafts((current) => ({ ...current, [step.id]: { ...draft, operator: event.target.value } }))} />
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void submit(step, 'start')}><Play className="mr-1 h-3.5 w-3.5" />Iniciar</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void submit(step, 'progress')}>Apontar parcial</Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void submit(step, 'pause')}>Pausar</Button>
                  <Button size="sm" disabled={busy} onClick={() => void submit(step, 'complete')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Concluir etapa</Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
