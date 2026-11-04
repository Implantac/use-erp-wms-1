import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Textarea } from "@/ui/base/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import type { Decision, Lot } from "./types";
import { formatFiberClassificationSummary } from "@/lib/wms/fiberReceipt";

export function InspectDialog({
  open,
  onOpenChange,
  lot,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lot: Lot | null;
  saving: boolean;
  onSubmit: (params: {
    lot: Lot;
    decision: Decision;
    reason: string;
    notes: string;
    sampleSize: number;
    defects: number;
  }) => Promise<boolean>;
}) {
  const [decision, setDecision] = useState<Decision>("approved");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [sampleSize, setSampleSize] = useState(0);
  const [defects, setDefects] = useState(0);

  useEffect(() => {
    if (open) {
      setDecision("approved");
      setReason("");
      setNotes("");
      setSampleSize(0);
      setDefects(0);
    }
  }, [open]);

  const submit = async () => {
    if (!lot) return;
    const ok = await onSubmit({ lot, decision, reason, notes, sampleSize, defects });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Inspeção de Qualidade — Lote {lot?.lot_number}</DialogTitle>
        </DialogHeader>
        {lot && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <strong>{lot.product_code}</strong> · {lot.product_name} · Fornecedor {lot.supplier ?? "—"}
              {formatFiberClassificationSummary(lot.fiber_classification) && (
                <div className="mt-1 text-xs">
                  Classificação informada: {formatFiberClassificationSummary(lot.fiber_classification)}
                </div>
              )}
            </div>
            <div>
              <Label>Decisão</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Aprovar — liberar para armazenagem</SelectItem>
                  <SelectItem value="quarantine">Quarentena — bloquear movimentação</SelectItem>
                  <SelectItem value="rejected">Rejeitar — devolver ao fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tamanho da amostra</Label>
                <Input type="number" min={0} value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))} />
              </div>
              <div>
                <Label>Defeitos encontrados</Label>
                <Input type="number" min={0} value={defects} onChange={(e) => setDefects(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Motivo {decision !== "approved" && <span className="text-red-500">*</span>}</Label>
              <Input
                placeholder="Ex.: avaria de transporte, validade curta, embalagem violada"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || (decision !== "approved" && !reason.trim())}>
            {saving ? "Registrando…" : "Registrar inspeção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
