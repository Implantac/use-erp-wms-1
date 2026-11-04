import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/base/card";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import type { ProductionOrderRow } from "@/hooks/production/useProductionOrders";
import type { ProductionOrderStep } from "@/hooks/production/useProductionSteps";
import {
  externalStepCanComplete,
  summarizeOutsourcing,
  validateExternalReceive,
  validateExternalSend,
} from "@/lib/pcp/externalSteps";
import {
  fetchOutsourcingForOrder,
  receiveOrderStepFromSupplier,
  sendOrderStepToSupplier,
  type OutsourcingSendRow,
} from "@/services/production/externalSteps";
import { formatNumber } from "@/lib/formatters";

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const SEND_STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  partially_returned: "Retorno parcial",
  returned: "Retornado",
};

export function ExternalStepPanel({
  order,
  steps,
  onChanged,
}: {
  order: ProductionOrderRow;
  steps: ProductionOrderStep[];
  onChanged: () => Promise<void> | void;
}) {
  const externalSteps = useMemo(() => steps.filter((step) => step.is_external), [steps]);
  const [sends, setSends] = useState<OutsourcingSendRow[]>([]);
  const [sendForm, setSendForm] = useState<Record<string, { supplier: string; quantity: string; expected: string; service: string }>>({});
  const [receiveForm, setReceiveForm] = useState<Record<string, { returned: string; rejected: string }>>({});
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    try {
      setSends(await fetchOutsourcingForOrder(order.id));
    } catch {
      setSends([]);
    }
  }, [order.id]);
  useEffect(() => { void load(); }, [load]);

  if (externalSteps.length === 0) return null;

  const send = async (step: ProductionOrderStep) => {
    const form = sendForm[step.id] ?? { supplier: "", quantity: "", expected: "", service: "" };
    const stepSends = sends.filter((item) => item.production_order_step_id === step.id);
    const totals = summarizeOutsourcing(stepSends);
    const quantity = form.quantity.trim() ? Number(form.quantity) : null;
    const error = validateExternalSend({
      supplierName: form.supplier,
      quantity: quantity !== null && Number.isFinite(quantity) ? quantity : null,
      step: {
        quantityPending: step.quantity_pending,
        quantityProduced: step.quantity_produced,
        alreadySent: totals.sent,
        alreadyReturned: totals.returned,
      },
    });
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await sendOrderStepToSupplier({
        stepId: step.id,
        supplierName: form.supplier,
        quantity: quantity as number,
        expectedReturnDate: form.expected || null,
        serviceDescription: form.service || null,
        idempotencyKey,
      });
      toast.success("Envio ao fornecedor registrado");
      setIdempotencyKey(newIdempotencyKey());
      await load();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar o envio");
    } finally {
      setSaving(false);
    }
  };

  const receive = async (sendRow: OutsourcingSendRow) => {
    const form = receiveForm[sendRow.id] ?? { returned: "", rejected: "" };
    const returned = form.returned.trim() ? Number(form.returned) : 0;
    const rejected = form.rejected.trim() ? Number(form.rejected) : 0;
    const error = validateExternalReceive({
      returned: Number.isFinite(returned) ? returned : null,
      rejected: Number.isFinite(rejected) ? rejected : null,
      alreadyReturned: sendRow.quantity_returned ?? 0,
      alreadyRejected: sendRow.quantity_rejected ?? 0,
      sent: sendRow.quantity_sent,
    });
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await receiveOrderStepFromSupplier({
        outsourcingOrderId: sendRow.id,
        quantityReturned: returned,
        quantityRejected: rejected,
      });
      toast.success("Retorno do fornecedor registrado");
      await load();
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar o retorno");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Etapas externas (terceirização) desta OP</CardTitle>
        <CardDescription>
          Envie a etapa marcada como externa no roteiro ao fornecedor e registre o retorno. A etapa só
          conclui quando o retorno bom cobrir a quantidade boa apontada — o banco bloqueia o contrário.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {externalSteps.map((step) => {
          const stepSends = sends.filter((item) => item.production_order_step_id === step.id);
          const totals = summarizeOutsourcing(stepSends);
          const form = sendForm[step.id] ?? { supplier: "", quantity: "", expected: "", service: "" };
          const canComplete = externalStepCanComplete(step.quantity_produced, totals.returned);
          return (
            <section key={step.id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{step.step_name ?? "Etapa externa"}</span>
                <Badge variant="secondary">Externa</Badge>
                <span className="text-xs text-muted-foreground">
                  enviado {formatNumber(totals.sent)} · retornado {formatNumber(totals.returned)} · rejeitado {formatNumber(totals.rejected)} · pendente {formatNumber(totals.outstanding)}
                </span>
                {step.status === "completed" ? (
                  <Badge>Concluída</Badge>
                ) : step.quantity_produced > 0 ? (
                  <Badge variant={canComplete ? "default" : "destructive"}>
                    {canComplete ? "Retorno cobre a boa apontada" : "Aguardando retorno para concluir"}
                  </Badge>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1"><Label>Fornecedor</Label><Input value={form.supplier} onChange={(e) => setSendForm((cur) => ({ ...cur, [step.id]: { ...form, supplier: e.target.value } }))} /></div>
                <div className="space-y-1"><Label>Quantidade enviada</Label><Input type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => setSendForm((cur) => ({ ...cur, [step.id]: { ...form, quantity: e.target.value } }))} /></div>
                <div className="space-y-1"><Label>Retorno previsto</Label><Input type="date" value={form.expected} onChange={(e) => setSendForm((cur) => ({ ...cur, [step.id]: { ...form, expected: e.target.value } }))} /></div>
                <div className="space-y-1"><Label>Serviço</Label><Input value={form.service} onChange={(e) => setSendForm((cur) => ({ ...cur, [step.id]: { ...form, service: e.target.value } }))} /></div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void send(step)} disabled={saving || step.status === "completed"}>Registrar envio</Button>
              </div>

              {stepSends.map((sendRow) => {
                const rForm = receiveForm[sendRow.id] ?? { returned: "", rejected: "" };
                const closed = (sendRow.quantity_returned ?? 0) + (sendRow.quantity_rejected ?? 0) >= sendRow.quantity_sent;
                return (
                  <div key={sendRow.id} className="space-y-2 rounded-md bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{sendRow.supplier_name}</span>
                      <span className="text-xs text-muted-foreground">
                        enviado {formatNumber(sendRow.quantity_sent)} em {new Date(sendRow.sent_date).toLocaleDateString("pt-BR")}
                        {sendRow.expected_return_date ? ` · previsto ${new Date(sendRow.expected_return_date).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                      <Badge variant={sendRow.status === "returned" ? "default" : "secondary"}>{SEND_STATUS_LABELS[sendRow.status] ?? sendRow.status}</Badge>
                    </div>
                    {!closed && (
                      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <div className="space-y-1"><Label>Retornado (bom)</Label><Input type="number" min="0" step="0.001" value={rForm.returned} onChange={(e) => setReceiveForm((cur) => ({ ...cur, [sendRow.id]: { ...rForm, returned: e.target.value } }))} /></div>
                        <div className="space-y-1"><Label>Rejeitado no fornecedor</Label><Input type="number" min="0" step="0.001" value={rForm.rejected} onChange={(e) => setReceiveForm((cur) => ({ ...cur, [sendRow.id]: { ...rForm, rejected: e.target.value } }))} /></div>
                        <div className="flex items-end"><Button size="sm" variant="outline" onClick={() => void receive(sendRow)} disabled={saving}>Registrar retorno</Button></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
