import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { REWORK_STATUS_LABELS, validateReworkDraft } from "@/lib/production/reworkOrders";
import {
  createReworkOrder,
  fetchOrderNumbers,
  fetchOriginalOrderOptions,
  fetchReworksForLot,
  type OriginalOrderOption,
  type ReworkOrderRow,
} from "@/services/production/reworkOrders";

const NONE = "__none__";

export interface ReworkLotLike {
  id: string;
  lotNumber: string;
  productId?: string;
  productName: string;
  remainingQty: number;
  status: string;
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rework-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ReworkOrderDialog({
  open,
  onOpenChange,
  lot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: ReworkLotLike | null;
}) {
  const [orders, setOrders] = useState<OriginalOrderOption[]>([]);
  const [reworks, setReworks] = useState<ReworkOrderRow[]>([]);
  const [orderNumbers, setOrderNumbers] = useState<Map<string, string>>(new Map());
  const [originalOrderId, setOriginalOrderId] = useState(NONE);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!lot?.productId) return;
    setLoading(true);
    setError(null);
    try {
      const [orderRows, reworkRows] = await Promise.all([
        fetchOriginalOrderOptions(lot.productId),
        fetchReworksForLot(lot.id),
      ]);
      setOrders(orderRows);
      setReworks(reworkRows);
      const ids = [...new Set(reworkRows.flatMap((row) => [row.original_order_id, row.rework_order_id]))];
      setOrderNumbers(await fetchOrderNumbers(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar reprocessos do lote.");
    } finally {
      setLoading(false);
    }
  }, [lot]);

  useEffect(() => {
    if (open && lot) {
      setOriginalOrderId(NONE);
      setQuantity(String(lot.remainingQty || ""));
      setReason("");
      void load();
    }
  }, [load, lot, open]);

  if (!lot) return null;

  const create = async () => {
    const parsedQuantity = quantity.trim() ? Number(quantity) : null;
    const validationError = validateReworkDraft({
      originalOrderId: originalOrderId === NONE ? null : originalOrderId,
      quantity: parsedQuantity !== null && Number.isFinite(parsedQuantity) ? parsedQuantity : null,
      lotRemaining: lot.remainingQty,
      reason,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const result = await createReworkOrder({
        originalOrderId,
        originalLotId: lot.id,
        quantity: parsedQuantity as number,
        reason: reason.trim(),
        idempotencyKey,
      });
      toast.success(`OP de reprocesso ${result.rework_order_number ?? ""} criada — execute e conclua pelo PCP`);
      setIdempotencyKey(newIdempotencyKey());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar o reprocesso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reprocesso do lote {lot.lotNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              O reprocesso cria uma OP própria vinculada à OP original e a este lote. Ao concluir pelo PCP,
              o lote original é consumido e o lote resultante nasce com a genealogia registrada — a produção
              boa substitui a do lote original, sem contagem dupla.
            </AlertDescription>
          </Alert>

          {!lot.productId ? (
            <p className="text-sm text-muted-foreground">Este lote não tem produto vinculado; vincule o produto antes de reprocessar.</p>
          ) : (
            <section className="space-y-3 rounded-md border p-3">
              <h3 className="text-sm font-semibold">Novo reprocesso</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>OP original do lote</Label>
                  <Select value={originalOrderId} onValueChange={setOriginalOrderId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Selecione</SelectItem>
                      {orders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>OP {order.order_number} · {order.status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantidade a reprocessar (restam {lot.remainingQty})</Label>
                  <Input type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Motivo do reprocesso</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: motivo registrado pela qualidade/empresa" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={create} disabled={saving || loading}>Criar OP de reprocesso</Button>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Reprocessos deste lote ({reworks.length})</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : reworks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum reprocesso registrado para este lote.</p>
            ) : reworks.map((rework) => (
              <div key={rework.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-sm font-medium">OP {orderNumbers.get(rework.rework_order_id) ?? "…"}</span>
                <span className="text-xs text-muted-foreground">origem OP {orderNumbers.get(rework.original_order_id) ?? "…"}</span>
                <span className="text-sm">{rework.quantity}</span>
                <Badge variant={rework.status === "completed" ? "default" : "secondary"}>{REWORK_STATUS_LABELS[rework.status] ?? rework.status}</Badge>
                <span className="text-xs text-muted-foreground">{rework.reason}</span>
              </div>
            ))}
          </section>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
