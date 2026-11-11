import { useEffect, useMemo, useState } from "react";
import { AlertCircle, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/ui/base/alert";
import { Button } from "@/ui/base/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui/base/dialog";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { Textarea } from "@/ui/base/textarea";
import { scheduleFocusInvalid } from "@/ui/base/focusInvalid";
import { useProducts } from "@/hooks/inventory/useProducts";
import { useSuppliers } from "@/hooks/purchasing/useSuppliers";
import { useFiberReceipt, type FiberReceiptResult } from "@/hooks/wms/useFiberReceipt";
import { isFiberProduct } from "@/lib/pcp/productFilters";
import { toSafeNumber } from "@/lib/numericValidation";
import {
  fiberReceiptIssue,
  validateFiberClassification,
  type FiberClassification,
  type FiberReceiptFormValues,
} from "@/lib/wms/fiberReceipt";

const emptyForm: FiberReceiptFormValues = {
  product_id: "",
  supplier_id: null,
  supplier_name: "",
  lot_number: "",
  quantity_kg: null,
  location: "",
  origin_reference: "",
  unit_cost: null,
  bale_count: null,
  gross_weight_kg: null,
  net_weight_kg: null,
  moisture_pct: null,
  micronaire: null,
  staple_length_mm: null,
  strength_g_tex: null,
  trash_pct: null,
  color_grade: "",
  classification_grade: "",
  notes: "",
};

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `fiber-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function OptionalNumberField({
  label,
  value,
  onChange,
  step = "0.01",
  field,
  invalid = false,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  step?: string;
  /** QA-UX r6: chave do campo para o foco apos validacao. */
  field?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        step={step}
        data-field={field}
        aria-invalid={invalid || undefined}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : toSafeNumber(event.target.value))}
      />
    </div>
  );
}

export function FiberClassificationFields({
  values,
  onChange,
  invalidField = null,
}: {
  values: FiberClassification;
  onChange: (patch: Partial<FiberClassification>) => void;
  /** QA-UX r6: campo que falhou na validacao, para marcar e focar. */
  invalidField?: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <OptionalNumberField field="bale_count" invalid={invalidField === "bale_count"} label="Fardos" step="1" value={values.bale_count} onChange={(v) => onChange({ bale_count: v })} />
        <OptionalNumberField field="gross_weight_kg" invalid={invalidField === "gross_weight_kg"} label="Peso bruto (kg)" value={values.gross_weight_kg} onChange={(v) => onChange({ gross_weight_kg: v })} />
        <OptionalNumberField field="net_weight_kg" invalid={invalidField === "net_weight_kg"} label="Peso líquido (kg)" value={values.net_weight_kg} onChange={(v) => onChange({ net_weight_kg: v })} />
        <OptionalNumberField field="moisture_pct" invalid={invalidField === "moisture_pct"} label="Umidade (%)" value={values.moisture_pct} onChange={(v) => onChange({ moisture_pct: v })} />
        <OptionalNumberField field="micronaire" invalid={invalidField === "micronaire"} label="Micronaire" value={values.micronaire} onChange={(v) => onChange({ micronaire: v })} />
        <OptionalNumberField field="staple_length_mm" invalid={invalidField === "staple_length_mm"} label="Comprimento (mm)" value={values.staple_length_mm} onChange={(v) => onChange({ staple_length_mm: v })} />
        <OptionalNumberField field="strength_g_tex" invalid={invalidField === "strength_g_tex"} label="Resistência (gf/tex)" value={values.strength_g_tex} onChange={(v) => onChange({ strength_g_tex: v })} />
        <OptionalNumberField field="trash_pct" invalid={invalidField === "trash_pct"} label="Impurezas (%)" value={values.trash_pct} onChange={(v) => onChange({ trash_pct: v })} />
        <div>
          <Label>Classe da fibra</Label>
          <Input value={values.classification_grade ?? ""} onChange={(e) => onChange({ classification_grade: e.target.value })} />
        </div>
        <div>
          <Label>Cor / grade</Label>
          <Input value={values.color_grade ?? ""} onChange={(e) => onChange({ color_grade: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Observações da classificação</Label>
        <Textarea rows={2} value={values.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
    </div>
  );
}

export function FiberReceiptDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: FiberReceiptResult) => void;
}) {
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { register, saving } = useFiberReceipt();
  const [form, setForm] = useState<FiberReceiptFormValues>(emptyForm);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);

  const productOptions = useMemo(() => {
    const active = products.filter((product) => product.status !== "inactive");
    const fibers = active.filter(isFiberProduct);
    return fibers.length > 0 ? fibers : active;
  }, [products]);

  useEffect(() => {
    if (open) { setError(null); setInvalidField(null); }
  }, [open ]);

  const patch = (change: Partial<FiberReceiptFormValues>) => {
    setForm((current) => ({ ...current, ...change }));
    setError(null);
    setInvalidField(null);
  };

  const submit = async () => {
    const issue = fiberReceiptIssue(form);
    if (issue) {
      setError(issue.message);
      setInvalidField(issue.field);
      // QA-UX r6: leva o teclado ao campo que precisa ser corrigido.
      scheduleFocusInvalid(() => document.querySelector('[role="dialog"]'), issue.field);
      return;
    }
    try {
      const result = await register(form, idempotencyKey);
      toast.success(`Lote ${result.lot_number} recebido`, {
        description: "Saldo criado pelo lote e aguardando inspeção de qualidade para liberar ao PCP.",
      });
      onSuccess?.(result);
      setForm(emptyForm);
      setError(null);
      setInvalidField(null);
      setIdempotencyKey(newIdempotencyKey());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar recebimento da fibra.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" /> Receber pluma / fibra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              O recebimento cria o lote e o saldo pelo mesmo lote. Ele nasce <strong>pendente de qualidade</strong>;
              após a aprovação no Controle de Qualidade, o PCP poderá reservá-lo para a fiação.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Produto de fibra/pluma *</Label>
              <Select value={form.product_id} onValueChange={(value) => patch({ product_id: value })}>
                <SelectTrigger data-field="product_id" aria-invalid={invalidField === "product_id" || undefined}>
                  <SelectValue placeholder={productsLoading ? "Carregando produtos…" : "Selecione o produto"} />
                </SelectTrigger>
                <SelectContent>
                  {productOptions.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.code} — {product.name} ({product.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor *</Label>
              <Select
                value={form.supplier_id ?? "manual"}
                onValueChange={(value) => {
                  if (value === "manual") {
                    patch({ supplier_id: null, supplier_name: "" });
                    return;
                  }
                  const supplier = suppliers.find((item) => item.id === value);
                  patch({ supplier_id: value, supplier_name: supplier?.name ?? "" });
                }}
              >
                <SelectTrigger data-field="supplier_id" aria-invalid={invalidField === "supplier_id" || undefined}>
                  <SelectValue placeholder={suppliersLoading ? "Carregando fornecedores…" : "Selecione o fornecedor"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Informar nome manualmente</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.supplier_id && (
                <div className="mt-2 space-y-1">
                  {/* QA-UX r12: o `<Label>Fornecedor *</Label>` acima nomeia o
                      select; este campo manual precisa do seu PROPRIO rotulo
                      visivel. So o placeholder nao e nome acessivel. */}
                  <Label htmlFor="fiber-receipt-supplier-name">
                    Nome do fornecedor (informar manualmente) *
                  </Label>
                  <Input
                    id="fiber-receipt-supplier-name"
                    placeholder="Nome do fornecedor"
                    data-field="supplier_name"
                    aria-invalid={invalidField === "supplier_name" || undefined}
                    value={form.supplier_name}
                    onChange={(event) => patch({ supplier_name: event.target.value })}
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Lote do fornecedor *</Label>
              <Input
                data-field="lot_number"
                aria-invalid={invalidField === "lot_number" || undefined}
                value={form.lot_number}
                onChange={(event) => patch({ lot_number: event.target.value })}
              />
            </div>
            <div>
              <Label>Peso que entrará no estoque (kg) *</Label>
              <Input
                type="number"
                min={0}
                step="0.001"
                data-field="quantity_kg"
                aria-invalid={invalidField === "quantity_kg" || undefined}
                value={form.quantity_kg ?? ""}
                onChange={(event) => patch({ quantity_kg: event.target.value === "" ? null : toSafeNumber(event.target.value) })}
              />
            </div>
            <div>
              <Label>Documento / NF-e</Label>
              <Input value={form.origin_reference} onChange={(event) => patch({ origin_reference: event.target.value })} />
            </div>
            <div>
              <Label>Endereço / localização</Label>
              <Input value={form.location} onChange={(event) => patch({ location: event.target.value })} />
            </div>
            <OptionalNumberField label="Custo unitário (R$/kg, opcional)" value={form.unit_cost} onChange={(v) => patch({ unit_cost: v })} />
          </div>

          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Classificação da fibra</h3>
              <p className="text-xs text-muted-foreground">
                Preencha somente o que foi pesado ou informado no laudo. Campo vazio permanece como “não informado”.
              </p>
            </div>
            <FiberClassificationFields values={form} onChange={(change) => patch(change)} invalidField={invalidField} />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Recebendo…" : "Registrar recebimento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FiberClassificationDialog({
  open,
  onOpenChange,
  lotNumber,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lotNumber: string;
  initial: FiberClassification | null;
  onSave: (classification: FiberClassification) => Promise<void>;
}) {
  const [form, setForm] = useState<FiberClassification>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ?? {});
      setError(null);
    }
  }, [initial, open]);

  const submit = async () => {
    const validationError = validateFiberClassification(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      toast.success(`Classificação do lote ${lotNumber} salva`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar a classificação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Classificação da fibra — lote {lotNumber}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Registre somente medidas e laudos informados. Salvar em branco remove a classificação atual.
          </p>
          <FiberClassificationFields values={form} onChange={(change) => setForm((current) => ({ ...current, ...change }))} />
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar classificação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
