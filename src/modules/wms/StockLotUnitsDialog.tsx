import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, PackageCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import type { StockLot } from "@/hooks/wms/useWMSLots";
import { useStockLotUnits } from "@/hooks/wms/useStockLotUnits";
import { toSafeNumber } from "@/lib/numericValidation";
import {
  formatStockLotUnitMeasures,
  stockLotUnitTypeLabels,
  type StockLotUnit,
  type StockLotUnitDraft,
  type StockLotUnitType,
} from "@/lib/wms/stockLotUnits";

const emptyDraft = (): StockLotUnitDraft => ({
  unit_code: "",
  unit_type: "roll",
  quantity: null,
  length_m: null,
  width_cm: null,
  weight_kg: null,
  location: "",
});

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `lot-units-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const qualityLabels: Record<StockLotUnit["quality_status"], string> = {
  pending: "Inspeção pendente",
  approved: "Aprovado",
  quarantine: "Quarentena",
  rejected: "Rejeitado",
  blocked: "Bloqueado",
};

const statusLabels: Record<StockLotUnit["status"], string> = {
  available: "Disponível",
  reserved: "Reservado",
  packed: "Embalado",
  shipped: "Expedido",
  consumed: "Consumido",
  blocked: "Bloqueado",
};

export function StockLotUnitsDialog({
  open,
  onOpenChange,
  lot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: StockLot | null;
}) {
  const { units, loading, saving, fetchUnits, registerUnits, inspectUnit, setPackingStatus } = useStockLotUnits();
  const [drafts, setDrafts] = useState<StockLotUnitDraft[]>([emptyDraft()]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [defects, setDefects] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const existingTotal = useMemo(
    () => units.reduce((sum, unit) => sum + Number(unit.quantity || 0), 0),
    [units],
  );
  const draftTotal = useMemo(
    () => drafts.reduce((sum, draft) => sum + Number(draft.quantity || 0), 0),
    [drafts],
  );

  const load = useCallback(async () => {
    if (!lot) return;
    try {
      await fetchUnits(lot.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar rolos/peças do lote.");
    }
  }, [fetchUnits, lot]);

  useEffect(() => {
    if (open) {
      setDrafts([emptyDraft()]);
      setError(null);
      void load();
    }
  }, [load, open]);

  if (!lot) return null;

  const patchDraft = (index: number, patch: Partial<StockLotUnitDraft>) => {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
    setError(null);
  };

  const submitDrafts = async () => {
    try {
      const result = await registerUnits(lot.id, drafts, existingTotal, lot.quantity, idempotencyKey);
      toast.success(`${result.unit_count} rolo(s)/peça(s) registrados no lote ${lot.lotNumber}`);
      setDrafts([emptyDraft()]);
      setIdempotencyKey(newIdempotencyKey());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar rolos/peças.");
    }
  };

  const decide = async (unit: StockLotUnit, decision: "approved" | "quarantine" | "rejected") => {
    try {
      await inspectUnit(unit.id, decision, reasons[unit.id], defects[unit.id] ?? 0);
      toast.success(`Rolo/peça ${unit.unit_code}: ${qualityLabels[decision]}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao inspecionar rolo/peça.");
    }
  };

  const togglePacking = async (unit: StockLotUnit) => {
    try {
      await setPackingStatus(unit.id, unit.status === "packed" ? "available" : "packed");
      toast.success(unit.status === "packed" ? `Embalagem desfeita: ${unit.unit_code}` : `Embalado: ${unit.unit_code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar embalagem do rolo/peça.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rolos e peças — lote {lot.lotNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-4">
            <p>Produto<br /><strong>{lot.productCode} — {lot.productName}</strong></p>
            <p>Quantidade do lote<br /><strong>{lot.quantity}</strong></p>
            <p>Restante no lote<br /><strong>{lot.remainingQty}</strong></p>
            <p>Já dividido<br /><strong>{existingTotal}</strong></p>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Rolos/peças identificam fisicamente o lote, mas não criam outro saldo. A soma das unidades não pode
              passar da quantidade do lote; cada unidade precisa ser aprovada antes de embalar.
            </AlertDescription>
          </Alert>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Nova divisão em rolos/peças</h3>
              <Button size="sm" variant="outline" onClick={() => setDrafts((current) => [...current, emptyDraft()])}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
            {drafts.map((draft, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1.2fr_.8fr_.8fr_.8fr_.8fr_.8fr_auto]">
                <div><Label>Código/etiqueta</Label><Input value={draft.unit_code} onChange={(e) => patchDraft(index, { unit_code: e.target.value })} placeholder="ROLO-001" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={draft.unit_type} onValueChange={(v) => patchDraft(index, { unit_type: v as StockLotUnitType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(stockLotUnitTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Quantidade</Label><Input type="number" min={0} step="0.001" value={draft.quantity ?? ""} onChange={(e) => patchDraft(index, { quantity: e.target.value === "" ? null : toSafeNumber(e.target.value) })} /></div>
                <div><Label>Comprimento (m)</Label><Input type="number" min={0} step="0.001" value={draft.length_m ?? ""} onChange={(e) => patchDraft(index, { length_m: e.target.value === "" ? null : toSafeNumber(e.target.value) })} /></div>
                <div><Label>Largura (cm)</Label><Input type="number" min={0} step="0.001" value={draft.width_cm ?? ""} onChange={(e) => patchDraft(index, { width_cm: e.target.value === "" ? null : toSafeNumber(e.target.value) })} /></div>
                <div><Label>Peso (kg)</Label><Input type="number" min={0} step="0.001" value={draft.weight_kg ?? ""} onChange={(e) => patchDraft(index, { weight_kg: e.target.value === "" ? null : toSafeNumber(e.target.value) })} /></div>
                <div className="flex items-end">
                  <Button size="icon" variant="ghost" onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} disabled={drafts.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="md:col-span-7"><Label>Localização</Label><Input value={draft.location ?? ""} onChange={(e) => patchDraft(index, { location: e.target.value })} placeholder={lot.location || "Endereço do rolo/peça"} /></div>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total desta divisão: <strong>{draftTotal}</strong> · Total após registrar: <strong>{existingTotal + draftTotal}</strong> / {lot.quantity}</span>
              <Button onClick={submitDrafts} disabled={saving || loading}>Registrar rolos/peças</Button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Unidades registradas ({units.length})</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando unidades…</p>
            ) : units.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum rolo/peça registrado para este lote ainda.</p>
            ) : units.map((unit) => (
              <div key={unit.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-mono text-sm">{unit.unit_code}</strong>
                  <Badge variant="outline">{stockLotUnitTypeLabels[unit.unit_type]}</Badge>
                  <span className="text-sm">{unit.quantity} {unit.unit}</span>
                  {formatStockLotUnitMeasures(unit) && <span className="text-xs text-muted-foreground">{formatStockLotUnitMeasures(unit)}</span>}
                  <Badge variant={unit.quality_status === "approved" ? "default" : unit.quality_status === "rejected" ? "destructive" : "outline"}>{qualityLabels[unit.quality_status]}</Badge>
                  <Badge variant={unit.status === "packed" ? "default" : "secondary"}>{statusLabels[unit.status]}</Badge>
                  {unit.location && <span className="text-xs text-muted-foreground">{unit.location}</span>}
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
                  <Input
                    placeholder="Motivo (obrigatório para quarentena/rejeição)"
                    value={reasons[unit.id] ?? ""}
                    onChange={(e) => setReasons((current) => ({ ...current, [unit.id]: e.target.value }))}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Defeitos"
                    value={defects[unit.id] ?? ""}
                    onChange={(e) => setDefects((current) => ({ ...current, [unit.id]: e.target.value === "" ? 0 : toSafeNumber(e.target.value) }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => decide(unit, "approved")} disabled={saving}><CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(unit, "quarantine")} disabled={saving}>Quarentena</Button>
                    <Button size="sm" variant="destructive" onClick={() => decide(unit, "rejected")} disabled={saving}>Rejeitar</Button>
                    {unit.quality_status === "approved" && unit.status === "available" && (
                      <Button size="sm" variant="secondary" onClick={() => togglePacking(unit)} disabled={saving}><PackageCheck className="mr-1 h-4 w-4" /> Embalar</Button>
                    )}
                    {unit.status === "packed" && (
                      <Button size="sm" variant="outline" onClick={() => togglePacking(unit)} disabled={saving}>Desfazer embalagem</Button>
                    )}
                  </div>
                </div>
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
