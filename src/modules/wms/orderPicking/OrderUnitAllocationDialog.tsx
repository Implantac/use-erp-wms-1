import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Checkbox } from "@/ui/base/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { useStockLotUnits } from "@/hooks/wms/useStockLotUnits";
import {
  formatStockLotUnitMeasures,
  validateUnitAllocationSelection,
  type StockLotUnit,
  type UnitAllocationCapacity,
} from "@/lib/wms/stockLotUnits";
import {
  allocateUnitsToOrder,
  fetchOrderReservations,
  fetchOrderUnitAllocations,
  releaseUnitAllocation,
  type OrderReservationForUnits,
  type StockLotUnitAllocation,
} from "@/services/wms/stockLotUnitAllocations";

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `unit-allocation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const allocationLabels: Record<StockLotUnitAllocation["status"], string> = {
  allocated: "Vinculado",
  picked: "Separado",
  shipped: "Expedido",
  released: "Liberado",
};

export function OrderUnitAllocationDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: { id: string; number: string } | null;
}) {
  const { units, fetchUnits } = useStockLotUnits();
  const [reservations, setReservations] = useState<OrderReservationForUnits[]>([]);
  const [allocations, setAllocations] = useState<StockLotUnitAllocation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    try {
      const [reservationRows, allocationRows] = await Promise.all([
        fetchOrderReservations(order.id),
        fetchOrderUnitAllocations(order.id),
        fetchUnits(),
      ]);
      setReservations(reservationRows);
      setAllocations(allocationRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar rolos do pedido.");
    } finally {
      setLoading(false);
    }
  }, [fetchUnits, order]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      void load();
    }
  }, [load, open]);

  const capacities = useMemo<UnitAllocationCapacity[]>(() => {
    const map = new Map<string, UnitAllocationCapacity>();
    for (const reservation of reservations) {
      if (!reservation.lot_id || !["reserved", "picked"].includes(reservation.status)) continue;
      const current = map.get(reservation.lot_id) ?? { lot_id: reservation.lot_id, capacity: 0, allocated: 0 };
      current.capacity += reservation.status === "picked" ? Number(reservation.picked_qty || 0) : Number(reservation.reserved_qty || 0);
      map.set(reservation.lot_id, current);
    }
    for (const allocation of allocations) {
      if (!["allocated", "picked"].includes(allocation.status)) continue;
      const current = map.get(allocation.lot_id);
      if (current) current.allocated += Number(allocation.quantity || 0);
    }
    return [...map.values()];
  }, [allocations, reservations]);

  const allocatedUnitIds = useMemo(
    () => new Set(allocations.filter((a) => ["allocated", "picked", "shipped"].includes(a.status)).map((a) => a.unit_id)),
    [allocations],
  );

  const candidates = useMemo(
    () => units.filter((unit) => capacities.some((c) => c.lot_id === unit.lot_id)
      && unit.quality_status === "approved" && unit.status === "packed" && !allocatedUnitIds.has(unit.id)),
    [allocatedUnitIds, capacities, units],
  );

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  if (!order) return null;

  const toggle = (unit: StockLotUnit, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(unit.id);
      else next.delete(unit.id);
      return next;
    });
    setError(null);
  };

  const allocate = async () => {
    const chosen = candidates.filter((unit) => selected.has(unit.id));
    const validationError = validateUnitAllocationSelection(chosen, capacities);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const result = await allocateUnitsToOrder(order.id, chosen.map((unit) => unit.id), idempotencyKey);
      toast.success(`${result.unit_count} rolo(s)/peça(s) vinculados ao pedido ${order.number}`);
      setSelected(new Set());
      setIdempotencyKey(newIdempotencyKey());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular rolos ao pedido.");
    } finally {
      setSaving(false);
    }
  };

  const release = async (allocation: StockLotUnitAllocation) => {
    setSaving(true);
    try {
      await releaseUnitAllocation(allocation.id);
      toast.success("Rolo/peça liberado do pedido");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao liberar rolo/peça.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Rolos/peças do pedido {order.number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Vincule os rolos embalados e aprovados dos lotes reservados. Ao separar, eles acompanham a reserva;
              ao expedir, são marcados como expedidos. Sem vínculo, a expedição segue por lote.
            </AlertDescription>
          </Alert>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Rolos disponíveis para este pedido</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : capacities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este pedido ainda não tem reserva por lote separável.</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum rolo aprovado e embalado disponível nos lotes reservados. Divida o lote em Lotes → Rolos/peças, aprove e embale.</p>
            ) : candidates.map((unit) => (
              <label key={unit.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                <Checkbox checked={selected.has(unit.id)} onCheckedChange={(checked) => toggle(unit, checked === true)} />
                <span className="font-mono text-sm font-medium">{unit.unit_code}</span>
                <span className="text-sm">{unit.quantity} {unit.unit}</span>
                {formatStockLotUnitMeasures(unit) && <span className="text-xs text-muted-foreground">{formatStockLotUnitMeasures(unit)}</span>}
                <span className="text-xs text-muted-foreground">lote {unit.lot_number}</span>
                <Badge className="ml-auto">Embalado</Badge>
              </label>
            ))}
            {candidates.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={allocate} disabled={saving || selected.size === 0}>
                  Vincular selecionados ({selected.size})
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Rolos vinculados ({allocations.filter((a) => a.status !== "released").length})</h3>
            {allocations.filter((a) => a.status !== "released").length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum rolo vinculado ainda.</p>
            ) : allocations.filter((a) => a.status !== "released").map((allocation) => {
              const unit = unitById.get(allocation.unit_id);
              return (
                <div key={allocation.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                  <span className="font-mono text-sm font-medium">{unit?.unit_code ?? allocation.unit_id}</span>
                  <span className="text-sm">{allocation.quantity} {unit?.unit ?? ""}</span>
                  <span className="text-xs text-muted-foreground">lote {unit?.lot_number ?? ""}</span>
                  <Badge variant={allocation.status === "shipped" ? "default" : "secondary"}>{allocationLabels[allocation.status]}</Badge>
                  {allocation.status !== "shipped" && (
                    <Button size="sm" variant="outline" className="ml-auto" onClick={() => release(allocation)} disabled={saving}>
                      Liberar
                    </Button>
                  )}
                </div>
              );
            })}
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
